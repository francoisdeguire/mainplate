/**
 * Arc path data: engine math, extracted from the SVG `<Arc>` primitive.
 *
 * Building the `d` for a sweep between two angles — on a frame-anchored
 * circle or along an outline's own shape — is geometry, not a component. It
 * lives here so both the frozen SVG layer and the HTML face layer can build
 * the same path from the same code. React-free by construction.
 */
import { type Degrees, type DialUnits, fmt, normalizeAngle, polar } from "./geometry"
import type { Outline } from "./outline"

/**
 * Which edge of a stroke sits on the anchor, along the stroke's own up-axis.
 *
 * The same three values the SVG layer's `<Ticks align>` takes — declared here
 * because `arcPath` is engine code and cannot reach into `legacy/`. The two
 * unions are compared by the compiler wherever `legacy/arc.tsx` passes its
 * own `Align` into `arcPath`, so they cannot drift apart unnoticed.
 */
export type Align = "inside" | "center" | "outside"

/**
 * Sweeps this close to nothing or to a full turn snap to those cases. Below
 * quantisation, an open arc's endpoints round to the same coordinates — and
 * SVG draws *nothing* for an `A` whose endpoints coincide, so a gauge at
 * 99.99% of its sweep would vanish instead of closing into the ring.
 */
const SWEEP_EPSILON = 1e-4

const RAD_TO_DEG = 180 / Math.PI

/**
 * Arc length along the outline of the point at `angle`, found by bisection.
 *
 * The outline answers angle→point and length→point but not angle→length, and
 * tracing needs the arc-length coordinates of the two endpoints. On every
 * outline this library builds — closed, convex, centred on the origin — the
 * clock angle of `pointAtLength(s)` grows monotonically from 0 to 360 over
 * one perimeter, so the inverse is a clean bisection: 52 halvings put the
 * error below a millionth of a dial unit, far under `fmt`'s quantisation.
 */
function lengthAtAngle(
  outline: Outline,
  angle: Degrees,
  inset: DialUnits,
  total: DialUnits,
): DialUnits {
  const target = normalizeAngle(angle)
  if (target === 0) return 0
  let lo = 0
  let hi = total
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2
    const p = outline.pointAtLength(mid, inset)
    const raw = normalizeAngle(Math.atan2(p.x, -p.y) * RAD_TO_DEG)
    // The seam: a point rounding to exactly the top-centre reads as angle 0,
    // which in the second half of the walk means 360, not the start.
    const a = raw === 0 && mid > total / 2 ? 360 : raw
    if (a <= target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The path data for an arc, shared verbatim by the render path and the ref
 * path so the two cannot disagree — the same reasoning as `<Hand>`'s
 * `buildOverride`. Every coordinate goes through `fmt`: this string is a
 * hydration boundary, and with a `Source` it is also rewritten outside React,
 * where the render path's quantisation cannot cover it.
 *
 * The full-sweep circular form is written in `circleOutline().path()`'s exact
 * shape — two half-arcs, since SVG cannot express a full circle in one arc
 * command — so `r` and `inset` coinciding on a circle is visible as literal
 * string equality, not just as geometry.
 */
export function arcPath(
  outline: Outline,
  angleFrom: Degrees,
  angleTo: Degrees,
  r: DialUnits | undefined,
  inset: DialUnits,
  align: Align,
  strokeWidth: DialUnits,
): string {
  const sweep = angleTo - angleFrom
  // Nothing to draw — but the caller still renders the node, because a
  // Source may drive the sweep off zero without a React render.
  if (Math.abs(sweep) < SWEEP_EPSILON) return ""
  const full = Math.abs(sweep) >= 360 - SWEEP_EPSILON

  if (r !== undefined) {
    // Inside means deeper into the face: for a frame anchor, a smaller radius.
    const shift = align === "inside" ? -strokeWidth / 2 : align === "outside" ? strokeWidth / 2 : 0
    const radius = Math.max(r + shift, 0)
    const f = fmt(radius)
    if (full) {
      return `M 0 ${fmt(-radius)} A ${f} ${f} 0 1 1 0 ${f} A ${f} ${f} 0 1 1 0 ${fmt(-radius)} Z`
    }
    const p0 = polar(angleFrom, radius)
    const p1 = polar(angleTo, radius)
    const large = Math.abs(sweep) > 180 ? 1 : 0
    const dir = sweep > 0 ? 1 : 0
    return `M ${fmt(p0.x)} ${fmt(p0.y)} A ${f} ${f} 0 ${large} ${dir} ${fmt(p1.x)} ${fmt(p1.y)}`
  }

  // The same shift with the opposite sign: an inset already measures inward,
  // so deeper is a *larger* inset. Negative is legal — an outside-aligned
  // stroke on the outline itself sits beyond it, and the outline's own inset
  // handling grows outward correctly, rounding the corners a true outward
  // offset acquires.
  const shift = align === "inside" ? strokeWidth / 2 : align === "outside" ? -strokeWidth / 2 : 0
  const effInset = inset + shift

  // A full sweep along the outline is the outline: exact, closed, no samples.
  if (full) return outline.path(effInset)

  const total = outline.length(effInset)
  if (total <= 0) return ""

  const s0 = lengthAtAngle(outline, angleFrom, effInset, total)
  const s1 = lengthAtAngle(outline, angleTo, effInset, total)
  // Signed distance to walk, wrapping in the sweep's direction. `forward` and
  // its backward complement sum to the perimeter, so the negative branch is
  // just the other way round the case.
  const forward = (((s1 - s0) % total) + total) % total
  const walk = sweep > 0 ? forward : forward - total
  if (walk === 0) return ""

  // A polyline along the outline, one sample per ≤2 dial units. The chord
  // error is r·Δθ²/8: under 0.006 units on the main circle, and still under
  // a tenth of a unit on the tightest corner an outline offers — beneath
  // visibility at any size a face renders at. `pointAtLength` wraps, so the
  // walk may cross the top-centre seam freely.
  const segments = Math.max(8, Math.ceil(Math.abs(walk) / 2))
  const parts: string[] = []
  for (let i = 0; i <= segments; i++) {
    const p = outline.pointAtLength(s0 + (walk * i) / segments, effInset)
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(p.x)} ${fmt(p.y)}`)
  }
  return parts.join(" ")
}
