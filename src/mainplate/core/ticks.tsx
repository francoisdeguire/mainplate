"use client"

/**
 * Tick marks: repeated marks distributed over the frame.
 * May import: geometry, frame, tick-scale, outline. Must not import: time/.
 *
 * Marks are filled shapes, not stroked lines. A single <path> carries exactly
 * one stroke-width, so a per-mark `width` could never merge if these were
 * strokes — and merging is the whole performance story for statics.
 */
import { Fragment, type ReactNode, type SVGProps } from "react"
import { useFrame } from "./frame"
import { type Degrees, type DialUnits, type DomainValue, fmt, type Point, polar } from "./geometry"
import {
  type ResolveInput,
  resolveTicks,
  type Skip,
  type TickContext,
  type TickItem,
  type TickProp,
  type TierSpec,
} from "./tick-scale"

/** Which part of the mark sits on the anchor, along the mark's own up-axis. */
export type Align = "inside" | "center" | "outside"

/**
 * How a mark rotates. Position comes from the frame; orientation is its own
 * axis. `radial` points the up-axis at the centre, `tangential` is a quarter
 * turn from that, `edge` is perpendicular to the outline edge — identical to
 * `radial` on a circle, visibly different on a rect — and `upright` keeps
 * every mark parallel.
 */
export type Orient = "radial" | "tangential" | "edge" | "upright"

/** A mark's resolved geometry and props, as handed to `renderItem` and `useTicks`. */
export type MarkGeometry = TickContext & {
  /** Where the mark sits, in dial units. */
  point: Point
  /** The inward unit normal of the outline at this angle. */
  normal: Point
  /** Resolved per-mark visual props, after tier and function resolution. */
  props: Record<string, unknown>
}

type Population =
  | { count: number; ticks?: never; tiers?: never }
  | { ticks: readonly TickItem[]; count?: never; tiers?: never }
  | { tiers: readonly (TierSpec & { skip?: Skip })[]; count?: never; ticks?: never }

type Anchor = { inset?: TickProp<DialUnits>; r?: never } | { r: TickProp<DialUnits>; inset?: never }

/**
 * Props for {@link Ticks}: a population (`count` | `ticks` | `tiers`), an
 * anchor (`inset` | `r`), per-mark geometry and paint, and any SVG prop.
 *
 * The per-mark props are omitted from the `SVGProps` base: React declares
 * `width`, `offset`, `r` and `fill` as SVG attributes, and intersecting those
 * with `TickProp` would silently strip the function-valued forms.
 */
export type TicksProps = Population &
  Anchor &
  Omit<SVGProps<SVGGElement>, "children" | "fill" | "offset" | "orient" | "r" | "width"> & {
    from?: DomainValue
    to?: DomainValue
    skip?: Skip
    /** Which part of the mark sits on the anchor. @default "center" */
    align?: Align
    /** @default "radial" */
    orient?: Orient
    /** Radial extent, in dial units. @default 6 */
    length?: TickProp<DialUnits>
    /** Tangential extent, in dial units. @default 1 */
    width?: TickProp<DialUnits>
    /** Scalar tangential shift, in dial units. @default 0 */
    offset?: TickProp<DialUnits>
    /** Paint. Marks sharing a fill merge into one path. @default "currentColor" */
    fill?: TickProp<string>
    /** Opt into one node per mark. */
    renderItem?: (mark: MarkGeometry) => ReactNode
  }

/**
 * Narrow the component's props down to just what the scale pipeline may see.
 *
 * This matters: `resolveTicks` evaluates function-valued props per mark, and
 * while its allowlist already refuses to call `renderItem` or `onClick`,
 * handing it a whole React props object would still fold every DOM prop onto
 * every mark. The pipeline gets scale input, nothing else.
 */
function scaleInputOf(props: TicksProps): ResolveInput {
  const { count, ticks, tiers, from, to, skip, inset, r, length, width, offset, fill } = props
  const input: Record<string, unknown> = { from, to, skip }
  if (count !== undefined) input.count = count
  if (ticks !== undefined) input.ticks = ticks
  if (tiers !== undefined) input.tiers = tiers
  if (inset !== undefined) input.inset = inset
  if (r !== undefined) input.r = r
  if (length !== undefined) input.length = length
  if (width !== undefined) input.width = width
  if (offset !== undefined) input.offset = offset
  if (fill !== undefined) input.fill = fill
  return input as ResolveInput
}

