export const HEX_SIZE = 45;

export interface Hex {
  q: number;
  r: number;
}

export function hexToPixel(q: number, r: number) {
  const x = HEX_SIZE * 1.5 * q;
  const y = HEX_SIZE * Math.sqrt(3) * (r + q/2);
  return { x, y };
}

export function pixelToHex(x: number, y: number) {
  const q = (2/3 * x) / HEX_SIZE;
  const r = (-1/3 * x + Math.sqrt(3)/3 * y) / HEX_SIZE;
  return hexRound(q, r);
}

export function hexRound(q: number, r: number): Hex {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(-q - r);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - (-q - r));
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

export function getHexDistance(a: Hex, b: Hex) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export const HEX_DIRECTIONS: Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

export const generateId = () => Math.random().toString(36).substring(2, 9);
