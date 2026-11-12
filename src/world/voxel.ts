import { BufferAttribute, BufferGeometry } from "three";

/** One voxel: integer grid position and colour (0xRRGGBB). */
export type Vox = [x: number, y: number, z: number, color: number];

/** Deterministic pseudo-random in [0, 1) from integers – the world looks the same on every visit. */
export function hash(x: number, y = 0, z = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0, 1]. */
export function noise2(x: number, z: number, seed = 0): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, seed, z0);
  const b = hash(x0 + 1, seed, z0);
  const c = hash(x0, seed, z0 + 1);
  const d = hash(x0 + 1, seed, z0 + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const key = (x: number, y: number, z: number) => (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512);

// The six faces: normal, then the two in-plane axes (u, v) so that u × v = normal (counter-clockwise from outside).
const FACES: { n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];
const AO = [0.45, 0.65, 0.84, 1];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export interface GeometryOptions {
  /** Edge length of one voxel in world units. */
  size: number;
  /** Random brightness variation per voxel (0.06 = ±6 %) – keeps big surfaces from looking flat. */
  jitter?: number;
  /** Strength of the baked corner shadows (0 = off, 1 = full). */
  ao?: number;
  /** Shift so that this grid point becomes the mesh origin (pivot for rotations). */
  origin?: [number, number, number];
  /** Bake a simple top-light into the colours – for unlit materials (clouds), which would otherwise look flat. */
  bake?: boolean;
}

/**
 * Turn voxels into one mesh: only faces that border air are emitted, colours go into vertex colours,
 * and every vertex is darkened by its neighbours ("ambient occlusion") – that is what makes voxel art read as solid.
 */
export function voxelGeometry(voxels: Vox[], { size, jitter = 0.05, ao = 1, origin = [0, 0, 0], bake = false }: GeometryOptions): BufferGeometry {
  const solid = new Set<number>();
  for (const [x, y, z] of voxels) solid.add(key(x, y, z));
  const has = (x: number, y: number, z: number) => solid.has(key(x, y, z));

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const seen = new Set<number>();

  for (const [x, y, z, color] of voxels) {
    const k = key(x, y, z);
    if (seen.has(k)) continue; // later duplicates lose – builders can simply paint over
    seen.add(k);
    // Vertex colours live in linear space; the palette is written in sRGB like everywhere else in the app.
    const j = 1 + (hash(x, y, z) - 0.5) * 2 * jitter;
    const r = toLinear(((color >> 16) & 255) / 255) * j;
    const g = toLinear(((color >> 8) & 255) / 255) * j;
    const b = toLinear((color & 255) / 255) * j;

    for (const { n, u, v } of FACES) {
      if (has(x + n[0], y + n[1], z + n[2])) continue;
      const base = positions.length / 3;
      const shade: number[] = [];
      const lit = !bake ? 1 : n[1] > 0 ? 1 : n[1] < 0 ? 0.62 : n[2] > 0 ? 0.9 : n[0] !== 0 ? 0.8 : 0.72;
      // corners in the order (-u,-v) (+u,-v) (+u,+v) (-u,+v)
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const px = x + 0.5 + n[0] * 0.5 + u[0] * 0.5 * su + v[0] * 0.5 * sv;
        const py = y + 0.5 + n[1] * 0.5 + u[1] * 0.5 * su + v[1] * 0.5 * sv;
        const pz = z + 0.5 + n[2] * 0.5 + u[2] * 0.5 * su + v[2] * 0.5 * sv;
        positions.push((px - origin[0]) * size, (py - origin[1]) * size, (pz - origin[2]) * size);
        normals.push(n[0], n[1], n[2]);
        const s1 = has(x + n[0] + u[0] * su, y + n[1] + u[1] * su, z + n[2] + u[2] * su);
        const s2 = has(x + n[0] + v[0] * sv, y + n[1] + v[1] * sv, z + n[2] + v[2] * sv);
        const c = has(x + n[0] + u[0] * su + v[0] * sv, y + n[1] + u[1] * su + v[1] * sv, z + n[2] + u[2] * su + v[2] * sv);
        const level = s1 && s2 ? 0 : 3 - (Number(s1) + Number(s2) + Number(c));
        const f = (1 - (1 - AO[level]) * ao) * lit;
        shade.push(f);
        colors.push(Math.min(1, r * f), Math.min(1, g * f), Math.min(1, b * f));
      }
      // split the quad along the brighter diagonal, otherwise the shading looks lopsided
      if (shade[0] + shade[2] > shade[1] + shade[3]) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/** Filled box of voxels (inclusive bounds). */
export function box(out: Vox[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | ((x: number, y: number, z: number) => number)) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) out.push([x, y, z, typeof color === "function" ? color(x, y, z) : color]);
}

/** Filled ellipsoid of voxels around a centre; `keep` can punch holes or pick colours (return null to skip). */
export function blob(out: Vox[], cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: (x: number, y: number, z: number, d: number) => number | null) {
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2;
        if (d > 1) continue;
        const c = color(x, y, z, d);
        if (c !== null) out.push([x, y, z, c]);
      }
}

export const hex = (s: string) => parseInt(s.replace("#", ""), 16);

/** Blend two 0xRRGGBB colours. */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
