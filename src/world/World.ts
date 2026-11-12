import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import type { Effect, Element } from "../lib/character";
import { buildCampfire, buildCloud, buildDog, buildHero, buildIsland, buildMill, buildTree, buildWater, SPOTS, TERRAIN, type Dog, type Hero, type Island, type Mill, type Tree } from "./models";
import { skyAt, type Sky } from "./sky";
import { hash } from "./voxel";

export interface WorldState {
  /** Share of each element in the last 7 days (0–1) and its buff/debuff. */
  shares: Record<Element, number>;
  effects: Record<Element, Effect>;
  /** Enough activity for the shares to mean something (otherwise everything idles at a calm middle). */
  enough: boolean;
  date: Date;
}

export type Hit = "hero" | "dog" | Element;

const U = TERRAIN;
const HERO_SCALE = 1.22;
const spot = (s: readonly [number, number], y = 0) => new Vector3(s[0] * U, y, s[1] * U);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

/** Fixed pool of little cubes: flames, smoke, sparks, water. One draw call per pool. */
class Particles {
  mesh: InstancedMesh;
  private p: Float32Array; // x y z vx vy vz
  private meta: Float32Array; // life, maxLife, size, gravity
  private fade: (Color | null)[]; // optional second colour the particle turns into
  private from: Color[];
  private cursor = 0;
  private m = new Matrix4();
  private c = new Color();
  constructor(private n: number, material: Material) {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, n);
    this.mesh.frustumCulled = false;
    this.p = new Float32Array(n * 6);
    this.meta = new Float32Array(n * 4);
    this.fade = new Array(n).fill(null);
    this.from = Array.from({ length: n }, () => new Color());
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity = 0, color2?: number) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.n;
    this.p.set([x, y, z, vx, vy, vz], i * 6);
    this.meta.set([life, life, size, gravity], i * 4);
    this.from[i].set(color);
    this.fade[i] = color2 === undefined ? null : new Color(color2);
    this.mesh.setColorAt(i, this.c.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt: number) {
    const { p, meta, m } = this;
    let recolor = false;
    for (let i = 0; i < this.n; i++) {
      const life = meta[i * 4];
      if (life <= 0) continue;
      const left = life - dt;
      meta[i * 4] = left;
      const o = i * 6;
      p[o + 4] += meta[i * 4 + 3] * dt;
      p[o] += p[o + 3] * dt;
      p[o + 1] += p[o + 4] * dt;
      p[o + 2] += p[o + 5] * dt;
      const k = Math.max(0, left / meta[i * 4 + 1]);
      // pop in quickly, shrink away
      const s = left <= 0 ? 0 : meta[i * 4 + 2] * Math.min(1, (1 - k) * 8) * (0.25 + 0.75 * k);
      m.makeScale(s, s, s).setPosition(p[o], p[o + 1], p[o + 2]);
      this.mesh.setMatrixAt(i, m);
      const f = this.fade[i];
      if (f) {
        this.mesh.setColorAt(i, this.c.copy(this.from[i]).lerp(f, 1 - k));
        recolor = true;
      }
    }
    if (recolor && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function glowTexture(inner: string, outer: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.22, inner);
  grad.addColorStop(0.3, outer);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

type HeroAction = "idle" | "box" | "cheer" | "wave" | "pet";

export class World {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(28, 1, 0.5, 120);
  private stage = new Group();
  private hemi = new HemisphereLight(0xffffff, 0x444444, 1.8);
  private sun = new DirectionalLight(0xffffff, 3);
  private fireLight = new PointLight(0xff8a3c, 0, 11, 1.7);
  private mat = new MeshLambertMaterial({ vertexColors: true });
  private waterMat = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.84 });
  private fogMat = new MeshLambertMaterial({ vertexColors: true, color: 0x7d8494, transparent: true, opacity: 0.92 });
  private hero: Hero;
  private dog: Dog;
  private mill: Mill;
  private island: Island | null = null;
  private tree: Tree | null = null;
  private water: Mesh | null = null;
  private smog: Mesh | null = null;
  private clouds: Mesh[] = [];
  private birds: { g: Group; wings: Mesh[]; phase: number }[] = [];
  private stars: Points;
  private orb: Sprite;
  private flames: Particles;
  private fireGlow!: Sprite;
  private cloudMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.94 });
  private bits: Particles; // unlit, normal blending: smoke, water, confetti
  private sparks: Particles; // additive: sparks, fireflies, level-up light
  private proxies: Mesh[] = [];
  private ray = new Raycaster();
  private sky: Sky = skyAt(new Date());
  private state: WorldState | null = null;
  private built = "";
  private running = false;
  private last = 0;
  private t = 0;

  // levels derived from the state
  private fire = 0.6;
  private millSpeed = 0.8;
  private waterLevel = 0.6;
  private spill = new Vector3();

  // interaction
  private yaw = 0;
  private yawVel = 0;
  private yawUser = 0;
  private lastTouch = -10;
  private drag: { x: number; y: number; t: number; moved: boolean; id: number } | null = null;

  // hero animation
  private action: HeroAction = "idle";
  private actionT = 0;
  private nextAction = 4;
  private blinkAt = 2;
  private pose = { armL: [0, 0], armR: [0, 0], legL: 0, legR: 0, twist: 0, lean: 0, hop: 0, headYaw: 0, headPitch: 0 };

  // dog
  private dogPos = new Vector3(1.7, 0, 1.5);
  private dogTarget = new Vector3(1.7, 0, 1.5);
  private dogHeading = 0;
  private dogWait = 1.5;
  private dogHop = 0;
  private dogSit = 0;

  private emitAcc = { flame: 0, smoke: 0, fall: 0, fly: 0, aura: 0 };
  private levelUpT = -1;

  constructor(private canvas: HTMLCanvasElement, private onTap: (hit: Hit) => void) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.scene.add(this.hemi, this.sun, this.sun.target, this.stage);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -9.5;
    sc.right = sc.top = 9.5;
    sc.near = 1;
    sc.far = 50;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;

    // cast
    this.hero = buildHero(this.mat);
    this.hero.root.position.copy(spot(SPOTS.hero));
    this.hero.root.scale.setScalar(HERO_SCALE);
    this.dog = buildDog(this.mat);
    this.dog.root.scale.setScalar(0.9);
    this.mill = buildMill(this.mat);
    this.stage.add(this.hero.root, this.dog.root, this.mill.root, buildCampfire(this.mat));

    this.fireLight.position.copy(spot(SPOTS.fire, 0.7));
    this.stage.add(this.fireLight);

    // particles
    this.flames = new Particles(70, new MeshBasicMaterial({ toneMapped: false }));
    this.fireGlow = new Sprite(new SpriteMaterial({ map: glowTexture("rgba(255,190,90,0.9)", "rgba(255,120,40,0.28)"), transparent: true, depthWrite: false, blending: AdditiveBlending }));
    this.fireGlow.position.copy(spot(SPOTS.fire, 0.75));
    this.stage.add(this.fireGlow);
    this.sparks = new Particles(220, new MeshBasicMaterial({ blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.bits = new Particles(160, new MeshBasicMaterial({ transparent: true, opacity: 0.9, toneMapped: false }));
    this.stage.add(this.flames.mesh, this.sparks.mesh, this.bits.mesh);

    // sky objects (do not turn with the island)
    const starGeo = new BufferGeometry();
    const sp = new Float32Array(110 * 3);
    for (let i = 0; i < 110; i++) sp.set([(hash(i, 1) - 0.5) * 46, -2 + hash(i, 2) * 22, -34 - hash(i, 3) * 4], i * 3);
    starGeo.setAttribute("position", new BufferAttribute(sp, 3));
    this.stars = new Points(starGeo, new PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
    this.orb = new Sprite(new SpriteMaterial({ map: glowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0.35)"), transparent: true, depthWrite: false, blending: AdditiveBlending }));
    this.scene.add(this.stars, this.orb);

    // three clouds behind the island, two below it (that is what makes it float)
    const cloudSpots: [number, number, number, number][] = [[-9.5, 5.4, -15, 0.62], [9, 3.6, -12, 0.8], [1.5, 7.2, -18, 0.55], [-6.5, -4.4, 2.5, 0.6], [7.5, -4.9, 4, 0.7]];
    cloudSpots.forEach(([x, y, z, scale], i) => {
      const c = buildCloud(this.cloudMat, i + 3);
      c.position.set(x, y, z);
      c.scale.setScalar(scale);
      this.clouds.push(c);
      this.scene.add(c);
    });

    // birds (only out when the air is good)
    const birdMat = new MeshLambertMaterial({ color: 0xf8fafc });
    for (let i = 0; i < 3; i++) {
      const g = new Group();
      const body = new Mesh(new BoxGeometry(0.1, 0.08, 0.26), birdMat);
      const wl = new Mesh(new BoxGeometry(0.3, 0.03, 0.14), birdMat);
      const wr = wl.clone();
      wl.geometry.translate(-0.15, 0, 0);
      wr.geometry = new BoxGeometry(0.3, 0.03, 0.14).translate(0.15, 0, 0);
      g.add(body, wl, wr);
      g.visible = false;
      this.birds.push({ g, wings: [wl, wr], phase: i * 2.1 });
      this.stage.add(g);
    }

    // tap targets
    const proxy = (hit: Hit, parent: Object3D, size: [number, number, number], pos: [number, number, number]) => {
      const m = new Mesh(new BoxGeometry(...size));
      m.visible = false;
      m.position.set(...pos);
      m.userData.hit = hit;
      parent.add(m);
      this.proxies.push(m);
    };
    proxy("hero", this.hero.root, [2.1, 3.7, 1.5], [0, 1.85, 0]);
    proxy("dog", this.dog.root, [1.1, 1.5, 1.5], [0, 0.7, 0.2]);
    proxy("feuer", this.stage, [2.4, 2, 2.4], [SPOTS.fire[0] * U, 0.9, SPOTS.fire[1] * U]);
    proxy("wasser", this.stage, [4.4, 0.9, 3.2], [SPOTS.pond[0] * U, -0.2, SPOTS.pond[1] * U]);
    proxy("erde", this.stage, [3.6, 5.6, 3.4], [SPOTS.tree[0] * U, 2.8, SPOTS.tree[1] * U]);
    proxy("luft", this.stage, [2.6, 5.4, 2.6], [SPOTS.mill[0] * U, 2.6, SPOTS.mill[1] * U]);

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onCancel);
  }

  // ───────────── state → scene ─────────────

  setState(s: WorldState) {
    this.state = s;
    this.sky = skyAt(s.date);
    const lvl = (e: Element) => (s.enough ? clamp(s.shares[e] / 0.25, 0, 1.5) : 0.6);
    const eff = (e: Element): Effect => (s.enough ? s.effects[e] : "neutral");

    this.fire = eff("feuer") === "debuff" ? 0 : eff("feuer") === "buff" ? 1.25 : 0.35 + lvl("feuer") * 0.45;
    this.millSpeed = eff("luft") === "debuff" ? 0 : (0.35 + lvl("luft") * 0.9) * (eff("luft") === "buff" ? 1.5 : 1);
    this.waterLevel = eff("wasser") === "debuff" ? 0 : eff("wasser") === "buff" ? 1 : lvl("wasser") >= 0.6 ? 1 : 0.5;

    // Geometry only changes when an element crosses a visible step → rebuild rarely.
    const key = [eff("erde"), Math.round(lvl("erde") * 3), this.waterLevel, eff("luft")].join("|");
    if (key !== this.built) {
      this.built = key;
      this.rebuild(eff("erde"), lvl("erde"), eff("luft") === "debuff");
    }
    this.birds.forEach((b) => (b.g.visible = eff("luft") === "buff" || (s.enough && lvl("luft") >= 1)));
    this.applySky();
  }

  private swap<T extends Object3D>(old: T | null, next: T | null, parent: Object3D = this.stage) {
    if (old) {
      parent.remove(old);
      old.traverse((o) => (o as Mesh).geometry?.dispose());
    }
    if (next) parent.add(next);
  }

  private rebuild(erde: Effect, erdeLevel: number, smog: boolean) {
    const island = buildIsland(this.mat, erde, erdeLevel);
    this.swap(this.island?.ground ?? null, island.ground);
    this.island = island;
    this.spill.set(island.spill[0] * U + U / 2, -0.5, island.spill[1] * U + U / 2);

    const tree = buildTree(this.mat, erde, erdeLevel);
    this.swap(this.tree?.root ?? null, tree.root);
    this.tree = tree;

    const water = buildWater(this.waterMat, island.pondCells, this.waterLevel);
    this.swap(this.water, water);
    this.water = water;

    let fog: Mesh | null = null;
    if (smog) {
      fog = buildCloud(this.fogMat, 42);
      fog.position.set(SPOTS.mill[0] * U - 0.4, 3.4, SPOTS.mill[1] * U + 1.2);
      fog.scale.setScalar(0.75);
    }
    this.swap(this.smog, fog);
    this.smog = fog;
  }

  private applySky() {
    const k = this.sky;
    this.hemi.color.set(k.hemiSky);
    this.hemi.groundColor.set(k.hemiGround);
    this.hemi.intensity = k.hemiIntensity;
    this.sun.color.set(k.light);
    this.sun.intensity = k.lightIntensity;
    this.sun.position.set(k.orbX * 9, 6 + k.orbY * 9, 9);
    (this.stars.material as PointsMaterial).opacity = k.night * 0.9;
    // clouds take the colour of the light: white by day, glowing at sunset, slate blue at night
    this.cloudMat.color.set(k.hemiSky).lerp(new Color(k.light), 0.45).lerp(new Color(0xffffff), (1 - k.night) * 0.55);
    const om = this.orb.material as SpriteMaterial;
    om.color.set(k.moon ? 0xcdd9ff : 0xfff2c4);
    om.opacity = k.moon ? 0.9 : 0.95;
    this.placeOrb();
  }

  private placeOrb() {
    const k = this.sky;
    // spread across the visible sky behind the island (wider on wide screens)
    const halfW = Math.tan((this.camera.fov * Math.PI) / 360) * 58 * this.camera.aspect;
    this.orb.position.set(k.orbX * halfW * 0.8, 0.5 + k.orbY * 6.2, -32);
    this.orb.scale.setScalar(k.moon ? 4.2 : 6.5);
  }

  // ───────────── sizing & lifecycle ─────────────

  resize(w: number, h: number, dpr: number) {
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max(13.2 / 2 / (tan * this.camera.aspect), 9.6 / 2 / tan);
    const el = 0.25;
    this.camera.position.set(0, 1.5 + Math.sin(el) * dist, Math.cos(el) * dist);
    this.camera.lookAt(0, 1.5, 0);
    this.camera.updateProjectionMatrix();
    this.placeOrb();
    if (!this.running) this.frame(performance.now());
  }

  setRunning(on: boolean) {
    if (on === this.running) return;
    this.running = on;
    this.last = 0;
    this.renderer.setAnimationLoop(on ? this.frame : null);
  }

  /** Development aid: look at the scene from anywhere (distance, elevation, turn, height of the focus point). */
  debugView(dist: number, el: number, yaw: number, y = 1.5, x = 0, z = 0) {
    this.camera.position.set(x, y + Math.sin(el) * dist, z + Math.cos(el) * dist);
    this.camera.lookAt(x, y, z);
    this.yawUser = yaw;
    this.lastTouch = this.t + 1e6;
  }

  dispose() {
    this.setRunning(false);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onCancel);
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mat = m.material as Material | Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
  }

  // ───────────── reactions ─────────────

  /** XP gained: the hero cheers and sparks fly in the attribute's colour. */
  celebrate(color: string) {
    this.setAction("cheer");
    const c = new Color(color).getHex();
    const p = this.hero.root.position;
    for (let i = 0; i < 34; i++) {
      const a = hash(i, this.t * 100) * Math.PI * 2;
      const r = 0.6 + hash(i, 7) * 1.6;
      this.sparks.spawn(p.x + Math.cos(a) * 0.3, 1.6 + hash(i, 3), p.z + Math.sin(a) * 0.3, Math.cos(a) * r, 2.2 + hash(i, 5) * 2.4, Math.sin(a) * r, 0.9 + hash(i, 9) * 0.7, 0.11 + hash(i, 4) * 0.08, i % 4 === 0 ? 0xffffff : c, -5.5);
    }
  }

  levelUp() {
    this.levelUpT = 0;
    this.setAction("cheer");
  }

  private petDog() {
    this.dogHop = 1;
    this.dogSit = 0;
    this.setAction("pet");
    for (let i = 0; i < 7; i++) this.bits.spawn(this.dogPos.x + (hash(i, this.t) - 0.5) * 0.5, 1.1, this.dogPos.z, (hash(i, 2) - 0.5) * 0.5, 0.9 + hash(i, 3) * 0.7, 0, 1.1 + hash(i, 4) * 0.5, 0.13, 0xfb7185, 0);
  }

  private setAction(a: HeroAction) {
    this.action = a;
    this.actionT = 0;
  }

  // ───────────── input ─────────────

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId };
  };
  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
      d.moved = true;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    }
    if (!d.moved) return;
    const step = (e.movementX || 0) * 0.011;
    this.yawUser += step;
    this.yawVel = step * 60;
    this.lastTouch = this.t;
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved || performance.now() - d.t > 450) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.proxies, false)[0]?.object.userData.hit as Hit | undefined;
    if (!hit) return;
    if (hit === "dog") this.petDog();
    this.onTap(hit);
  };
  private onCancel = () => {
    this.drag = null;
  };

  // ───────────── frame ─────────────

  private frame = (now: number) => {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    this.t += dt;
    this.update(this.t, dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(t: number, dt: number) {
    // camera: the island turns with your finger, coasts, and drifts back to its front view after a while
    if (!this.drag?.moved) {
      this.yawUser += this.yawVel * dt;
      this.yawVel = damp(this.yawVel, 0, 3, dt);
      if (t - this.lastTouch > 5) {
        const home = Math.round(this.yawUser / (Math.PI * 2)) * Math.PI * 2;
        this.yawUser = damp(this.yawUser, home, 1.2, dt);
      }
    }
    this.yaw = this.yawUser + Math.sin(t * 0.22) * 0.1;
    this.stage.rotation.y = this.yaw;

    this.updateHero(t, dt);
    this.updateDog(t, dt);

    // world
    this.mill.blades.rotation.z -= this.millSpeed * dt;
    if (this.tree) {
      this.tree.crown.rotation.z = Math.sin(t * 0.9) * 0.018 * (0.4 + this.millSpeed);
      this.tree.crown.rotation.x = Math.sin(t * 0.7 + 1) * 0.012;
    }
    if (this.water) this.water.position.y = Math.sin(t * 1.3) * 0.012;
    this.clouds.forEach((c, i) => {
      c.position.x += (0.1 + i * 0.03) * (0.4 + this.millSpeed * 0.6) * dt;
      if (c.position.x > 17) c.position.x = -17;
    });
    this.birds.forEach((b, i) => {
      if (!b.g.visible) return;
      const a = t * (0.5 + i * 0.07) + b.phase;
      const r = 4.2 + i * 0.9;
      b.g.position.set(Math.cos(a) * r, 5.2 + i * 0.5 + Math.sin(t * 0.8 + i) * 0.3, Math.sin(a) * r * 0.75 - 1);
      b.g.rotation.y = -a;
      const flap = Math.sin(t * 9 + i) * 0.7;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    });
    (this.stars.material as PointsMaterial).size = 2 + Math.sin(t * 2.3) * 0.25;

    this.emit(t, dt);
    this.flames.update(dt);
    this.sparks.update(dt);
    this.bits.update(dt);
  }

  private emit(t: number, dt: number) {
    const acc = this.emitAcc;
    const night = this.sky.night;
    const f = spot(SPOTS.fire, 0.3);
    const rnd = (k: number) => hash(Math.floor(t * 997), k) - 0.5;

    // fire: flames while it burns, only smoke and embers when the element is starving
    const flick = 0.82 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29.3) * 0.06 + Math.sin(t * 5.1) * 0.05;
    this.fireLight.intensity = this.fire > 0 ? this.fire * flick * (5 + night * 46) : 0.6 + night * 2;
    this.fireGlow.scale.setScalar(this.fire > 0 ? (1.6 + this.fire * 1.7) * flick : 0.9);
    (this.fireGlow.material as SpriteMaterial).opacity = this.fire > 0 ? 0.55 + night * 0.35 : 0.25;
    acc.flame += dt * (this.fire > 0 ? 9 + this.fire * 13 : 0);
    while (acc.flame > 1) {
      acc.flame--;
      const s = 0.6 + this.fire * 0.5;
      const hot = hash(Math.floor(t * 131), acc.flame * 10);
      // yellow at the base, turning orange and red while rising
      this.flames.spawn(f.x + rnd(1) * 0.38 * s, f.y, f.z + rnd(2) * 0.38 * s, rnd(3) * 0.15, (0.75 + hot * 0.8) * s, rnd(4) * 0.15, 0.55 + hot * 0.5, (0.2 + hot * 0.14) * s, 0xffd76a, 0.3, hot > 0.5 ? 0xe2441f : 0xff8a2b);
      if (this.fire > 1 && hot > 0.8) this.sparks.spawn(f.x + rnd(5) * 0.3, f.y + 0.5, f.z + rnd(6) * 0.3, rnd(7) * 0.7, 2 + hot, rnd(8) * 0.7, 1.4, 0.06, 0xffc46b, -0.6);
    }
    acc.smoke += dt * (this.fire > 0 ? 1.2 : 2.6);
    while (acc.smoke > 1) {
      acc.smoke--;
      this.bits.spawn(f.x + rnd(9) * 0.25, f.y + (this.fire > 0 ? 1.3 * this.fire : 0.25), f.z + rnd(10) * 0.25, 0.12 + rnd(11) * 0.2, 0.55, rnd(12) * 0.15, 2.6, 0.22, this.fire > 0 ? 0x6b7280 : 0x4b5563, 0.05);
      if (this.fire <= 0) this.flames.spawn(f.x + rnd(13) * 0.4, f.y - 0.12, f.z + rnd(14) * 0.4, 0, 0.02, 0, 1.2, 0.1, 0xb9381f, 0); // glowing embers
    }

    // waterfall over the rim, a splash of mist below
    if (this.waterLevel > 0) {
      acc.fall += dt * (10 + this.waterLevel * 24);
      const out = this.spill.clone().setY(0).normalize();
      while (acc.fall > 1) {
        acc.fall--;
        const side = rnd(15) * 0.42;
        this.bits.spawn(this.spill.x + out.x * 0.2 - out.z * side, this.spill.y + 0.05, this.spill.z + out.z * 0.2 + out.x * side, out.x * 0.5, -0.2, out.z * 0.5, 1.15, 0.15 + Math.abs(rnd(16)) * 0.1, rnd(17) > 0.2 ? 0xe0f2fe : 0x5cb8f5, -9);
      }
    }

    // night: fireflies over the meadow (not when the ground is parched)
    if (night > 0.4 && this.state?.effects.erde !== "debuff") {
      acc.fly += dt * 2.2;
      while (acc.fly > 1) {
        acc.fly--;
        const a = hash(Math.floor(t * 61), 1) * Math.PI * 2;
        const r = 2 + hash(Math.floor(t * 61), 2) * 3.6;
        this.sparks.spawn(Math.cos(a) * r, 0.4 + hash(Math.floor(t * 61), 3) * 1.6, Math.sin(a) * r * 0.75, rnd(18) * 0.3, 0.12, rnd(19) * 0.3, 3.2, 0.07, 0xd9f99d, 0);
      }
    }

    // buffs shimmer gold at their place
    if (this.state?.enough) {
      acc.aura += dt * 5;
      while (acc.aura > 1) {
        acc.aura--;
        const buffed = (["feuer", "wasser", "erde", "luft"] as const).filter((e) => this.state!.effects[e] === "buff");
        if (!buffed.length) break;
        const e = buffed[Math.floor(hash(Math.floor(t * 43), 4) * buffed.length)];
        const s = e === "feuer" ? SPOTS.fire : e === "wasser" ? SPOTS.pond : e === "erde" ? SPOTS.tree : SPOTS.mill;
        const y = e === "erde" ? 2.5 + hash(Math.floor(t * 43), 5) * 2.5 : e === "luft" ? 1 + hash(Math.floor(t * 43), 5) * 3.5 : 0.2;
        this.sparks.spawn(s[0] * U + rnd(20) * 2.2, y, s[1] * U + rnd(21) * 1.8, 0, 0.5, 0, 1.6, 0.07, 0xfde68a, 0);
      }
    }

    // level-up: a column of light around the hero
    if (this.levelUpT >= 0) {
      this.levelUpT += dt;
      const p = this.hero.root.position;
      for (let i = 0; i < 4; i++) {
        const a = hash(Math.floor(t * 500), i) * Math.PI * 2;
        const r = 0.7 + hash(Math.floor(t * 500), i + 9) * 0.5;
        this.sparks.spawn(p.x + Math.cos(a) * r, 0.1, p.z + Math.sin(a) * r, 0, 3.5 + hash(i, t * 60) * 2.5, 0, 1.3, 0.12, i % 2 ? 0xfde68a : 0xffffff, 0);
      }
      if (this.levelUpT > 2.6) this.levelUpT = -1;
    }
  }

  private updateHero(t: number, dt: number) {
    const h = this.hero;
    const p = this.pose;
    this.actionT += dt;
    const a = this.actionT;

    if (this.action === "idle") {
      this.nextAction -= dt;
      if (this.nextAction <= 0) {
        const r = hash(Math.floor(t * 17), 3);
        this.setAction(r < 0.6 ? "box" : "wave");
        this.nextAction = 6 + hash(Math.floor(t * 17), 4) * 7;
      }
    }

    // target pose for the current action
    let armL: [number, number] = [Math.sin(t * 1.6) * 0.07, -0.06];
    let armR: [number, number] = [-Math.sin(t * 1.6) * 0.07, 0.06];
    let legL = 0;
    let legR = 0;
    let twist = 0;
    let lean = 0;
    let hop = 0;
    let headYaw = Math.sin(t * 0.4) * 0.28;
    let headPitch = Math.sin(t * 0.27) * 0.05;
    let speed = 9;

    if (this.action === "box") {
      // guard up, bounce, then jab – jab – cross
      const punch = (at: number) => {
        const x = (a - at) / 0.3;
        return x > 0 && x < 1 ? Math.sin(Math.PI * Math.min(1, x * 1.5)) : 0;
      };
      const jab = Math.max(punch(0.7), punch(1.15), punch(2.1), punch(2.55));
      const cross = Math.max(punch(1.5), punch(2.95));
      armL = [-1.25 - jab * 0.42, 0.28 - jab * 0.25];
      armR = [-1.15 - cross * 0.5, -0.28 + cross * 0.25];
      twist = jab * 0.3 - cross * 0.55 + 0.25;
      lean = 0.07;
      legL = 0.22;
      legR = -0.22;
      hop = Math.abs(Math.sin(a * 7)) * 0.05;
      headYaw = -twist * 0.6;
      headPitch = 0.06;
      speed = 26;
      if (a > 3.6) this.setAction("idle");
    } else if (this.action === "cheer") {
      const j = Math.sin(Math.min(1, (a % 0.62) / 0.5) * Math.PI);
      hop = a < 1.86 ? j * 0.55 : 0;
      armL = [-0.2, -2.55 - Math.sin(a * 14) * 0.12];
      armR = [-0.2, 2.55 + Math.sin(a * 14) * 0.12];
      headPitch = -0.22;
      headYaw = 0;
      speed = 18;
      if (a > 1.95) this.setAction("idle");
    } else if (this.action === "wave") {
      armR = [-0.15, 2.5 + Math.sin(a * 11) * 0.35];
      headYaw = 0.12;
      headPitch = -0.05;
      speed = 14;
      if (a > 2.1) this.setAction("idle");
    } else if (this.action === "pet") {
      // look over to Pouchi
      const d = this.dogPos.clone().sub(h.root.position);
      headYaw = clamp(Math.atan2(d.x, d.z), -1, 1);
      headPitch = 0.3;
      armR = [-0.5, 0.25];
      if (a > 1.6) this.setAction("idle");
    }

    const k = (cur: number, target: number) => damp(cur, target, speed, dt);
    p.armL = [k(p.armL[0], armL[0]), k(p.armL[1], armL[1])];
    p.armR = [k(p.armR[0], armR[0]), k(p.armR[1], armR[1])];
    p.legL = k(p.legL, legL);
    p.legR = k(p.legR, legR);
    p.twist = k(p.twist, twist);
    p.lean = k(p.lean, lean);
    p.hop = damp(p.hop, hop, 30, dt);
    p.headYaw = damp(p.headYaw, headYaw, 6, dt);
    p.headPitch = damp(p.headPitch, headPitch, 6, dt);

    h.armL.rotation.set(p.armL[0], 0, p.armL[1]);
    h.armR.rotation.set(p.armR[0], 0, p.armR[1]);
    h.legL.rotation.x = p.legL;
    h.legR.rotation.x = p.legR;
    h.upper.rotation.set(p.lean, p.twist, 0);
    h.upper.scale.y = 1 + Math.sin(t * 1.6) * 0.008; // breathing
    h.head.rotation.set(p.headPitch, p.headYaw, 0);
    h.root.position.y = p.hop;

    // blink
    this.blinkAt -= dt;
    h.lids.visible = this.blinkAt < 0.11;
    if (this.blinkAt < 0) this.blinkAt = 2.2 + hash(Math.floor(t * 31), 8) * 3;
  }

  private updateDog(t: number, dt: number) {
    const d = this.dog;
    const hero = this.hero.root.position;
    const to = this.dogTarget.clone().sub(this.dogPos).setY(0);
    const dist = to.length();
    let moving = false;

    if (dist < 0.12) {
      this.dogWait -= dt;
      this.dogSit = damp(this.dogSit, this.dogWait > 0.4 ? 1 : 0, 8, dt);
      if (this.dogWait <= 0) {
        // next place to sniff: somewhere on the meadow between plaza, fire and pond
        const pts: [number, number][] = [[1.7, 1.5], [-1.6, 1.7], [0.5, 2.7], [-2.1, 0.2], [2.1, -0.4], [0.3, -1.7], [-1.2, 3.2], [1.0, 3.3], [-1.0, -1.5]];
        const [x, z] = pts[Math.floor(hash(Math.floor(t * 13), 6) * pts.length)];
        this.dogTarget.set(x, 0, z);
        this.dogWait = 1.5 + hash(Math.floor(t * 13), 7) * 4;
      }
    } else {
      moving = true;
      this.dogSit = damp(this.dogSit, 0, 10, dt);
      const dir = to.normalize();
      // steer around Joshua instead of running through him
      const away = this.dogPos.clone().sub(hero).setY(0);
      const near = away.length();
      if (near < 1.5) dir.add(away.normalize().multiplyScalar((1.5 - near) * 3)).normalize();
      const speed = Math.min(1.5, 0.6 + dist);
      this.dogPos.addScaledVector(dir, speed * dt);
      const want = Math.atan2(dir.x, dir.z);
      let diff = want - this.dogHeading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.dogHeading += diff * (1 - Math.exp(-10 * dt));
    }
    if (!moving) {
      // sitting: face the viewer, turned a little towards Joshua (nobody wants to look at a dog's back)
      const look = Math.atan2((hero.x - this.dogPos.x) * 0.6, 2.2);
      let diff = look - this.dogHeading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.dogHeading += diff * (1 - Math.exp(-3 * dt));
    }

    this.dogHop = Math.max(0, this.dogHop - dt * 1.6);
    const hop = Math.abs(Math.sin(this.dogHop * Math.PI * 2)) * 0.45 * (this.dogHop > 0 ? 1 : 0);
    const trot = moving ? Math.abs(Math.sin(t * 16)) * 0.05 : 0;
    d.root.position.set(this.dogPos.x, hop + trot, this.dogPos.z);
    d.root.rotation.y = this.dogHeading;
    d.body.rotation.x = -this.dogSit * 0.26;
    d.body.position.y = -this.dogSit * 0.05;
    const swing = moving ? Math.sin(t * 16) * 0.7 : 0;
    d.legs[0].rotation.x = swing;
    d.legs[3].rotation.x = swing;
    d.legs[1].rotation.x = -swing;
    d.legs[2].rotation.x = -swing;
    d.legs[2].rotation.x += this.dogSit * 1.1;
    d.legs[3].rotation.x += this.dogSit * 1.1;
    d.tail.rotation.z = Math.sin(t * (moving || this.dogHop > 0 ? 22 : 9)) * (0.3 + this.dogSit * 0.25);
    d.head.rotation.x = this.dogSit * 0.2 - 0.05 + Math.sin(t * 2.1) * 0.04;
    d.head.rotation.z = !moving ? Math.sin(t * 0.8) * 0.22 * this.dogSit : 0;
  }
}
