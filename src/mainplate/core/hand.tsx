"use client"

/**
 * `<Hand>`: the moving pointer.
 * May import: frame, geometry. Must not import: time/.
 *
 * The controlled form — a pure function of props. Rotation is the only thing
 * this library animates and the single largest correctness risk, so the
 * transform is the browser-verified §2.9 recipe and nothing else: three nested
 * groups, only the middle one turning, `transform-box` and `transform-origin`
 * written out rather than inherited from a default that differs between SVG
 * and HTML. See `fixtures/transform.html`.
 */
import type { ReactNode, SVGProps } from "react"
import { type ScaleOverride, useFrame } from "./frame"
import { type Degrees, type DialUnits, type DomainValue, fmt, quantize } from "./geometry"

/**
 * Props for {@link Hand}: a value, the artwork's own frame of reference, the
 * built-in shape's dimensions, and any SVG prop.
 *
 * Six props are omitted from the `SVGProps` base because React declares them
 * as SVG attributes meaning something else here. `min` and `max` are SMIL's
 * animation bounds, typed `number | string`; on a hand they are the domain it
 * reads. `scale` is `<feDisplacementMap>`'s. `width` is the geometry
 * attribute, which on a hand is a dial-unit length rather than a viewport one.
 * `fill` narrows to a paint string.
 *
 * `transform` is omitted for a different reason: the root group's transform is
 * the hand's position on the face, so a caller's would silently replace it and
 * the hand would render somewhere else with nothing in the console. Reach for
 * `nudge`, or wrap your artwork in a `<g>` of your own.
 */
export type HandProps = Omit<
  SVGProps<SVGGElement>,
  "fill" | "max" | "min" | "scale" | "transform" | "width"
> & {
  /** Where the hand points, in domain units. */
  value: DomainValue
  /**
   * The artwork's rotation point, in the artwork's own coordinate space.
   *
   * Artwork exported from a drawing tool arrives with arbitrary coordinates,
   * and origin-is-pivot would be a constraint on the artwork rather than an
   * API. Consumed by stage 3 of the recipe, which slides this point onto the
   * rotation group's origin. @default [0, 0]
   */
  pivot?: [DialUnits, DialUnits]
  /**
   * Uniform scale for artwork not authored in dial units — a hand drawn 400
   * units tall in Figma comes in at `scale={0.2}`.
   *
   * Applied after `pivot` is subtracted, so the pivot is read in the units the
   * artwork was drawn in rather than in scaled ones. @default 1
   */
  scale?: number
  /**
   * 2D shift in the rotated local space, for optical alignment — the
   * correction you reach for once a hand is otherwise right and a hair off.
   *
   * In dial units, applied after `scale`, so rescaling the artwork does not
   * silently rescale the correction. @default [0, 0]
   */
  nudge?: [DialUnits, DialUnits]
  /** Built-in shape: how far the tip reaches from the pivot. @default 80 */
  length?: DialUnits
  /** Built-in shape: how far the counterweight reaches the other way. @default 0 */
  tail?: DialUnits
  /** Built-in shape: tangential extent, centred on the axis. @default 4 */
  width?: DialUnits
  /**
   * Lower bound of the domain this hand reads. Overrides the frame's for this
   * hand alone — a clock is three hands with three different maxima on one
   * face — and never writes back to it. @default the frame's `min`
   */
  min?: DomainValue
  /** Upper bound of the domain this hand reads. @default the frame's `max` */
  max?: DomainValue
  /** Angle this hand's `min` sits at. @default the frame's `startAngle` */
  startAngle?: Degrees
  /** Angle this hand's domain spans. @default the frame's `sweepAngle` */
  sweepAngle?: Degrees
  /**
   * Paint for the built-in shape, and the paint children inherit when they set
   * none. Defaults to `currentColor` — the rule for every primitive's paint —
   * so a single `color` on an ancestor themes the whole face.
   * @default "currentColor"
   */
  fill?: string
  /**
   * Render the root element yourself: `render={(props) => <motion.g {...props} />}`.
   *
   * Function form only, per §13.9 — an element form would need the prop-, ref-
   * and handler-merging machinery a zero-dependency library should not own.
   * It replaces the outer, static, positioning group; the rotating group stays
   * the library's, since that is the node the recipe pins and the node a
   * `Source` mutates.
   */
  render?: (props: SVGProps<SVGGElement> & { "data-mp": "hand"; children: ReactNode }) => ReactNode
}

