"use client"

/**
 * Numerals: the numbers on a dial, placed geometrically.
 * May import: clearance, errors, frame, geometry, tick-scale, ticks. Must not import: time/.
 *
 * A different renderer over the same pipeline as `<Ticks>` — population,
 * `skip`, tiers and function props are the same code, not a re-implementation.
 * What is new here is the anchoring: either the glyph box centre is placed
 * outright (`r` | `inset`), or `clearanceRadius` places each label so its
 * optical ink clears the tick track by exactly the requested distance,
 * whatever the label's width or angle.
 */
import { Fragment, type ReactElement, type ReactNode, type SVGProps } from "react"
import { failSoft } from "../core/errors"
import {
  type Degrees,
  type DialUnits,
  type DomainValue,
  fmt,
  type Point,
  polar,
  quantize,
} from "../core/geometry"
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
} from "../core/tick-scale"
import { clearanceRadius, estimateInk, type Ink, type TickFace } from "./clearance"
import { useFrame } from "./frame"
import { type Align, type Orient, orientationOf } from "./ticks"

/**
 * A numeral's resolved geometry and props, as handed to `renderItem`. Extends
 * `TickContext<T>`, so `item` is here too: the authored item as a unit, typed
 * by the population that produced it.
 */
export type NumeralGeometry<T = TickItem> = TickContext<T> & {
  /** The glyph box centre, in dial units — where the text is anchored. */
  point: Point
  /** The inward unit normal of the outline where the numeral's ray lands. */
  normal: Point
  /**
   * The numeral's local rotation in degrees, honouring `orient` — the same
   * rotation the built-in `<text>` is drawn with. `renderItem` replaces that
   * text, so it must also receive its rotation, typically as
   * `transform={\`rotate(${rotation} ${point.x} ${point.y})\`}`.
   */
  rotation: Degrees
  /** The text as drawn: `format` applied, or `String(value)` without it. */
  label: string
  /**
   * The per-mark visual props, resolved: tier and top-level fill-ins applied,
   * function forms evaluated. Distinct from `item`, which stays as authored.
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

/**
 * Where the numerals sit, as an XOR union: place the glyph box centre outright
 * (`r` | `inset`, with `align` shifting the optical box off the anchor), or
 * hand the radius to the clearance solver (`track` + `clearance`). The solver
 * owns the radius in solved mode, which is why `align` — a deliberate shift of
 * the box off its anchor — has no meaning there and is refused at the type.
 */
type Anchor<T> =
  | {
      /** Anchor distance inward from the outline, in dial units. @default 0 */
      inset?: TickProp<DialUnits, T>
      /** Which part of the optical box sits on the anchor, radially. @default "center" */
      align?: Align
      r?: never
      track?: never
      clearance?: never
    }
  | {
      /** Anchor radius from the centre, ignoring the outline, in dial units. */
      r: TickProp<DialUnits, T>
      /** Which part of the optical box sits on the anchor, radially. @default "center" */
      align?: Align
      inset?: never
      track?: never
      clearance?: never
    }
  | {
      /**
       * The tick track being cleared: `r` is the frame radius of its
       * numeral-facing inner ends, `width` the tangential width of the ticks
       * the labels sit against — the same two words `<Ticks>` uses for the
       * same quantities. Giving this hands each label's radius to the
       * clearance solver.
       */
      track: TickFace
      /**
       * The shortest ink-to-tick distance every label holds, in dial units —
       * the argument `clearanceRadius` solves for. Wide labels at diagonal
       * angles land on different radii than narrow ones precisely so this gap
       * reads equal everywhere.
       */
      clearance: DialUnits
      align?: never
      r?: never
      inset?: never
    }

/**
 * Everything but the population, parameterized by the item type `T` its marks
 * carry — which is what `skip`, `format`, the function-valued props, and
 * `renderItem` all see as `ctx.item`.
 *
 * The per-mark props are omitted from the `SVGProps` base: React declares
 * `fontSize`, `format`, `offset`, `r` and `fill` as SVG attributes, and
 * intersecting those with the richer forms would silently widen or strip them.
 */
type CommonProps<T> = Omit<
  SVGProps<SVGGElement>,
  "children" | "fill" | "fontSize" | "format" | "offset" | "orient" | "r"
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
    /**
     * How numerals rotate — the shared enum, same rule as `<Ticks>`. Defaults
     * to `upright`, the convention for applied numerals: a gauge's numbers
     * read the way they were drawn, wherever they sit. @default "upright"
     */
    orient?: Orient
    /**
     * Type size in dial units, matching the `<text>` attribute it renders as.
     * First-class rather than a style because the ink estimate reads it: the
     * solver cannot hold a clearance against ink it cannot size. @default 12
     */
    fontSize?: DialUnits
    /**
     * Turn a mark into its label. Without it the label is `String(value)` —
     * never falsified: a mark's text comes from its value or from the authored
     * item, both of which this receives. A function, so it forces
     * `"use client"` at the call site.
     */
    format?: (ctx: TickContext<T>) => string
    /** Scalar shift along the mark's own side axis, in dial units — as on `<Ticks>`. @default 0 */
    offset?: TickProp<DialUnits, T>
    /**
     * 2D shift in the numeral's own space, applied after the rotation — the
     * optical correction for when a face is set and one label reads a hair
     * off. On upright numerals it is plain `[right, down]`. @default [0, 0]
     */
    nudge?: [DialUnits, DialUnits]
    /** Paint. @default "currentColor" */
    fill?: TickProp<string, T>
    /**
     * Opt into one node per mark. A function, so it forces `"use client"` at
     * the call site — the same boundary rule as a factory-built `Outline`.
     */
    renderItem?: (mark: NumeralGeometry<T>) => ReactNode
  }

