/**
 * The face vocabulary: place, orient, span — and the one function that turns
 * any of them into CSS.
 * May import: core. Must not import: react, the DOM, time/.
 *
 * Everything the HTML faces draw reduces to a handful of verbs, and this is the
 * only module that knows how they become numbers. **No part assembles a
 * transform by hand.** That is not tidiness: the spike hand-rolled the same
 * arithmetic at five call sites and shipped two distinct defects — a perimeter
 * normal with the sign inverted, and unquantised floats in inline styles that
 * reintroduced the hydration mismatch within an hour. Both are single-site
 * problems here.
 *
 * Two conventions the returned values assume, because the callers all share
 * them:
 *
 * - **`left`/`top` name the element's CENTRE**, so the element needs
 *   `translate(-50%, -50%)` of its own — the same division of labour
 *   `dialPercent` documents, and for the same reason: returning the transform
 *   would clobber the caller's.
 * - **The face box is centred on the dial origin.** Every outline's bbox is,
 *   and `frameBox` grows it symmetrically, so `boxW`/`boxH` are all this
 *   module needs to place a point in it.
 */
import {
  type Degrees,
  type DialUnits,
  fmt,
  type Outline,
  type Point,
  polar,
  quantize,
} from "../core"

/**
 * Which way a mark faces at its point.
 *
 * `edge` — not `normal` — because "normal" is overloaded, and because `edge`
 * and `radial` are *identical on a circle*: mixing them up is silent until
 * somebody sets a rect shape. `tangent` follows the direction of travel;
 * `upright` never turns, which is what a numeral usually wants.
 */
export type Orient = "radial" | "edge" | "tangent" | "upright"

/**
 * Where a mark sits: by frame angle, or by distance along the perimeter.
 *
 * Both, because they answer different questions and diverge on every
 * non-circular outline — angular placement puts III under the 3 o'clock ray,
 * perimeter placement spaces sixty minutes evenly around the edge. The
 * `?: never` fields make passing both a compile error rather than a silent
 * precedence rule, matching the XOR unions in the rest of the library.
 */
export type Placement =
  | { angle: Degrees; inset: DialUnits; along?: never }
  | { along: DialUnits; inset: DialUnits; angle?: never }

/**
 * A positioned, sized, rotated element — the only currency the parts deal in.
 *
 * `left`/`top` are percentages of the face box because a face is sized by CSS
 * and has no pixel width until it is laid out. Sizes are `cqw` *numbers* (the
 * caller appends the unit) because 1cqw is one percent of the container's
 * inline size, which is the same thing at every size the face is ever drawn.
 * Both cqw fields scale by the box WIDTH: height divided by the box height
 * would look correct on a circle and squash every mark on a Tank.
 *
 * `rotate` is degrees and is deliberately **not** wrapped into [0, 360): an
 * angular placement reports the angle it was given, so a rotation binder can
 * accumulate monotonically across the 354°→0° seam instead of watching a CSS
 * transition spin the long way back.
 */
export type MarkTransform = {
  left: string
  top: string
  widthCqw: number
  heightCqw: number
  rotate: number
}

/** Options shared by every call: the face box the result is expressed against. */
type BoxOptions = {
  /** The face box's width in dial units — `frameBox().width`. */
  boxW: DialUnits
  /** The face box's height in dial units — `frameBox().height`. */
  boxH: DialUnits
}

const RAD_TO_DEG = 180 / Math.PI

/**
 * Below this, a direction is noise rather than a direction: the only way to
 * reach it is a fully collapsed outline, whose normals are the zero vector by
 * contract. Dividing by it would emit `Infinity` into a style.
 */
const DIRECTION_FLOOR = 1e-9

/**
 * The rotation that turns an element's own top toward `d`.
 *
 * Elements are authored pointing up — a tick is a tall thin div — so this is
 * the angle between screen-up and the target direction, in mainplate's
 * convention: 0 at twelve, clockwise positive, `-y` up. A zero-length
 * direction has no rotation, and 0 is the honest answer there; `atan2` would
 * invent 180 out of `-0`.
 */
