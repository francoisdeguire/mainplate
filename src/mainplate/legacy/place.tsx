"use client"

/**
 * `<Place>`: put arbitrary children somewhere on the face.
 * May import: at, geometry, frame, ticks. Must not import: time/.
 *
 * The general escape hatch, and the reason §11.3's `<Pivot>` and §11.4's
 * `<Legend>` were cut: anything a face needs that is not a tick, a numeral, a
 * hand or an arc is this component wrapped around raw SVG.
 */
import type { SVGProps } from "react"
import { type Anchor, type At, resolveAt } from "../core/at"
import { type DialUnits, fmt, polar, quantize } from "../core/geometry"
import { useFrame } from "./frame"
import { type Orient, orientationOf } from "./ticks"

/**
 * Props for {@link Place}: a position, an anchor, two shifts, an orientation,
 * and any SVG prop.
 *
 * The per-primitive props are omitted from the `SVGProps` base because React
 * declares `r`, `offset` and `orient` as SVG attributes with quite different
 * meanings — `orient` is the `<marker>` one — and intersecting with those would
 * either widen the enum to `string` or reduce the anchor to `never`.
 *
 * `transform` is omitted for a different reason: this group's transform is the
 * position, so a caller's would silently replace it and the artwork would
 * render at the centre with nothing in the console. Wrap the children in a
 * `<g>` of your own, or reach for `nudge`.
 */
export type PlaceProps = Omit<
  SVGProps<SVGGElement>,
  "fill" | "offset" | "orient" | "r" | "transform"
> &
  Anchor & {
    /** Where it goes: degrees, a clock position, or a literal `[x, y]`. */
    at: At
    /**
     * Scalar tangential shift, in dial units — along the direction of travel
     * at `at`, positive clockwise.
     *
     * Deliberately in the frame's space rather than the artwork's, so it stays
     * tangential whatever `orient` does. Use `nudge` for a shift that should
     * turn with the artwork.
     *
     * @default 0
     */
    offset?: DialUnits
    /**
     * 2D shift in the artwork's own space, applied *after* the rotation — the
     * optical correction you reach for once something is already in place and
     * a hair off. On unrotated artwork it is plain `[right, down]`.
     *
     * @default [0, 0]
     */
    nudge?: [DialUnits, DialUnits]
    /**
     * How the children turn. The same enum, and the same rule, `<Ticks>` uses.
     *
     * Defaults to `upright` rather than to `radial`, unlike a tick mark: what
     * this component carries is arbitrary artwork — a logo, a date window, a
     * line of text — and the useful default for those is the one that leaves
     * them the way they were drawn. `<Place at="6h">SWISS</Place>` reading
     * upside down would be a rotation nobody asked for.
     *
     * @default "upright"
     */
    orient?: Orient
    /**
     * Paint the children inherit when they set none of their own. Defaults to
     * `currentColor` — the rule for every primitive's paint — so unfilled
     * artwork themes with an ancestor's `color` exactly as the built-ins do,
     * while a child's explicit `fill` still wins by SVG inheritance.
     * @default "currentColor"
     */
    fill?: string
  }

/**
 * Arbitrary children, positioned on the face.
 *
 * Three nested groups, per the normative §2.9 recipe: position, then rotation,
 * then the artwork's own space. They are always all three, even when two of
 * them are identities — `<Hand>` composes the same way, and a group that comes
 * and goes is a second DOM shape for consumers to style around and for us to
 * reason about.
 */
export function Place({
  at,
  r,
  inset,
  offset = 0,
  nudge,
  orient = "upright",
  fill = "currentColor",
  children,
  ...rest
}: PlaceProps) {
  const { frame } = useFrame()

  // Both go through as written, cast past the XOR union rather than picked
  // between: `resolveAt` owns the both-at-once error for every primitive, and
  // choosing a winner here would resolve the misuse before it could be seen.
  const { angle, point } = resolveAt(at, frame, { r, inset } as Anchor)

  // A quarter turn clockwise from the ray is the direction of travel, so this
  // is a tangential shift on any outline, at any orientation.
  const tangent = polar(angle + 90, offset)
  const normal = frame.outline.normalAt(angle, inset ?? 0)
  const rotation = quantize(orientationOf(orient, angle, normal))
  const [nx, ny] = nudge ?? [0, 0]

  return (
    <g
      fill={fill}
      {...rest}
      // After the spread, not before: the type already refuses a caller's
      // `transform`, and this is the second lock, for the untyped spread that
      // gets past it. `data-mp` sits behind the same lock — the data-*
      // exemption means the type never refused it at all — and stays a
      // compile-time static. Everything else a caller passes still wins.
      data-mp="place"
      transform={`translate(${fmt(point.x + tangent.x)} ${fmt(point.y + tangent.y)})`}
    >
      {/* Rotation about this group's own local origin. `transform-box` and
          `transform-origin` are written out rather than left to their
          defaults, which differ between SVG and HTML and changed between
          Transforms Level 1 and 2 — and `fill-box` would pivot each child
          around its own bounding box. Browser-verified in fixtures/transform.html. */}
      <g style={{ rotate: `${rotation}deg`, transformBox: "view-box", transformOrigin: "0 0" }}>
        <g transform={`translate(${fmt(nx)} ${fmt(ny)})`}>{children}</g>
      </g>
    </g>
  )
}
