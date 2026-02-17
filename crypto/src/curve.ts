/**
 * Stark curve utilities using @scure/starknet.
 *
 * The Stark curve is a Weierstrass curve over a prime field,
 * used natively by Starknet for signatures and Pedersen hashes.
 */

import { Point } from "@scure/starknet";

export { Point };
export type ProjectivePoint = InstanceType<typeof Point>;

/** Generator point G. */
export const G = Point.BASE;

/** Identity / point at infinity. */
export const ZERO = Point.ZERO;

/** Curve order. Read from the internal field. */
// The Stark curve order:
export const CURVE_ORDER = 0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;

/** Multiply generator by scalar: s * G */
export function scalarMulG(scalar: bigint): ProjectivePoint {
  if (scalar === 0n) return ZERO;
  return G.multiply(mod(scalar));
}

/** Multiply arbitrary point by scalar: s * P */
export function scalarMul(point: ProjectivePoint, scalar: bigint): ProjectivePoint {
  if (scalar === 0n) return ZERO;
  if (point.equals(ZERO)) return ZERO;
  return point.multiply(mod(scalar));
}

/** Add two points: P + Q */
export function pointAdd(p: ProjectivePoint, q: ProjectivePoint): ProjectivePoint {
  return p.add(q);
}

/** Negate a point: -P */
export function pointNeg(p: ProjectivePoint): ProjectivePoint {
  return p.negate();
}

/** Subtract two points: P - Q */
export function pointSub(p: ProjectivePoint, q: ProjectivePoint): ProjectivePoint {
  return p.add(q.negate());
}

/** Reduce scalar modulo curve order, always positive. */
export function mod(n: bigint): bigint {
  const result = n % CURVE_ORDER;
  return result < 0n ? result + CURVE_ORDER : result;
}

/** Convert a point to affine (x, y) coordinates as bigints. */
export function toAffine(point: ProjectivePoint): { x: bigint; y: bigint } {
  const aff = point.toAffine();
  return { x: aff.x, y: aff.y };
}

/** Check if a point is the identity (zero). */
export function isZero(point: ProjectivePoint): boolean {
  return point.equals(ZERO);
}

/** Create a point from affine coordinates. */
export function fromAffine(x: bigint, y: bigint): ProjectivePoint {
  return Point.fromAffine({ x, y });
}
