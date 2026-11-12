import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Material } from "three";
import { PALETTE, SPRITE } from "../components/PixelAvatar";
import type { Effect } from "../lib/character";
import { blob, box, hash, hex, mix, noise2, voxelGeometry, type Vox } from "./voxel";

/** Voxel edge lengths: the terrain is coarse, the two characters are twice as fine (they are the heroes of the scene). */
export const TERRAIN = 0.25;
export const FINE = 0.125;

function mesh(voxels: Vox[], mat: Material, size: number, origin: [number, number, number] = [0, 0, 0], jitter = 0.05): Mesh {
  const m = new Mesh(voxelGeometry(voxels, { size, origin, jitter }), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ───────────────────────── Joshua ─────────────────────────

export interface Hero {
  root: Group; // feet on the ground, faces +z
  upper: Group; // everything above the hips (twists for punches)
  head: Group;
  armL: Group; // screen-left arm (his right) – carries the tea towel side
  armR: Group;
  legL: Group;
  legR: Group;
  lids: Mesh; // eyelids, shown for a blink
}

/**
 * The 2D pixel sprite from `PixelAvatar` extruded into a jointed 3D figure – same blond hair, green sweater,
 * MMA gloves, mortarboard, tea towel and name badge, so the 2D and 3D Joshua stay one character.
 */
export function buildHero(mat: Material): Hero {
  const P = (c: string) => hex(PALETTE[c]);
  const Y = (row: number) => 27 - row;
  const X = (sx: number) => sx - 10;
  const at = (row: number, sx: number) => SPRITE[row][sx];
  const S = FINE;

  // legs (rows 21–27), shoes stick out to the front
  const legs: [Vox[], Vox[]] = [[], []];
  for (let r = 21; r <= 27; r++)
    for (let sx = 0; sx < 20; sx++) {
      const c = at(r, sx);
      if (c === ".") continue;
      const shoe = r >= 26;
      const front = shoe ? 3 : 1;
      for (let z = -2; z <= front; z++) legs[sx < 10 ? 0 : 1].push([X(sx), Y(r), z, P(z === front ? c : shoe ? "F" : "P")]);
    }

  // torso + hips (rows 10–20) without arms and gloves
  const torso: Vox[] = [];
  for (let r = 10; r <= 20; r++)
    for (let sx = 3; sx <= 15; sx++) {
      const c = at(r, sx);
      if (c === "." || c === "G" || c === "g") continue;
      if (sx === 3 && r !== 11) continue; // that column is the arm, except the towel on the shoulder
      const towel = c === "D" || c === "d";
      const base = r === 10 ? "s" : r <= 16 ? "T" : r === 17 ? "R" : "P";
      const depth = r === 10 ? 1 : 2;
      for (let z = -depth; z <= depth; z++) torso.push([X(sx), Y(r), z, P(z === depth && !towel ? c : base)]);
      if (towel) {
        torso.push([X(sx), Y(r), 3, P(c)]); // hangs down the chest
        if (r <= 13) torso.push([X(sx), Y(r), -3, P(c)]); // … and a bit down the back
        if (r === 11) for (let z = -3; z <= 3; z++) torso.push([X(sx), Y(r) + 1, z, P(z % 3 === 0 ? "d" : "D")]); // over the shoulder
      }
    }

  // arms (2 wide, 3 deep) with chunky gloves
  const arm = (cols: [number, number], gloveCols: [number, number]): Vox[] => {
    const out: Vox[] = [];
    for (let r = 12; r <= 16; r++)
      for (let sx = cols[0]; sx <= cols[1]; sx++) {
        const c = at(r, sx);
        if (c === ".") continue;
        for (let z = -1; z <= 1; z++) out.push([X(sx), Y(r), z, P(z === 1 ? c : r === 16 ? "R" : "T")]);
      }
    for (let r = 17; r <= 19; r++)
      for (let sx = gloveCols[0]; sx <= gloveCols[1]; sx++) {
        const c = at(r, sx);
        if (c !== "G" && c !== "g") continue;
        for (let z = -2; z <= 2; z++) out.push([X(sx), Y(r), z, P(z === 2 ? c : "G")]);
      }
    return out;
  };

  // head (rows 3–9) – rounded, hair wraps around the back
  const head: Vox[] = [];
  for (let r = 3; r <= 9; r++) {
    const row = SPRITE[r];
    const first = row.search(/[^.]/);
    const last = row.length - 1 - [...row].reverse().join("").search(/[^.]/);
    const zMin = r === 9 ? -3 : -4;
    const zMax = r === 9 ? 2 : 3;
    for (let sx = first; sx <= last; sx++) {
      if (sx > 14) continue; // tassel column
      const c = at(r, sx);
      if (c === ".") continue;
      const edge = sx === first || sx === Math.min(last, 14);
      for (let z = zMin; z <= zMax; z++) {
        if (edge && (z === zMin || z === zMax)) continue;
        const hair = r <= 4 || z <= -2 || (edge && r <= 7);
        head.push([X(sx), Y(r), z, P(z === zMax ? c : r === 9 ? "s" : hair ? (hash(sx, r, z) > 0.8 ? "h" : "H") : "S")]);
      }
    }
  }
  // mortarboard: cap, square board, gold button and a tassel hanging over the edge
  box(head, X(6), Y(2), -3, X(13), Y(2), 2, P("K"));
  for (let sx = 3; sx <= 16; sx++) for (let z = -6; z <= 4; z++) head.push([X(sx), Y(1), z, P(sx === 3 || sx === 16 || z === -6 || z === 4 ? "K" : "k")]);
  box(head, -1, Y(0), -1, 0, Y(0), 0, P("Y"));
  for (let sx = 11; sx <= 16; sx++) head.push([X(sx), Y(0), 2 + Math.round((sx - 11) * 0.5), P("Y")]);
  head.push([X(17), Y(1), 4, P("Y")], [X(17), Y(2), 4, P("Y")], [X(17), Y(3), 4, P("Y")], [X(17), Y(4), 4, P("y")]);

  const root = new Group();
  const upper = new Group();
  const hip: [number, number, number] = [0, 7, 0];
  upper.position.set(0, hip[1] * S, 0);
  upper.add(mesh(torso, mat, S, hip));

  const joint = (voxels: Vox[], pivot: [number, number, number], parent: Group, parentOrigin: [number, number, number]) => {
    const g = new Group();
    g.position.set((pivot[0] - parentOrigin[0]) * S, (pivot[1] - parentOrigin[1]) * S, (pivot[2] - parentOrigin[2]) * S);
    g.add(mesh(voxels, mat, S, pivot));
    parent.add(g);
    return g;
  };
  const headG = joint(head, [0, 18, 0], upper, hip);
  const armL = joint(arm([2, 3], [1, 4]), [-7, 16, 0], upper, hip);
  const armR = joint(arm([16, 17], [15, 18]), [7, 16, 0], upper, hip);
  const legL = joint(legs[0], [-3, 7, 0], root, [0, 0, 0]);
  const legR = joint(legs[1], [3, 7, 0], root, [0, 0, 0]);
  root.add(upper);

  // eyelids: two skin-coloured tiles right in front of the eyes
  const lidGeo = new BoxGeometry(S * 1.04, S * 1.04, 0.02);
  const lids = new Mesh(lidGeo, new MeshLambertMaterial({ color: P("S") }));
  const lid2 = new Mesh(lidGeo, lids.material);
  lids.position.set((X(7) + 0.5) * S, (Y(6) + 0.5 - 18) * S, 4 * S);
  lid2.position.set((X(12) - X(7)) * S, 0, 0);
  lids.add(lid2);
  lids.visible = false;
  headG.add(lids);

  return { root, upper, head: headG, armL, armR, legL, legR, lids };
}

// ───────────────────────── Pouchi ─────────────────────────

export interface Dog {
  root: Group; // faces +z
  body: Group;
  head: Group;
  tail: Group;
  legs: Group[]; // front-left, front-right, back-left, back-right
}

/** A Pomeranian: orange fluff ball, cream chest and muzzle, fox ears, plume tail curled over the back. */
export function buildDog(mat: Material): Dog {
  const O = 0xe98a3c;
  const O2 = 0xd3722b;
  const C = 0xf8dcae;
  const K = 0x1c1917;
  const S = FINE;
  const fur = (x: number, y: number, z: number) => (hash(x, y, z) > 0.75 ? O2 : O);

  const body: Vox[] = [];
  blob(body, 0, 4.6, 0, 3.4, 3.1, 4.3, (x, y, z) => (y < 3 && z > -1 ? C : fur(x, y, z)));
  blob(body, 0, 4.4, 3.4, 2.9, 2.9, 1.9, (x, y, z) => (y < 6 ? C : fur(x, y, z))); // chest ruff

  const head: Vox[] = [];
  blob(head, 0, 9.2, 5.2, 3.1, 2.9, 2.7, (x, y, z) => (y < 8 && z > 5 ? C : fur(x, y, z)));
  box(head, -1, 7, 7, 0, 8, 8, C); // muzzle
  head.push([-1, 8, 9, K], [0, 8, 9, K]); // nose
  head.push([-2, 10, 7, K], [1, 10, 7, K]); // eyes
  head.push([-1, 7, 9, 0xf472b6], [0, 7, 9, 0xf472b6]); // tongue
  for (const s of [-1, 1]) {
    const x = s < 0 ? -3 : 2;
    head.push([x, 12, 4, O2], [x - (s < 0 ? -1 : 1), 12, 4, O2], [x, 13, 4, O2], [x, 12, 5, 0xfbcfa0]);
  }

  const tail: Vox[] = [];
  blob(tail, 0, 9, -4.2, 1.9, 2.8, 1.9, (x, y, z) => (hash(x, y, z) > 0.45 ? C : O));
  blob(tail, 0, 10.2, -2.6, 1.6, 1.5, 1.8, () => C);

  const root = new Group();
  const bodyG = new Group();
  bodyG.add(mesh(body, mat, S, [0, 0, 0], 0.07));
  const headG = new Group();
  headG.position.set(0, 7 * S, 3.5 * S);
  headG.add(mesh(head, mat, S, [0, 7, 3.5], 0.07));
  const tailG = new Group();
  tailG.position.set(0, 7 * S, -3.2 * S);
  tailG.add(mesh(tail, mat, S, [0, 7, -3.2], 0.07));
  bodyG.add(headG, tailG);
  root.add(bodyG);

  const legs: Group[] = [];
  for (const [x, z] of [[-3, 2], [1, 2], [-3, -3], [1, -3]] as const) {
    const v: Vox[] = [];
    box(v, x, 0, z, x + 1, 2, z + 1, (_x, y) => (y === 0 ? C : O2));
    const g = new Group();
    g.position.set((x + 1) * S, 2.5 * S, (z + 1) * S);
    g.add(mesh(v, mat, S, [x + 1, 2.5, z + 1]));
    root.add(g);
    legs.push(g);
  }
  return { root, body: bodyG, head: headG, tail: tailG, legs };
}

// ───────────────────────── Island ─────────────────────────

/** Where things stand, in terrain voxels (x → right, z → towards the camera). */
export const SPOTS = {
  hero: [0, 1] as const,
  fire: [-11, 8] as const,
  pond: [11, 8] as const,
  tree: [-12, -9] as const,
  mill: [11, -10] as const,
};
const POND_R: [number, number] = [7, 5];

const RX = 23;
const RZ = 19;
/** Island outline: an ellipse with a wobbly edge. Returns 0 in the centre … 1 at the rim, > 1 outside. */
function rim(x: number, z: number): number {
  const a = Math.atan2(z, x);
  const wobble = 1 + (noise2(Math.cos(a) * 1.8 + 5, Math.sin(a) * 1.8 + 5, 7) - 0.5) * 0.24;
  return Math.hypot(x / (RX * wobble), z / (RZ * wobble));
}
const pondD = (x: number, z: number) => Math.hypot((x - SPOTS.pond[0]) / POND_R[0], (z - SPOTS.pond[1]) / POND_R[1]);

export interface Island {
  ground: Mesh;
  /** Top cells of the pond (terrain voxels) and where its water spills over the rim. */
  pondCells: [number, number][];
  spill: [number, number];
}

/** The floating island. Grass colour and flowers follow the state of Erde (lush · normal · parched). */
export function buildIsland(mat: Material, erde: Effect, erdeLevel: number): Island {
  const v: Vox[] = [];
  const pondCells: [number, number][] = [];
  const dry = erde === "debuff";
  const lush = erde === "buff";
  const grassA = dry ? 0x9a9a4e : lush ? 0x57b548 : 0x5fae4a;
  const grassB = dry ? 0xb0a35a : lush ? 0x70cc58 : 0x74bd58;
  const grassC = dry ? 0x857f45 : 0x4c9a40;
  const flowers = [0xf9a8d4, 0xfde047, 0xffffff, 0xc4b5fd, 0xfca5a5];
  const flowerRate = dry ? 0 : 0.006 + Math.min(1.4, erdeLevel) * 0.012 + (lush ? 0.014 : 0);
  let spill: [number, number] = [SPOTS.pond[0] + 7, SPOTS.pond[1] + 5];
  let spillBest = 0;

  for (let x = -RX - 5; x <= RX + 5; x++)
    for (let z = -RZ - 5; z <= RZ + 5; z++) {
      const d = rim(x, z);
      if (d > 1) continue;
      const pd = pondD(x, z);
      const dc = Math.hypot(x - SPOTS.hero[0], z - SPOTS.hero[1]);
      const n = noise2(x * 0.16, z * 0.16, 1);
      // underside: deep in the middle, thin at the rim, with a few hanging rocks
      const depth = Math.round(2 + (1 - d ** 1.7) * 15 + noise2(x * 0.3, z * 0.3, 2) * 4 + (noise2(x * 0.45, z * 0.45, 5) > 0.72 ? 5 : 0));
      const inPond = pd < 1;
      const top = inPond ? (pd < 0.72 ? -4 : -3) : -1;
      for (let y = -depth; y <= top; y++) {
        let c: number;
        if (inPond && y === top) c = hash(x, 9, z) > 0.5 ? 0x64748b : 0x566070; // pond bed
        else if (y === -1) c = pd < 1.22 ? (hash(x, 3, z) > 0.5 ? 0xdcc98e : 0xcdb87a) : dc < 5.4 ? (((x + z) & 1) === 0 ? 0xb8bcc8 : 0xa3a8b5) : n > 0.62 ? grassB : n < 0.36 ? grassC : grassA;
        else if (y >= -3 - Math.round(n * 2)) c = hash(x, y, z) > 0.5 ? 0x8a5a3c : 0x7a4e33;
        else c = mix(0x6b7080, 0x4a4e5c, Math.max(0, Math.min(1, (-y - 4) / 12 + (hash(x, y, z) - 0.5) * 0.2)));
        v.push([x, y, z, c]);
      }
      if (inPond) {
        pondCells.push([x, z]);
        // the pond cell closest to the island's edge (towards the camera) is where the waterfall starts
        const score = d + z * 0.004;
        if (score > spillBest) {
          spillBest = score;
          spill = [x, z];
        }
        continue;
      }
      // bumps and tufts away from the paths, flowers where the ground is healthy
      const free = pd > 1.35 && dc > 8 && Math.hypot(x - SPOTS.fire[0], z - SPOTS.fire[1]) > 5 && Math.hypot(x - SPOTS.mill[0], z - SPOTS.mill[1]) > 6 && Math.hypot(x - SPOTS.tree[0], z - SPOTS.tree[1]) > 3;
      if (free && d < 0.9 && noise2(x * 0.21, z * 0.21, 4) > 0.7) v.push([x, 0, z, n > 0.5 ? grassB : grassA]);
      else if (pd > 1.25 && dc > 5.6 && d < 0.95 && hash(x, 77, z) < flowerRate) v.push([x, 0, z, flowers[Math.floor(hash(x, 5, z) * flowers.length)]]);
      else if (free && hash(x, 41, z) < 0.012) v.push([x, 0, z, 0x8b909c]); // a pebble
    }
  // stepping stones from the plaza towards the camera
  for (const [x, z] of [[1, 8], [-1, 11], [1, 14]] as const) box(v, x - 1, -1, z - 1, x, -1, z, 0xaeb3c0);

  return { ground: mesh(v, mat, TERRAIN, [0, 0, 0], 0.06), pondCells, spill };
}

/** Water surface of the pond; `level` 0 = dried out … 1 = full to the brim. */
export function buildWater(mat: Material, cells: [number, number][], level: number): Mesh | null {
  if (level <= 0.02) return null;
  const v: Vox[] = [];
  for (const [x, z] of cells) {
    const edge = pondD(x, z) > 0.72;
    const top = level > 0.6 ? -2 : -3;
    if (edge && top < -2) continue;
    for (let y = edge ? -2 : -3; y <= top; y++) v.push([x, y, z, hash(x, 1, z) > 0.86 ? 0x7dd3fc : 0x38a4f0]);
  }
  if (!v.length) return null;
  const m = new Mesh(voxelGeometry(v, { size: TERRAIN, jitter: 0.04, ao: 0.35 }), mat);
  m.receiveShadow = true;
  return m;
}

// ───────────────────────── Tree (Erde) ─────────────────────────

export interface Tree {
  root: Group;
  crown: Group;
}

export function buildTree(mat: Material, erde: Effect, level: number): Tree {
  const [tx, tz] = SPOTS.tree;
  const bark = (x: number, y: number, z: number) => (hash(x, y, z) > 0.6 ? 0x6b4a32 : 0x7d573a);
  const trunk: Vox[] = [];
  box(trunk, tx - 1, 0, tz - 1, tx + 1, 1, tz + 1, bark); // root flare
  trunk.push([tx - 2, 0, tz, bark(1, 2, 3)], [tx + 2, 0, tz + 1, bark(2, 2, 3)], [tx, 0, tz + 2, bark(3, 2, 3)]);
  box(trunk, tx - 1, 2, tz - 1, tx, 11, tz, bark);
  // two branches
  for (let i = 0; i < 4; i++) trunk.push([tx + 1 + i, 8 + i, tz, bark(i, 8, 1)], [tx - 2 - i, 9 + Math.round(i * 0.7), tz + 1, bark(i, 9, 2)]);

  const density = erde === "debuff" ? 0.22 : erde === "buff" ? 1 : 0.6 + Math.min(1, level) * 0.3;
  const leafA = erde === "debuff" ? 0xc98a3a : 0x3f9a45;
  const leafB = erde === "debuff" ? 0xa8642a : 0x56b84f;
  const leafC = erde === "debuff" ? 0xd9a441 : 0x2f7d3c;
  const crown: Vox[] = [];
  const leaf = (x: number, y: number, z: number, d: number) => {
    if (d > 0.55 && hash(x, y, z) > density) return null; // thin out from the outside in
    if (erde === "buff" && d > 0.7 && hash(x, y + 50, z) > 0.86) return 0xf9a8d4; // blossoms
    const h = hash(x + 9, y, z);
    return h > 0.66 ? leafB : h < 0.25 ? leafC : leafA;
  };
  blob(crown, tx - 0.5, 15.5, tz - 0.5, 6.4, 5.2, 6, leaf);
  blob(crown, tx + 5, 12.5, tz + 0.5, 4, 3.4, 4, leaf);
  blob(crown, tx - 5.5, 13, tz + 1.5, 4.2, 3.4, 4, leaf);
  blob(crown, tx - 1, 13, tz + 4.5, 3.6, 3, 3.4, leaf);

  const root = new Group();
  root.add(mesh(trunk, mat, TERRAIN));
  const crownG = new Group();
  const pivot: [number, number, number] = [tx, 11, tz];
  crownG.position.set(pivot[0] * TERRAIN, pivot[1] * TERRAIN, pivot[2] * TERRAIN);
  crownG.add(mesh(crown, mat, TERRAIN, pivot, 0.08));
  root.add(crownG);
  return { root, crown: crownG };
}

// ───────────────────────── Campfire (Feuer) ─────────────────────────

export function buildCampfire(mat: Material): Group {
  const [fx, fz] = SPOTS.fire;
  const v: Vox[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.round(fx + Math.cos(a) * 2.6);
    const z = Math.round(fz + Math.sin(a) * 2.6);
    v.push([x, 0, z, hash(i, 1) > 0.5 ? 0x8b909c : 0x767b88]);
  }
  // crossed logs, charred in the middle
  for (let i = -1; i <= 1; i++) v.push([fx + i, 0, fz, i === 0 ? 0x2a211c : 0x5c3d28], [fx, 0, fz + i, 0x5c3d28], [fx + i, 1, fz + (i === 0 ? 0 : i), 0x4a3020]);
  // a log to sit on
  box(v, fx - 6, 0, fz - 2, fx - 5, 0, fz + 2, (x, _y, z) => (z === fz - 2 || z === fz + 2 ? 0xc9a36b : x === fx - 6 ? 0x6b4a32 : 0x7d573a));
  const g = new Group();
  g.add(mesh(v, mat, TERRAIN));
  return g;
}

// ───────────────────────── Windmill (Luft) ─────────────────────────

export interface Mill {
  root: Group;
  blades: Group;
}

export function buildMill(mat: Material): Mill {
  const [mx, mz] = SPOTS.mill;
  const v: Vox[] = [];
  const wall = (x: number, y: number, z: number) => (y <= 1 ? (hash(x, y, z) > 0.5 ? 0x9aa0ab : 0x868c98) : hash(x, y, z) > 0.85 ? 0xe2d8c0 : 0xf2ead8);
  for (let y = 0; y <= 13; y++) {
    const hw = y <= 2 ? 3 : y <= 9 ? 2.5 : 2;
    const lo = Math.ceil(-hw);
    const hi = Math.floor(hw - 0.5);
    for (let x = lo; x <= hi; x++)
      for (let z = lo; z <= hi; z++) {
        if (x !== lo && x !== hi && z !== lo && z !== hi && y < 13) continue; // hollow
        v.push([mx + x, y, mz + z, wall(x, y, z)]);
      }
  }
  // door and window on the front
  box(v, mx - 1, 0, mz + 2, mx, 2, mz + 2, 0x6b4a32);
  box(v, mx - 1, 6, mz + 2, mx, 7, mz + 2, 0x2b4a7a);
  // roof
  for (let i = 0; i < 4; i++) {
    const hw = 3 - i;
    box(v, mx - hw, 14 + i, mz - hw, mx + hw - 1, 14 + i, mz + hw - 1, (x, y, z) => (hash(x, y, z) > 0.6 ? 0xa84a34 : 0xbd5a40));
  }
  const root = new Group();
  root.add(mesh(v, mat, TERRAIN));

  // four sails around a hub on the front wall
  const b: Vox[] = [];
  const blade = (rot: number) => {
    for (let i = 1; i <= 9; i++) {
      const cells: [number, number, number][] = [[0, i, 0x6b4a32]];
      if (i >= 3) cells.push([1, i, i % 2 ? 0xf8fafc : 0xe2e8f0], [2, i, i % 2 ? 0xe2e8f0 : 0xf8fafc]);
      for (const [x, y, c] of cells) {
        const [rx, ry] = rot === 0 ? [x, y] : rot === 1 ? [-y, x] : rot === 2 ? [-x, -y] : [y, -x];
        b.push([rx, ry, 0, c]);
      }
    }
  };
  [0, 1, 2, 3].forEach(blade);
  b.push([0, 0, 0, 0x4a3020], [0, 0, 1, 0x4a3020]);
  const blades = new Group();
  blades.position.set((mx - 0.5) * TERRAIN, 11.5 * TERRAIN, (mz + 3.5) * TERRAIN);
  blades.add(mesh(b, mat, TERRAIN, [0.5, 0.5, 0.5], 0.03));
  root.add(blades);
  return { root, blades };
}

// ───────────────────────── Clouds ─────────────────────────

export function buildCloud(mat: Material, seed: number): Mesh {
  const v: Vox[] = [];
  const n = 3 + Math.floor(hash(seed, 1) * 3);
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * 3.4 + hash(seed, i, 2) * 1.5;
    const mid = 1 - Math.abs(i - (n - 1) / 2) / n; // biggest puff in the middle
    const r = 2 + mid * 2.2 + hash(seed, i, 3);
    blob(v, cx, 0, hash(seed, i, 4) * 2, r + 0.8, r * 0.85, r * 0.8, (_x, y) => (y < 0 ? null : y < 1 ? 0xd6e2f2 : 0xffffff));
  }
  return new Mesh(voxelGeometry(v, { size: 0.3, jitter: 0.012, ao: 0.35, bake: true }), mat);
}