function rotationToward(d: Point): Degrees {
  if (Math.hypot(d.x, d.y) < DIRECTION_FLOOR) return 0
  return Math.atan2(d.x, -d.y) * RAD_TO_DEG
}

/**
 * One axis of the box mapping, as a percentage string.
 *
 * Split per axis so the two extents cannot be quietly shared — on any
 * non-square face they differ, and using the width twice looks a little off
 * rather than broken. A zero extent is only reachable through a custom
 * `Outline` whose bbox collapses; half-way beats the `NaN` that makes an
 * element vanish with nothing in the console, exactly as `layer.ts` decides.
 */
function percentAlong(value: DialUnits, extent: DialUnits): string {
  return `${fmt(extent === 0 ? 50 : 50 + (100 * value) / extent)}%`
}

/** Dial units as container-query units: percent of the face box's width. */
function cqw(u: DialUnits, boxW: DialUnits): number {
  return boxW === 0 ? 0 : quantize((u / boxW) * 100)
}

/**
 * The single exit point, so quantisation cannot be forgotten at one of them.
 *
 * Every number here reaches an inline style, and a raw float serialises
 * differently on the server than in the browser — `Math.sin` is not spec-pinned
 * to the last ULP, which is enough for React to call it a hydration mismatch.
 * `quantize` is `fmt`'s own rule (4dp, `-0` normalised), reused rather than
 * re-derived so the SVG layer and the HTML layer round identically.
 */
function transformOf(
  centre: Point,
  width: DialUnits,
  length: DialUnits,
  rotate: Degrees,
  { boxW, boxH }: BoxOptions,
): MarkTransform {
  return {
    left: percentAlong(centre.x, boxW),
    top: percentAlong(centre.y, boxH),
    widthCqw: cqw(width, boxW),
    heightCqw: cqw(length, boxW),
    rotate: quantize(rotate),
  }
}

/**
 * A dial point as the `left`/`top` percentages of the face box — the anchor a
 * positioned element pairs with its own `translate(-50%, -50%)`.
 *
 * This is `markTransform` minus the mark: a complication's anchor has no
 * width, length or orientation of its own — its content is arbitrary HTML —
 * but its position must go through the same quantised box mapping as every
 * mark, or the one component that positions free content would be the one
 * place a raw float could reach a style.
 */
export function anchorPercent(point: Point, box: BoxOptions): { left: string; top: string } {
  return { left: percentAlong(point.x, box.boxW), top: percentAlong(point.y, box.boxH) }
}

/**
 * Place one mark: a point from the outline, a direction to face, a size.
 *
 * This is `place` and `orient` in one call, and it is how every tick, numeral,
 * index and complication anchor is positioned. The default orientation is
 * `edge` because that is what a mark on a shaped face wants — perpendicular to
 * the outline it sits on — and because on the circle everyone starts with it
 * is indistinguishable from `radial`.
 *
 * `length` is the mark's extent along its own rotated axis; it never moves the
 * point, which stays the mark's centre. To grow a mark inward from the edge,
 * pass the inset of its midpoint — the geometry here is deliberately not
 * opinionated about which end is anchored.
 *
 * Assumes the face box is centred on the frame origin; true for every built-in
 * outline, which is why `boxW`/`boxH` are all it takes rather than the whole
 * `Rect`.
 */
