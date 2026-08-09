"use client"

/**
 * Tick marks: repeated marks distributed over the frame.
 * May import: errors, geometry, frame, tick-scale, outline. Must not import: time/.
 *
 * Marks are filled shapes, not stroked lines. A single <path> carries exactly
 * one stroke-width, so a per-mark `width` could never merge if these were
 * strokes — and merging is the whole performance story for statics.
 */
import { Fragment, type ReactElement, type ReactNode, type SVGProps } from "react"
import { bothAnchorsMessage, failSoft } from "./errors"
import { useFrame } from "./frame"
import {
  type Degrees,
  type DialUnits,
  type DomainValue,
  fmt,
  normalizeAngle,
  type Point,
  polar,
  quantize,
} from "./geometry"
import {
  type ResolvedProps,
  type ResolvedTick,
  type ResolveInput,
  resolveTicks,
  type Skip,
  type TickContext,
  type TickItem,
  type TickProp,
  type TierItemOf,
  type TierSpec,
} from "./tick-scale"

/** Which part of the mark sits on the anchor, along the mark's own up-axis. */
export type Align = "inside" | "center" | "outside"

/**
 * How marks are distributed over the outline. Position only — orientation is
 * `orient`, and the two stay independent axes.
 *
 * - `radial` (default): cast a ray from the centre at each value's angle and
 *   intersect the outline. Angular correspondence with the hands is preserved
 *   — the mark for 15 of 60 is exactly where a hand pointing at 15 crosses
 *   the edge — at the price of perimeter spacing that is uneven on a
 *   non-circle, by design. Correct for anything a hand indicates.
 * - `perimeter`: divide the outline evenly by arc length, the way a real
 *   Tank's chemin de fer divides its minutes. Spacing is uniform everywhere,
 *   corners included; in exchange a hand no longer points exactly at the
 *   in-between marks — the famous rectangular-watch trait. On an
 *   axis-symmetric outline the cardinal marks still land exactly on their
 *   angles, so 12, 3, 6 and 9 keep their hands honest.
 *
 * On a circle the two are the same mapping. `r`-anchored marks sit on a
 * circle of the frame's, so `placement` has nothing to change there either.
 */
export type Placement = "radial" | "perimeter"

/**
 * How a mark rotates. Position comes from the frame; orientation is its own
 * axis. Every value below describes where the mark's *up-axis* points — the
 * direction `length` runs, which for asymmetric `renderItem` artwork is the
 * difference between right way up and upside down.
 *
 * - `radial` (default): up points **outward**, directly away from the centre,
 *   along the ray through the mark. At 12 o'clock that is screen-up.
 * - `tangential`: up points along the direction of travel, a quarter turn
 *   clockwise from `radial`. At 12 o'clock that is screen-right.
 * - `edge`: up points outward along the outline's **outward normal**, so the
 *   mark stands perpendicular to the edge it sits on.
 * - `upright`: up is always screen-up. Every mark stays parallel, unrotated,
 *   whatever its position — the convention for applied numerals.
 *
 * `edge` and `radial` coincide on a circle, where the outward normal at an
 * angle *is* the ray through it. They diverge on a rectangle: along a flat,
 * `radial` fans out with the ray while `edge` stays square to the side. That
 * divergence is the reason this library separates the two.
 */
export type Orient = "radial" | "tangential" | "edge" | "upright"

/**
 * A mark's resolved geometry and props, as handed to `renderItem` and
 * `useTicks`. Extends `TickContext<T>`, so `item` is here too: the authored
 * item as a unit, typed by the population that produced it.
 */
export type MarkGeometry<T = TickItem> = TickContext<T> & {
  /** Where the mark sits, in dial units. */
  point: Point
  /** The inward unit normal of the outline where the mark stands. */
  normal: Point
  /**
   * The mark's local rotation in degrees, honouring `orient` — the same
   * rotation the built-in quad is drawn with. Without it `orient` would be a
   * silent no-op for custom artwork: `renderItem` replaces the quad, so it
   * must also receive the quad's rotation, typically as
   * `transform={\`rotate(${rotation} ${point.x} ${point.y})\`}`.
   */
  rotation: Degrees
  /**
   * The six per-mark visual props, resolved: tier and top-level fill-ins
   * applied, function forms evaluated. Distinct from `item`, which stays as
   * authored.
   */
  props: ResolvedProps
}

type CountPopulation = { count: number; ticks?: never; tiers?: never }
type TicksPopulation<T extends TickItem> = { ticks: readonly T[]; count?: never; tiers?: never }
type TiersPopulation<S extends TierSpec> = {
  tiers: readonly (S & { skip?: Skip<TierItemOf<S>> })[]
  count?: never
  ticks?: never
}

type Anchor<T> =
  | {
      /** Anchor distance inward from the outline, in dial units. @default 0 */
      inset?: TickProp<DialUnits, T>
      r?: never
    }
  | {
      /** Anchor radius from the centre, ignoring the outline, in dial units. */
      r: TickProp<DialUnits, T>
      inset?: never
    }

