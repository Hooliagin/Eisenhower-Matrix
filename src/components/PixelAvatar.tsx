/**
 * Pixel-art Joshua: blond, athletic, green sweater (what he often wears), MMA gloves, Master cap, tea towel & badge from care work.
 * Drawn from a character map so it stays crisp at any size; an outline is added automatically.
 */
const SPRITE = [
  "....KKKKKKKKKKKK....",
  "...KkkkkkkkkkkkkKY..",
  "......KKKKKKKK...Y..",
  ".....HHHHHHHHHH..Y..",
  ".....HhHHHHHHhH..y..",
  ".....HSSSSSSSSH.....",
  "......SESSSSES......",
  "......SSSSSSSS......",
  "......SSSmmSSS......",
  ".......SSSSSS.......",
  "........ssss........",
  "....TTTTRRRRTTTT....",
  "..TTDDTTTTTTTTTTTT..",
  "..TTDdTTTTtTTTTTTT..",
  "..TtDDTTTTBTTTTTtT..",
  "..TT.dDTTTtTTTT.TT..",
  "..RR..TTTTTTTT..RR..",
  "..GG..RRRRRRRR..GG..",
  ".GGgG.PPPPPPPP.GgGG.",
  ".GgGG.PPPPPPPP.GGgG.",
  ".....PPPPPPPPPP.....",
  ".....PPPP..PPPP.....",
  ".....PPPP..PPPP.....",
  ".....PPPp..pPPP.....",
  ".....PPPP..PPPP.....",
  ".....PPPP..PPPP.....",
  ".....FFFF..FFFF.....",
  "....FFFFF..FFFFF....",
];

// Outfit: Master cap with gold tassel (Politikwissenschaft), MMA gloves, tea towel + name badge (Alltagsbegleiter in der Pflege).
const PALETTE: Record<string, string> = {
  K: "#475569", // mortarboard
  k: "#94a3b8",
  Y: "#fbbf24", // tassel
  y: "#d97706",
  H: "#f4d35e", // blond
  h: "#c9a227",
  S: "#f2c29b", // skin
  s: "#d89c74",
  m: "#b9735a", // mouth
  E: "#1e3a8a", // eyes
  T: "#2f7a46", // green sweater
  t: "#24603a", // knit shading
  R: "#1d4d2f", // ribbed collar, cuffs & hem
  D: "#e2e8f0", // tea towel
  d: "#60a5fa", // towel stripe
  B: "#f8fafc", // name badge
  G: "#dc2626", // MMA gloves
  g: "#0f172a",
  P: "#334155", // pants
  p: "#1e293b",
  F: "#e2e8f0", // shoes
};

export default function PixelAvatar({ size = 120, glow = "#22d3ee" }: { size?: number; glow?: string }) {
  const h = SPRITE.length;
  const w = SPRITE[0].length;
  const filled = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && SPRITE[y][x] !== ".";
  const outline: [number, number][] = [];
  for (let y = -1; y <= h; y++)
    for (let x = -1; x <= w; x++)
      if (!filled(x, y) && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) outline.push([x, y]);

  return (
    <svg
      viewBox={`-2 -2 ${w + 4} ${h + 4}`}
      width={(size * (w + 4)) / (h + 4)}
      height={size}
      className="pixelated animate-[bob_2.4s_ease-in-out_infinite]"
      aria-label="Pixel-Avatar"
      style={{ filter: `drop-shadow(0 0 6px ${glow}88)` }}
    >
      <ellipse cx={w / 2} cy={h + 0.6} rx={w / 3} ry={0.9} fill={glow} opacity={0.25} />
      {outline.map(([x, y]) => (
        <rect key={`o${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill="#05070c" />
      ))}
      {SPRITE.flatMap((row, y) =>
        [...row].map((c, x) => (c === "." ? null : <rect key={`${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill={PALETTE[c]} />)),
      )}
    </svg>
  );
}
