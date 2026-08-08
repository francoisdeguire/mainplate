/**
 * Pure geometry. Zero imports, no React, no DOM.
 * May import: nothing. Must not import: anything.
 */

/** An angle in degrees. 0 is 12 o'clock; positive is clockwise. */
export type Degrees = number

/** A length in dial units, where the frame's nominal radius is 100. */
export type DialUnits = number

/** A value between a frame's `min` and `max`. */
export type DomainValue = number

/** A cartesian point in dial units, origin at the dial centre. */
export type Point = { x: DialUnits; y: DialUnits }

/** The angular coordinate system: how a domain value becomes an angle. */
export type Scale = {
  min: DomainValue
  max: DomainValue
  startAngle: Degrees
  sweepAngle: Degrees
}

/**
 * The frame's nominal radius. All dial-unit geometry is relative to this.
 * @default 100
 */
export const DIAL_RADIUS = 100

const DEG_TO_RAD = Math.PI / 180

/**
 * Convert polar to cartesian in mainplate's convention: 0 degrees is up (-y),
 * positive is clockwise.
 */
export function polar(angle: Degrees, r: DialUnits): Point {
  const rad = angle * DEG_TO_RAD
  return { x: r * Math.sin(rad), y: -r * Math.cos(rad) }
}

/** Wrap any angle into [0, 360). */
export function normalizeAngle(a: Degrees): Degrees {
  const m = a % 360
  return m < 0 ? m + 360 : m
}

/**
 * Map a domain value onto the scale's angle.
 *
 * A degenerate domain (min === max) would divide by zero and produce a NaN
 * transform, which makes an element vanish with no error. Falls back to
 * startAngle instead. See spec section 17.
 */
export function valueToAngle(value: DomainValue, s: Scale): Degrees {
  const span = s.max - s.min
  if (span === 0) return s.startAngle
  return s.startAngle + ((value - s.min) / span) * s.sweepAngle
}

/** Inverse of `valueToAngle`. */
export function angleToValue(angle: Degrees, s: Scale): DomainValue {
  if (s.sweepAngle === 0) return s.min
  return s.min + ((angle - s.startAngle) / s.sweepAngle) * (s.max - s.min)
}

/**
 * Format a number for SVG path data at fixed precision.
 *
 * Path strings are snapshot-tested, and raw float output differs across
 * platforms and JS engines. Rounding here keeps those snapshots stable.
 */
export function fmt(n: number): string {
  const rounded = Number(n.toFixed(4))
  return String(rounded === 0 ? 0 : rounded)
}

/**
 * Tolerance for comparing two domain values, scaled to the domain's span.
 *
 * Tick positions are computed as `from + k * every`; two tiers can land on the
 * same conceptual position while differing in the last float bit. Comparing
 * with this epsilon is what lets the tier merge actually merge.
 */
export function epsilonFor(s: Pick<Scale, "min" | "max">): number {
  const span = Math.abs(s.max - s.min)
  return (span || 1) * 1e-9
}