/**
 * Props for {@link Numerals}: a population (`count` | `ticks` | `tiers`), an
 * anchor (`inset` | `r` | solved `track` + `clearance`), per-mark text and
 * paint, and any SVG prop.
 *
 * Generic over the authored item type exactly as {@link TicksProps} is: a
 * `ticks` array's element type rides through to `format`, `skip` and
 * `renderItem` as `ctx.item`, still typed.
 */
export type NumeralsProps<T extends TickItem = TickItem, S extends TierSpec = TierSpec> =
  | (CountPopulation & CommonProps<Pick<TickItem, "value">>)
  | (TicksPopulation<T> & CommonProps<T>)
  | (TiersPopulation<S> & CommonProps<TierItemOf<S>>)

/**
 * Narrow the component's props down to just what the scale pipeline may see —
 * the same guard `<Ticks>` applies, for the same reason: `resolveTicks`
 * evaluates function-valued props per mark, and it must never be handed a
 * whole React props object. `track` and `clearance` stay out too: they are the
 * solver's, not the pipeline's.
 */
function scaleInputOf(props: NumeralsProps): ResolveInput {
  const input: ResolveInput = {}
  if (props.from !== undefined) input.from = props.from
  if (props.to !== undefined) input.to = props.to
  if (props.skip !== undefined) input.skip = props.skip
  if (props.count !== undefined) input.count = props.count
  if (props.ticks !== undefined) input.ticks = props.ticks
  if (props.tiers !== undefined) input.tiers = props.tiers
  if (props.inset !== undefined) input.inset = props.inset
  if (props.r !== undefined) input.r = props.r
  if (props.offset !== undefined) input.offset = props.offset
  if (props.fill !== undefined) input.fill = props.fill
  return input
}

/**
 * How far `align` shifts the box centre along the outward ray — negative is
 * inward. "Inside" puts the box's outermost ink on the anchor, which is
 * exactly the solver's rail case with zero clearance: against a rail at
 * radius 0, `clearanceRadius` returns minus the optical box's reach along the
 * ray, corner recessions included. "Outside" is the same reach measured down
 * the mirrored ray. Reused rather than re-derived, so `align` and the solved
 * mode can never disagree about where a label's ink ends.
 */
function alignShift(align: Align, ink: Ink, angle: Degrees, rotation: Degrees): DialUnits {
  if (align === "center") return 0
  const rail: TickFace = { r: 0, width: Number.POSITIVE_INFINITY }
  if (align === "inside") return clearanceRadius({ ink, angle, rotation, tick: rail, clearance: 0 })
  return -clearanceRadius({ ink, angle: angle + 180, rotation, tick: rail, clearance: 0 })
}

/**
 * The numbers on a dial: one `<text>` per mark, anchored `middle`/`central`
 * and positioned geometrically — never by baseline keywords, which cannot
 * express radial alignment off the vertical axis.
 *
 * Anchoring is either explicit (`r` | `inset` place the glyph box centre) or
 * solved (`track` + `clearance` hold every label's shortest ink-to-tick
 * distance equal, the invariant the eye actually reads). Generic over the
 * authored item type exactly as `<Ticks>` is: a literal `ticks` array keeps
 * its shape, so `format` and `renderItem` see `item` with the fields the
 * array was written with, still typed.
 */