/**
 * The built-in hand: a bar from the counterweight's end to the tip, centred on
 * the axis.
 *
 * Drawn pointing **up (−y)**, the artwork convention the whole library shares,
 * so a mark at angle θ rotates by exactly θ and no correction term exists
 * anywhere to get wrong.
 */
function handPath(length: DialUnits, tail: DialUnits, width: DialUnits): string {
  const hw = width / 2
  return [
    `M ${fmt(-hw)} ${fmt(tail)}`,
    `L ${fmt(-hw)} ${fmt(-length)}`,
    `L ${fmt(hw)} ${fmt(-length)}`,
    `L ${fmt(hw)} ${fmt(tail)}`,
    "Z",
  ].join(" ")
}

/**
 * A pointer that turns with a value.
 *
 * Pivots at the frame's centre, always: a hand pivoting somewhere else is a
 * `<Subdial>` (§8.8), and a second mechanism for it would be two ways to do
 * one thing. Draws a built-in bar unless given children, which may be any SVG.
 */
export function Hand({
  value,
  pivot,
  scale = 1,
  nudge,
  length = 80,
  tail = 0,
  width = 4,
  min,
  max,
  startAngle,
  sweepAngle,
  fill = "currentColor",
  render,
  children,
  ...rest
}: HandProps) {
  const { frame, angleFor } = useFrame()

  // Built key by key rather than spread wholesale: `{ ...frame, max: undefined }`
  // would overwrite the frame's `max` with `undefined` and take the mapping to
  // NaN, which makes a hand vanish with nothing in the console.
  const override: ScaleOverride = {}
  if (min !== undefined) override.min = min
  if (max !== undefined) override.max = max
  if (startAngle !== undefined) override.startAngle = startAngle
  if (sweepAngle !== undefined) override.sweepAngle = sweepAngle

  // Quantised because this string is a hydration boundary: the one node the
  // library animates is also the one whose value differs in the last ULP
  // between the server's engine and the browser's.
  const rotation = quantize(angleFor(value, override))

  const [px, py] = pivot ?? [0, 0]
  const [nx, ny] = nudge ?? [0, 0]

  const root = {
    "data-mp": "hand",
    fill,
    ...rest,
    // After the spread, not before: the type already refuses a caller's
    // `transform`, and this is the second lock, for the untyped spread that
    // gets past it. Everything else a caller passes still wins.
    transform: `translate(${fmt(frame.cx)} ${fmt(frame.cy)})`,
    children: (
      /* Stage 2, the only animated node. CSS rather than the SVG `transform`
         attribute, because that is what the fixture verified across Chrome,
         Safari and Firefox and what a compositor can promote. `transform-box`
         and `transform-origin` are written out: their defaults differ between
         SVG and HTML and changed between Transforms Level 1 and 2, and
         `fill-box` would pivot each hand around its own bounding box, so a
         hand with a tail would not stay collinear with one without. */
      <g style={{ rotate: `${rotation}deg`, transformBox: "view-box", transformOrigin: "0 0" }}>
        {/* Stage 3, static: the artwork's own space. Read right to left —
            the pivot is subtracted in the units the artwork was drawn in,
            the result is scaled into dial units, and the optical nudge lands
            last, in dial units. All three are always written, so the DOM
            shape a consumer styles never changes with the props. */}
        <g
          transform={`translate(${fmt(nx)} ${fmt(ny)}) scale(${fmt(scale)}) translate(${fmt(-px)} ${fmt(-py)})`}
        >
          {children ?? <path d={handPath(length, tail, width)} />}
        </g>
      </g>
    ),
  } satisfies SVGProps<SVGGElement> & { "data-mp": "hand"; children: ReactNode }

  return render ? render(root) : <g {...root} />
}
