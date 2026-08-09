"use client"

/**
 * `<Hand>`: the moving pointer.
 * May import: frame, geometry, source. Must not import: time/.
 *
 * Two forms behind one prop. A number is the controlled form — a pure function
 * of props. A `Source` is the live form: the hand subscribes and writes
 * `style.rotate` through a ref, so a watch face updating eleven times a second
 * costs zero React renders. Rotation is the only thing this library animates
 * and the single largest correctness risk, so the transform is the
 * browser-verified §2.9 recipe and nothing else: three nested groups, only the
 * middle one turning, `transform-box` and `transform-origin` written out
 * rather than inherited from a default that differs between SVG and HTML. See
 * `fixtures/transform.html`.
 */
import { type ReactNode, type SVGProps, useEffect, useRef } from "react"
import { type ScaleOverride, useFrame } from "./frame"
import { type Degrees, type DialUnits, type DomainValue, fmt, quantize } from "./geometry"
import { isSource, type Source } from "./source"

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
  /**
   * Where the hand points: a domain value, or a `Source` of one.
   *
   * A number is the controlled form, a pure function of props. A `Source` is
   * the live form — the hand subscribes and writes `style.rotate` through a
   * ref, so the value can change every frame without React rendering anything.
   * Switch between the two freely; the subscription follows.
   */
  value: DomainValue | Source<number>
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
   * face — and never writes back to it. §8.10 precedence: this beats
   * `source.domain`, which beats the frame.
   * @default the source's `domain.min` if it declares one, else the frame's `min`
   */
  min?: DomainValue
  /**
   * Upper bound of the domain this hand reads.
   * @default the source's `domain.max` if it declares one, else the frame's `max`
   */
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
 * Assemble the scale this hand reads from its resolved bounds. Built key by
 * key rather than spread wholesale: `{ ...frame, max: undefined }` would
 * overwrite the frame's `max` with `undefined` and take the mapping to NaN,
 * which makes a hand vanish with nothing in the console. Shared by the render
 * path and the ref path, so the two cannot disagree about what a hand reads.
 */
function buildOverride(
  min: DomainValue | undefined,
  max: DomainValue | undefined,
  startAngle: Degrees | undefined,
  sweepAngle: Degrees | undefined,
): ScaleOverride {
  const override: ScaleOverride = {}
  if (min !== undefined) override.min = min
  if (max !== undefined) override.max = max
  if (startAngle !== undefined) override.startAngle = startAngle
  if (sweepAngle !== undefined) override.sweepAngle = sweepAngle
  return override
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
  const rotationRef = useRef<SVGGElement | null>(null)

  // The runtime discriminator for the union. `isSource` can only witness
  // `Source<unknown>`; the prop's type says the only source form here is
  // `Source<number>`, so the assertion restates what the union declares.
  let source: Source<number> | null = null
  let current: DomainValue
  if (isSource(value)) {
    source = value as Source<number>
    current = source.get()
  } else {
    current = value
  }

  // §8.10 precedence: an explicit prop beats `source.domain`, which beats the
  // frame. Only `min`/`max` exist on a domain; the angles stay prop-or-frame.
  const domain = source === null ? undefined : source.domain
  const resolvedMin = min !== undefined ? min : domain?.min
  const resolvedMax = max !== undefined ? max : domain?.max

  // Quantised because this string is a hydration boundary: the one node the
  // library animates is also the one whose value differs in the last ULP
  // between the server's engine and the browser's. With a source, this render
  // path still writes the current value, so the server's HTML carries the same
  // rotation the client hydrates and the effect below then keeps live.
  const rotation = quantize(
    angleFor(current, buildOverride(resolvedMin, resolvedMax, startAngle, sweepAngle)),
  )

  // Detached from the source object so the effect's dependencies are the
  // methods themselves: `createSource` returns closures with stable identity,
  // so re-renders re-run nothing, while swapping the source — or swapping to a
  // plain number, which makes both null — tears down and resubscribes. A
  // wrapper closure here would have a fresh identity per render and silently
  // churn the subscription eleven times a second.
  const subscribe = source === null ? null : source.subscribe
  const get = source === null ? null : source.get

  useEffect(() => {
    if (subscribe === null || get === null) return
    const write = () => {
      // Null while unmounting: the teardown runs first in practice, but a
      // notification arriving mid-teardown must not touch a detached node.
      const node = rotationRef.current
      if (node === null) return
      // Quantised here too — this write bypasses React entirely, so the render
      // path's quantisation does not cover it.
      const deg = quantize(
        angleFor(get(), buildOverride(resolvedMin, resolvedMax, startAngle, sweepAngle)),
      )
      node.style.rotate = `${deg}deg`
    }
    // Written once on subscription, not only on change: a value that moved
    // between this render and this effect would otherwise never be drawn.
    write()
    return subscribe(write)
  }, [subscribe, get, angleFor, resolvedMin, resolvedMax, startAngle, sweepAngle])

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
      <g
        ref={rotationRef}
        style={{ rotate: `${rotation}deg`, transformBox: "view-box", transformOrigin: "0 0" }}
      >
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