export function Numerals(
  props: CountPopulation & CommonProps<Pick<TickItem, "value">>,
): ReactElement
export function Numerals<const T extends TickItem>(
  props: TicksPopulation<T> & CommonProps<T>,
): ReactElement
export function Numerals<const S extends TierSpec>(
  props: TiersPopulation<S> & CommonProps<TierItemOf<S>>,
): ReactElement
export function Numerals(props: NumeralsProps): ReactElement {
  const {
    align = "center",
    orient = "upright",
    fontSize = 12,
    format,
    nudge,
    renderItem,
    track,
    clearance,
    count: _count,
    ticks: _ticks,
    tiers: _tiers,
    from: _from,
    to: _to,
    skip: _skip,
    offset: _offset,
    inset: _inset,
    r: _r,
    fill: _fill,
    ...svgProps
  } = props

  const anchors = (["r", "inset", "track"] as const).filter((k) => props[k] !== undefined)
  if (anchors.length > 1) {
    // `track` survives over `r` over `inset`, per the precedence documented
    // on `bothAnchorsMessage` — and the anchor branch below already prefers
    // them in that order, so degrading is just proceeding, out loud.
    failSoft(
      "mainplate: <Numerals> takes only one of `r`, `inset`, or `track` — received " +
        `${anchors.map((k) => `\`${k}\``).join(" and ")}. \`r\` is frame-anchored ` +
        "and `inset` outline-anchored, both placing the glyph box centre outright; `track` hands " +
        "the radius to the clearance solver instead, so combining it with either would give one " +
        "label two positions.",
      `Using \`${track !== undefined ? "track" : "r"}\`.`,
    )
  }
  if (clearance !== undefined && track === undefined) {
    // `clearance` is only ever read inside the solved branch, so the
    // production fallback is simply the anchor the caller did give.
    failSoft(
      `mainplate: <Numerals> \`clearance\` (${clearance}) is the ink-to-tick distance the ` +
        "solver holds against `track`; without a track there is nothing to clear. Pass " +
        "`track`, or anchor with `r` or `inset` and drop `clearance`.",
      "Ignoring `clearance`.",
    )
  }

  const { frame, angleFor } = useFrame()
  const { outline } = frame
  const [nx, ny] = nudge ?? [0, 0]

  const resolved: (ResolvedTick & ResolvedProps)[] = resolveTicks(scaleInputOf(props), frame)
  const marks: NumeralGeometry[] = resolved.map((tick) => {
    const angle = tick.at ?? angleFor(tick.value)
    const inset = tick.inset ?? 0
    const normal = outline.normalAt(angle, inset)
    const rotation = orientationOf(orient, angle, normal)
    const ctx: TickContext = {
      item: tick.item,
      value: tick.value,
      t: tick.t,
      index: tick.index,
      tier: tick.tier,
      angle,
    }
    const label = format ? format(ctx) : String(tick.value)
    const ink = estimateInk(label, fontSize)

    // The anchor. Solved mode owns the radius — the solver's assumption is a
    // label inward of its tick along the ray, so the centre is frame-radial by
    // construction; per-item `r` it never reads, and per-item `inset` reaches
    // only the `orient="edge"` normal above, never the radius.
    let centre: Point
    if (track !== undefined) {
      const r = clearanceRadius({ ink, angle, rotation, tick: track, clearance: clearance ?? 0 })
      centre = polar(angle, r)
    } else {
      centre = tick.r !== undefined ? polar(angle, tick.r) : outline.pointAt(angle, inset)
      const shift = alignShift(align, ink, angle, rotation)
      if (shift !== 0) {
        const out = polar(angle, shift)
        centre = { x: centre.x + out.x, y: centre.y + out.y }
      }
    }

    // `offset` rides the mark's side axis, as on <Ticks>; `nudge` is the same
    // 2D local-space shift every primitive means by the word, applied after
    // the rotation. Side is also local-x, so the two share an axis on purpose.
    const side = polar(rotation + 90, 1)
    const down = polar(rotation + 180, 1)
    const along = (tick.offset ?? 0) + nx
    const x = centre.x + side.x * along + down.x * ny
    const y = centre.y + side.y * along + down.y * ny

    // Quantized on the way out, not just when fmt'd into attributes: these
    // numbers reach consumer JSX, and the solver's bisection output differs
    // in the last ULP between engines — a guaranteed hydration mismatch.
    return {
      item: tick.item,
      value: tick.value,
      t: tick.t,
      index: tick.index,
      tier: tick.tier,
      angle,
      point: { x: quantize(x), y: quantize(y) },
      normal: { x: quantize(normal.x), y: quantize(normal.y) },
      rotation: quantize(rotation),
      label,
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

  if (renderItem) {
    return (
      // `data-mp` after the spread, on both branches: the data-* exemption
      // lets a spread smuggle it past the type, so the second lock keeps the
      // one attribute the library guarantees — still a compile-time static.
      <g {...svgProps} data-mp="numerals">
        {marks.map((mark) => (
          // Not `value`: `at` exists so two marks can share a value at
          // different positions. Not bare `index`: it repeats across tiers.
          // The tier-index pair is unique per mark by construction.
          <Fragment key={`${mark.tier}-${mark.index}`}>{renderItem(mark)}</Fragment>
        ))}
      </g>
    )
  }

  return (
    <g {...svgProps} data-mp="numerals">
      {marks.map((mark) => (
        <text
          key={`${mark.tier}-${mark.index}`}
          x={mark.point.x}
          y={mark.point.y}
          fontSize={fontSize}
          fill={mark.props.fill ?? "currentColor"}
          textAnchor="middle"
          dominantBaseline="central"
          {...(mark.rotation !== 0 && {
            transform: `rotate(${fmt(mark.rotation)} ${fmt(mark.point.x)} ${fmt(mark.point.y)})`,
          })}
        >
          {mark.label}
        </text>
      ))}
    </g>
  )
}