/** Headless access to the same geometry `<Ticks>` renders. */
export function useTicks(props: TicksProps): MarkGeometry[] {
  const { frame, angleFor } = useFrame()
  const { outline } = frame

  return resolveTicks(scaleInputOf(props), frame).map((tick) => {
    const { value, t, index, tier, at, ...rest } = tick
    const angle = at ?? angleFor(value)
    const anchorRadius = rest.r as DialUnits | undefined
    const inset = (rest.inset as DialUnits | undefined) ?? 0

    return {
      value,
      t,
      index,
      tier,
      angle,
      point:
        anchorRadius === undefined ? outline.pointAt(angle, inset) : polar(angle, anchorRadius),
      normal: outline.normalAt(angle, inset),
      props: rest,
    }
  })
}

/** Rotation of a mark's local frame, in degrees, per the shared orient enum. */
function orientationOf(orient: Orient, angle: Degrees, normal: Point): Degrees {
  switch (orient) {
    case "upright":
      return 0
    case "tangential":
      return angle + 90
    case "edge":
      // The angle of the *outward* normal in the 0-is-up convention:
      // atan2 of the inward normal, flipped half a turn.
      return (Math.atan2(normal.x, -normal.y) * 180) / Math.PI + 180
    default:
      return angle
  }
}

/** One mark as a closed quad, emitted into a merged path. */
function markPath(
  mark: MarkGeometry,
  length: DialUnits,
  width: DialUnits,
  offset: DialUnits,
  align: Align,
  orient: Orient,
): string {
  const rotation = orientationOf(orient, mark.angle, mark.normal)
  // Local axes. `up` runs outward along the mark — at rotation 0 that is
  // screen-up, matching the artwork convention. `side` is tangential, a
  // quarter turn clockwise.
  const up = polar(rotation, 1)
  const side = polar(rotation + 90, 1)

  // `inside` puts the outer edge on the anchor, so the quad extends inward.
  const shift = align === "center" ? -length / 2 : align === "inside" ? -length : 0
  const hw = width / 2

  const corner = (along: number, across: number) => {
    const x = mark.point.x + up.x * along + side.x * (across + offset)
    const y = mark.point.y + up.y * along + side.y * (across + offset)
    return `${fmt(x)} ${fmt(y)}`
  }

  return [
    `M ${corner(shift, -hw)}`,
    `L ${corner(shift + length, -hw)}`,
    `L ${corner(shift + length, hw)}`,
    `L ${corner(shift, hw)}`,
    "Z",
  ].join(" ")
}

/**
 * Tick marks distributed over the frame, anchored on the outline (`inset`) or
 * a fixed radius (`r`), merged into as few `<path>` nodes as paint allows.
 */
export function Ticks(props: TicksProps) {
  const {
    align = "center",
    orient = "radial",
    renderItem,
    count: _count,
    ticks: _ticks,
    tiers: _tiers,
    from: _from,
    to: _to,
    skip: _skip,
    length: _length,
    width: _width,
    offset: _offset,
    inset: _inset,
    r: _r,
    fill: _fill,
    ...svgProps
  } = props

  if (props.r !== undefined && props.inset !== undefined) {
    throw new Error("<Ticks> takes only one of `r` or `inset`. See spec section 5.8.")
  }

  const marks = useTicks(props)

  if (renderItem) {
    return (
      <g data-mp="ticks" {...svgProps}>
        {marks.map((mark) => (
          // Not `value`: `at` exists so two marks can share a value at
          // different positions. Not bare `index`: it repeats across tiers.
          // The tier-index pair is unique per mark by construction.
          <Fragment key={`${mark.tier}-${mark.index}`}>{renderItem(mark)}</Fragment>
        ))}
      </g>
    )
  }

  // Group by paint: differing geometry merges into one path, differing paint
  // cannot. That split is the whole cost model in spec section 6.6.
  const groups = new Map<string, string[]>()
  for (const mark of marks) {
    const fill = (mark.props.fill as string | undefined) ?? "currentColor"
    const d = markPath(
      mark,
      (mark.props.length as DialUnits | undefined) ?? 6,
      (mark.props.width as DialUnits | undefined) ?? 1,
      (mark.props.offset as DialUnits | undefined) ?? 0,
      align,
      orient,
    )
    const bucket = groups.get(fill)
    if (bucket) bucket.push(d)
    else groups.set(fill, [d])
  }

  return (
    <g data-mp="ticks" {...svgProps}>
      {[...groups].map(([fill, ds]) => (
        <path key={fill} d={ds.join(" ")} fill={fill} />
      ))}
    </g>
  )
}