/**
 * Everything but the population, parameterized by the item type `T` its marks
 * carry — which is what `skip`, the function-valued props, and `renderItem`
 * all see as `ctx.item`.
 *
 * The per-mark props are omitted from the `SVGProps` base: React declares
 * `width`, `offset`, `r` and `fill` as SVG attributes, and intersecting those
 * with `TickProp` would silently strip the function-valued forms.
 */
type CommonProps<T> = Omit<
  SVGProps<SVGGElement>,
  "children" | "fill" | "offset" | "orient" | "r" | "width"
> &
  Anchor<T> & {
    from?: DomainValue
    to?: DomainValue
    /**
     * Omit marks: domain values (matched within epsilon), or a predicate.
     * The array form serializes across the RSC boundary; the predicate form
     * is a function and forces `"use client"` at the call site.
     */
    skip?: Skip<T>
    /** Which part of the mark sits on the anchor. @default "center" */
    align?: Align
    /** How marks are distributed: by ray, or evenly by arc length. @default "radial" */
    placement?: Placement
    /** @default "radial" */
    orient?: Orient
    /** Radial extent, in dial units. @default 6 */
    length?: TickProp<DialUnits, T>
    /** Tangential extent, in dial units. @default 1 */
    width?: TickProp<DialUnits, T>
    /** Scalar tangential shift, in dial units. @default 0 */
    offset?: TickProp<DialUnits, T>
    /** Paint. Marks sharing a fill merge into one path. @default "currentColor" */
    fill?: TickProp<string, T>
    /**
     * Opt into one node per mark. A function, so it forces `"use client"` at
     * the call site — the same boundary rule as a factory-built `Outline`.
     */
    renderItem?: (mark: MarkGeometry<T>) => ReactNode
  }

/**
 * Props for {@link Ticks}: a population (`count` | `ticks` | `tiers`), an
 * anchor (`inset` | `r`), per-mark geometry and paint, and any SVG prop.
 *
 * Generic over the authored item type, which is what each population's marks
 * carry as `item`: a `ticks` array's element type `T`, a tier's own props
 * plus the stepped `value` under `tiers`, and just `{ value }` under `count`.
 *
 * Any function-valued prop — a `skip` predicate, a function `length` or
 * `fill`, `renderItem` — forces the call site behind `"use client"`, exactly
 * like a factory-built `Outline`: functions cannot cross the RSC boundary,
 * and React's serialization error never names mainplate. The plain forms —
 * numbers, strings, arrays — all serialize, so a server page keeps them.
 */
export type TicksProps<T extends TickItem = TickItem, S extends TierSpec = TierSpec> =
  | (CountPopulation & CommonProps<Pick<TickItem, "value">>)
  | (TicksPopulation<T> & CommonProps<T>)
  | (TiersPopulation<S> & CommonProps<TierItemOf<S>>)

/**
 * Narrow the component's props down to just what the scale pipeline may see.
 *
 * This matters: `resolveTicks` evaluates function-valued props per mark, and
 * while its allowlist already refuses to call `renderItem` or `onClick`,
 * handing it a whole React props object would still fold every DOM prop onto
 * every mark. The pipeline gets scale input, nothing else.
 */
function scaleInputOf(props: TicksProps): ResolveInput {
  const input: ResolveInput = {}
  if (props.from !== undefined) input.from = props.from
  if (props.to !== undefined) input.to = props.to
  if (props.skip !== undefined) input.skip = props.skip
  if (props.count !== undefined) input.count = props.count
  if (props.ticks !== undefined) input.ticks = props.ticks
  if (props.tiers !== undefined) input.tiers = props.tiers
  if (props.inset !== undefined) input.inset = props.inset
  if (props.r !== undefined) input.r = props.r
  if (props.length !== undefined) input.length = props.length
  if (props.width !== undefined) input.width = props.width
  if (props.offset !== undefined) input.offset = props.offset
  if (props.fill !== undefined) input.fill = props.fill
  return input
}

/**
 * Headless access to the same geometry `<Ticks>` renders.
 *
 * Generic the same way {@link TicksProps} is: the marks' `item` is the
 * authored item, typed by the population — the array element under `ticks`,
 * the tier's own props plus `value` under `tiers`, `{ value }` under `count`.
 * The `const` type parameter keeps an inline literal array's shape.
 */
