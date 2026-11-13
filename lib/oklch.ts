type Vector3 = readonly [number, number, number];
type Matrix3 = readonly [Vector3, Vector3, Vector3];

// Björn Ottosson's linear sRGB → LMS → OKLab matrices: https://bottosson.github.io/posts/oklab/
const LMS_FROM_LINEAR_SRGB: Matrix3 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const OKLAB_FROM_LMS: Matrix3 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

/** Formats `#rrggbb` as `oklch(L C H)`, precise enough to round-trip to the same hex. */
export const formatOklch = (hex: string) => {
  const [lightness, a, b] = getOklab(hex);
  const chroma = Math.hypot(a, b);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

  return `oklch(${round(lightness, 4)} ${round(chroma, 4)} ${round(hue, 2)})`;
};

const getOklab = (hex: string) => {
  const linearRgb = [
    getLinearChannel(hex, 1),
    getLinearChannel(hex, 3),
    getLinearChannel(hex, 5),
  ] as const;
  const [l, m, s] = multiply(LMS_FROM_LINEAR_SRGB, linearRgb);

  return multiply(OKLAB_FROM_LMS, [Math.cbrt(l), Math.cbrt(m), Math.cbrt(s)]);
};

const getLinearChannel = (hex: string, start: number) => {
  const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;

  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const multiply = (matrix: Matrix3, vector: Vector3) =>
  [dot(matrix[0], vector), dot(matrix[1], vector), dot(matrix[2], vector)] as const;

const dot = (row: Vector3, [x, y, z]: Vector3) => row[0] * x + row[1] * y + row[2] * z;

const round = (value: number, digits: number) => Number(value.toFixed(digits));