export function markTransform(
  outline: Outline,
  placement: Placement,
  options: BoxOptions & {
    /** @default "edge" */
    orient?: Orient
    /** Across the mark's own axis, in dial units. */
    width: DialUnits
    /** Along the mark's own axis, in dial units. */
    length: DialUnits
  },
): MarkTransform {
  const { orient = "edge", width, length } = options
  const { inset } = placement
  const byLength = placement.along !== undefined

  // The two placement queries are the outline's own; nothing is re-derived
  // here, so a mark and the outline it sits on can never disagree.
  const point = byLength
    ? outline.pointAtLength(placement.along, inset)
    : outline.pointAt(placement.angle, inset)

  // `normalAt` points inward by contract and `outwardNormalAtLength` outward: a mark
  // faces away from the face, so the angular one is negated and the perimeter
  // one is not. This asymmetry is the sign bug the spike shipped; it lives at
  // exactly one line now.
  const outward = byLength
    ? outline.outwardNormalAtLength(placement.along, inset)
    : negate(outline.normalAt(placement.angle, inset))

  // Angular placement knows its own rotation exactly — no `atan2` round trip,
  // and it matches `spanTransform`'s `rotate` by construction.
  const radial = byLength ? rotationToward(point) : placement.angle
  const edge = rotationToward(outward)

  const rotate =
    orient === "upright"
      ? 0
      : orient === "radial"
        ? radial
        : orient === "tangent"
          ? edge + 90
          : edge

  return transformOf(point, width, length, rotate, options)
}

/**
 * Span two insets along one frame ray: the Meridian tick primitive.
 *
 * The owner's correction to the spike, and the reason this is its own verb.
 * A mark on a rectangular face is **not** an edge-perpendicular bar of fixed
 * length — it is the segment of the ray between two parallel insets, rotated to
 * the angle itself. The uniform ring then falls out for free: near a corner the
 * ray meets the edge obliquely, the segment stretches by `1/cos θ`, and the
 * inner ends still describe a clean inset outline. Deriving the same mark from
 * the edge normal instead gives every tick the same length and destroys that
 * ring — which is the mutation this module's tests are built around, and which
 * is invisible on a circle, where the ray *is* the normal.
 *
 * `obliquityWidth` applies the matching `w / cos θ` correction across the mark.
 * Without it an oblique tick reads thinner than its neighbours, because what
 * the eye measures is the width perpendicular to the *edge*, not to the ray.
 * It is opt-in because a genuinely radial mark — a needle, a baton index —
 * should keep its literal width.
 */
export function spanTransform(
  outline: Outline,
  angle: Degrees,
  i0: DialUnits,
  i1: DialUnits,
  options: BoxOptions & {
    /** Across the mark's own axis, in dial units. */
    width: DialUnits
    /** Widen by `1/cos θ` so oblique marks do not read thin. @default false */
    obliquityWidth?: boolean
  },
): MarkTransform {
  const { width, obliquityWidth = false } = options

  const p0 = outline.pointAt(angle, i0)
  const p1 = outline.pointAt(angle, i1)
  const centre = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
  const length = Math.hypot(p1.x - p0.x, p1.y - p0.y)

  return transformOf(
    centre,
    obliquityWidth ? width / obliquity(outline, angle, i0) : width,
    length,
    angle,
    options,
  )
}

/**
 * `cos θ` between the frame ray and the outline's edge at `angle` — 1 where the
 * ray meets the edge square on, smaller as it grazes.
 *
 * Taken as a magnitude because the two vectors point opposite ways by contract:
 * the ray leaves the centre and `normalAt` returns the *inward* normal, so
 * their dot product is the negative of the cosine wanted here. Floored rather
 * than divided by zero — a collapsed outline reports a zero-length normal, and
 * `Infinity` in a style is a vanished element.
 */
function obliquity(outline: Outline, angle: Degrees, inset: DialUnits): number {
  const ray = polar(angle, 1)
  const normal = outline.normalAt(angle, inset)
  const cos = Math.abs(ray.x * normal.x + ray.y * normal.y)
  return cos < DIRECTION_FLOOR ? 1 : cos
}

/** The opposite direction — one named place for the inward/outward flip. */
function negate(p: Point): Point {
  return { x: -p.x, y: -p.y }
}