export function useTicks(
  props: CountPopulation & CommonProps<Pick<TickItem, "value">>,
): MarkGeometry<Pick<TickItem, "value">>[]
export function useTicks<const T extends TickItem>(
  props: TicksPopulation<T> & CommonProps<T>,
): MarkGeometry<T>[]
export function useTicks<const S extends TierSpec>(
  props: TiersPopulation<S> & CommonProps<TierItemOf<S>>,
): MarkGeometry<TierItemOf<S>>[]
export function useTicks(props: TicksProps): MarkGeometry[]
export function useTicks(props: TicksProps): MarkGeometry[] {
  const { frame, angleFor } = useFrame()
  const { outline } = frame
  const orient = props.orient ?? "radial"
  const placement = props.placement ?? "radial"

  const resolved: (ResolvedTick & ResolvedProps)[] = resolveTicks(scaleInputOf(props), frame)
  return resolved.map((tick) => {
    const angle = tick.at ?? angleFor(tick.value)
    const anchorRadius = tick.r
    const inset = tick.inset ?? 0

    // `angle` stays the value's angle whatever the placement — it is the
    // mark's provenance, and skip predicates and function props key off it.
    // What perimeter placement changes is where that angle *lands*: the same
    // fraction of the turn becomes the same fraction of the distance around
    // the outline. The mark then stands somewhere off its ray, so its normal
    // and orientation are asked at the position, not at the value's angle.
    let point: Point
    let orientedAt: Degrees = angle
    if (anchorRadius !== undefined) {
      point = polar(angle, anchorRadius)
    } else if (placement === "perimeter") {
      point = outline.pointAtLength((normalizeAngle(angle) / 360) * outline.length(inset), inset)
      orientedAt = (Math.atan2(point.x, -point.y) * 180) / Math.PI
    } else {
      point = outline.pointAt(angle, inset)
    }
    const normal = outline.normalAt(orientedAt, inset)

    // Quantized on the way out, not just when fmt'd into path data: these
    // numbers reach consumer JSX, and raw trig output differs between the
    // server's engine and the browser's — a guaranteed hydration mismatch.
    return {
      item: tick.item,
      value: tick.value,
      t: tick.t,
      index: tick.index,
      tier: tick.tier,
      angle,
      point: { x: quantize(point.x), y: quantize(point.y) },
      normal: { x: quantize(normal.x), y: quantize(normal.y) },
      rotation: quantize(orientationOf(orient, orientedAt, normal)),
      props: {
        length: tick.length,
        width: tick.width,
        offset: tick.offset,
        inset: tick.inset,
        r: tick.r,
        fill: tick.fill,
      },
    }
  })
}

/**
 * Rotation of a mark's local frame, in degrees, per the shared orient enum.
 *
 * Exported so a consumer positioning marks by hand — `useFrame` plus their own
 * anchor math — can orient them by the same rule the built-ins use, instead of
 * re-deriving the atan2 dance from the docs.
 */
export function orientationOf(orient: Orient, angle: Degrees, normal: Point): Degrees {
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
): string {
  // Local axes. `up` runs outward along the mark — at rotation 0 that is
  // screen-up, matching the artwork convention. `side` is tangential, a
  // quarter turn clockwise. The rotation itself lives on the mark, so the
  // built-in quad and a `renderItem` mark turn by the same number.
  const up = polar(mark.rotation, 1)
  const side = polar(mark.rotation + 90, 1)

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
 *
 * Generic over the authored item type: a literal `ticks` array keeps its
 * shape (a `const` type parameter), so `renderItem` sees `mark.item` with the
 * fields the array was written with, still typed. Under `tiers` the item is
 * the tier's own props plus the stepped `value`; under `count` it is just
 * `{ value }`, because nothing more was authored.
 */
export function Ticks(props: CountPopulation & CommonProps<Pick<TickItem, "value">>): ReactElement
export function Ticks<const T extends TickItem>(
  props: TicksPopulation<T> & CommonProps<T>,
): ReactElement
export function Ticks<const S extends TierSpec>(
  props: TiersPopulation<S> & CommonProps<TierItemOf<S>>,
): ReactElement
export function Ticks(props: TicksProps): ReactElement {
  const {
    align = "center",
    orient: _orient,
    placement: _placement,
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

  if (_r !== undefined && _inset !== undefined) {
    // `r` survives, per the precedence documented on `bothAnchorsMessage` —
    // and `useTicks` already prefers an `r` anchor when both fields are
    // present, so degrading is just proceeding, out loud.
    failSoft(bothAnchorsMessage("<Ticks>", _r, _inset), "Ignoring `inset`.")
  }

  const marks = useTicks(props)

  if (renderItem) {
    return (
      // `data-mp` after the spread, on both branches: the data-* exemption
      // lets a spread smuggle it past the type, so the second lock keeps the
      // one attribute the library guarantees — still a compile-time static.
      <g {...svgProps} data-mp="ticks">
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
  // cannot. That split is the whole cost model — a face pays one node per
  // distinct fill, not one per mark, so sixty ticks in one colour cost one
  // <path> and the same sixty in three colours cost three.
  const groups = new Map<string, string[]>()
  for (const mark of marks) {
    const fill = mark.props.fill ?? "currentColor"
    const d = markPath(
      mark,
      mark.props.length ?? 6,
      mark.props.width ?? 1,
      mark.props.offset ?? 0,
      align,
    )
    const bucket = groups.get(fill)
    if (bucket) bucket.push(d)
    else groups.set(fill, [d])
  }

  return (
    <g {...svgProps} data-mp="ticks">
      {[...groups].map(([fill, ds]) => (
        <path key={fill} d={ds.join(" ")} fill={fill} />
      ))}
    </g>
  )
}
