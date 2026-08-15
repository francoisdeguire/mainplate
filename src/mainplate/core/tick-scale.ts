/**
 * The tick pipeline. Pure array transformation: zero imports beyond errors
 * and geometry, no React, no DOM.
 * May import: errors, geometry. Must not import: react, time/.
 */
import { failSoft } from "./errors"
import {
  type Degrees,
  type DialUnits,
  type DomainValue,
  epsilonFor,
  type Scale,
  valueToAngle,
} from "./geometry"

/**
 * The per-mark visual props, in authored form: exactly the keys stage 6 of
 * the pipeline resolves, each accepting the function form of a `TickProp`.
 * Anything else on an item is passthrough — carried untouched, typed by the
 * item's own `T`, and never evaluated, however function-shaped it looks.
 */
export type EvaluableProps = {
  /** Radial extent, in dial units. */
  length?: TickProp<DialUnits>
  /** Tangential extent, in dial units. */
  width?: TickProp<DialUnits>
  /** Scalar tangential shift, in dial units. */
  offset?: TickProp<DialUnits>
  /** Anchor distance inward from the outline, in dial units. */
  inset?: TickProp<DialUnits>
  /** Anchor radius from the centre, in dial units. */
  r?: TickProp<DialUnits>
  /** Paint. */
  fill?: TickProp<string>
}

/** The same six props after stage 6: fallbacks applied, function forms evaluated. */
export type ResolvedProps = {
  length?: DialUnits
  width?: DialUnits
  offset?: DialUnits
  inset?: DialUnits
  r?: DialUnits
  fill?: string
}

/**
 * One mark, as authored. `value` is a domain value; `at` overrides its
 * position. Everything else the author puts on an item — a label, a flag, a
 * callback — rides along in the item's own type `T extends TickItem` and
 * comes back out of `renderItem` as `mark.item`, still typed.
 */
export type TickItem = {
  value: DomainValue
  /** Position override in degrees, for nudging a mark without falsifying its value. */
  at?: Degrees
} & EvaluableProps

/**
 * One tier of a multi-track scale. `every` is a step in domain units; the
 * rest of the spec is folded onto every mark the tier generates, so a tier
 * population's item type is the spec itself minus `every` and `skip`, plus
 * the stepped `value` — see {@link TierItemOf}.
 */
export type TierSpec = { every: DomainValue } & EvaluableProps

/**
 * A mark after population, carrying its normalized position and provenance.
 *
 * The authored fields stay spread flat — the pipeline's later stages read and
 * fill them in place — while `item` carries the authored item as one
 * untouched unit (for a `ticks` population, the very array element), which is
 * what `useTicks` and `renderItem` hand back.
 */
export type ResolvedTick<T extends TickItem = TickItem> = T & {
  /** Normalized position in [0, 1] across the covered bounds. */
  t: number
  /** Index within this mark's own tier. */
  index: number
  /** Which tier produced it; 0 when tiers are not used. */
  tier: number
  /** The authored item, as a unit, untouched by prop resolution. */
  item: T
}

/** The item type a tier population generates: the tier's own props plus the stepped `value`. */
export type TierItemOf<S> = S extends TierSpec
  ? Omit<S, "every" | "skip"> & Pick<TickItem, "value">
  : never

/**
 * The item type an input's population carries: the element type under
 * `ticks`, the tier's own props under `tiers` (via {@link TierItemOf}), and
 * just `{ value }` under `count`, where nothing is authored per mark at all.
 */
export type ItemOf<I> = I extends { ticks: readonly (infer T extends TickItem)[] }
  ? T
  : I extends { tiers: readonly (infer S)[] }
    ? TierItemOf<S>
    : Pick<TickItem, "value">

/** What to populate, and over how much of the domain. */
export type PopulateInput = {
  /** Evenly spaced marks; the fencepost rule decides whether `to` is one of them. */
  count?: number
  /** Marks stated outright, passed through in the order given. */
  ticks?: readonly TickItem[]
  /** Marks derived from a domain step, one population per tier. */
  tiers?: readonly TierSpec[]
  /** Lower bound of the covered domain. @default scale.min */
  from?: DomainValue
  /** Upper bound of the covered domain. @default scale.max */
  to?: DomainValue
}

/**
 * Slack when asking whether an arc closes on itself. The covered sweep is a
 * product of two divisions, so an exact 360 is not guaranteed to land exactly.
 */
const CLOSED_ARC_EPSILON = 1e-9

/**
 * Most marks one tier may generate. A chronograph's finest track is a fifth of
 * a second over sixty — three hundred marks — so this is two orders of
 * magnitude of headroom for any dial a person would actually draw, and the only
 * way past it is arithmetic nobody intended: `every: 1e-9` over a 0–60 domain
 * asks for sixty billion marks and locks the tab before anything renders.
 */
const MAX_MARKS_PER_TIER = 10_000

/**
 * Stages 1 and 2 of the pipeline: build the mark population and bound it.
 *
 * `count`, `ticks`, and `tiers` are exactly-one-of. Combining them would need a
 * precedence rule, and a precedence rule is a thing to remember; an error is not.
 *
 * The `const` type parameter keeps a literal `ticks` array's shape — items
 * come back as `ResolvedTick<T>` with their authored fields still typed,
 * rather than widened or lost to an index signature.
 */
export function populate<const I extends PopulateInput>(
  input: I,
  scale: Scale,
): ResolvedTick<ItemOf<I>>[]
export function populate(input: PopulateInput, scale: Scale): ResolvedTick[] {
  const sources = (["count", "ticks", "tiers"] as const).filter((k) => input[k] !== undefined)
  if (sources.length !== 1) {
    // Not "<Ticks>": `populate` is exported and callable directly, so the
    // message has to name the input it received, not one of its callers. The
    // production survivor mirrors the branch order below — `ticks` beats
    // `count` beats `tiers` — marks stated outright are the most deliberate
    // of the three; none at all populates nothing, which can at least be seen.
    const survivor =
      input.ticks !== undefined ? "ticks" : input.count !== undefined ? "count" : undefined
    failSoft(
      "mainplate: a tick population needs exactly one of `count`, `ticks`, or `tiers`. " +
        `Received ${sources.length === 0 ? "none" : sources.map((k) => `\`${k}\``).join(" and ")}.`,
      survivor === undefined ? "Populating no marks." : `Using \`${survivor}\`.`,
    )
  }

  const from = input.from ?? scale.min
  const to = input.to ?? scale.max
  const span = to - from
  const eps = epsilonFor({ min: from, max: to })

  // The seam belongs to the arc actually covered, not to the frame. A full-turn
  // frame sliced to `from`/`to` draws an open arc with two distinct endpoints,
  // so keying off `scale.sweepAngle` alone would wrongly drop its last mark.
  const domainSpan = scale.max - scale.min
  const coveredSweep = domainSpan === 0 ? 0 : (span / domainSpan) * scale.sweepAngle
  const wraps = Math.abs(coveredSweep) >= 360 - CLOSED_ARC_EPSILON

  const withPosition = (items: TickItem[], tier: number): ResolvedTick[] =>
    items.map((item, index) => ({
      ...item,
      t: span === 0 ? 0 : (item.value - from) / span,
      index,
      tier,
      item,
    }))

  if (input.ticks) return withPosition([...input.ticks], 0)

  if (input.count !== undefined) {
    const n = input.count
    if (n <= 0) return []
    if (n === 1) return withPosition([{ value: from }], 0)
    // A closed arc would draw `from` and `to` on top of each other, so the
    // endpoint is excluded there and included on an open one.
    const step = wraps ? span / n : span / (n - 1)
    const items = Array.from({ length: n }, (_, k) => ({ value: from + k * step }))
    return withPosition(items, 0)
  }

  return (input.tiers ?? []).flatMap((tier, tierIndex) => {
    const { every, ...tierProps } = tier
    if (!(every > 0)) return []

    // Multiply rather than accumulate. `from + k * every` is reproducible for a
    // given k; a running sum drifts, and two tiers that should land on the same
    // position would then differ in the last bits and fail to merge.
    const lastStep = Math.floor((span + eps) / every)

    // Checked before the loop, not inside it: the point is never to start.
    const requested = lastStep + 1
    if (requested > MAX_MARKS_PER_TIER) {
      const received =
        `mainplate: tier ${tierIndex} with \`every: ${every}\` over a domain span of ${span} ` +
        `would generate ${requested} marks, past the ceiling of ${MAX_MARKS_PER_TIER}.`

      if (process.env.NODE_ENV !== "production") {
        throw new Error(
          `${received} That is almost always an \`every\` in the wrong units — a step in ` +
            `thousandths where the domain is counted in ones. Raise \`every\`, or narrow the ` +
            `tier's \`from\`/\`to\`.`,
        )
      }

      // As elsewhere: degrade rather than take down the page. Truncating draws
      // a wrong dial, but a wrong dial can be seen and reported; a locked tab
      // cannot.
      console.error(`${received} Truncating to ${MAX_MARKS_PER_TIER} marks.`)
    }

    const steps = Math.min(lastStep, MAX_MARKS_PER_TIER - 1)
    const items: TickItem[] = []
    for (let k = 0; k <= steps; k++) {
      const value = from + k * every
      // On a closed arc the mark at `to` sits on top of the one at `from`.
      if (wraps && k > 0 && Math.abs(value - to) <= eps) break
      items.push({ ...tierProps, value })
    }
    return withPosition(items, tierIndex)
  })
}

/** What a `skip` predicate and a function-valued prop both receive. */
export type TickContext<T = TickItem> = {
  /**
   * The authored item, as a unit: a `ticks` array element, the tier's own
   * props plus `value` under `tiers`, just `{ value }` under `count`.
   */
  item: T
  value: DomainValue
  t: number
  index: number
  tier: number
  angle: Degrees
}

/** Omit marks by listing their domain values, or by predicate. */
export type Skip<T = TickItem> = readonly DomainValue[] | ((ctx: TickContext<T>) => boolean)

/**
 * A prop that may vary per mark. The function form cannot cross the RSC
 * boundary — using it puts the page behind `"use client"`, exactly like a
 * factory-built `Outline`; the plain form serializes, so a server page keeps.
 */
export type TickProp<V, T = TickItem> = V | ((ctx: TickContext<T>) => V)

/** `populate`'s input plus the two `skip` placements and the top-level per-mark props. */
export type ResolveInput = Omit<PopulateInput, "tiers"> & {
  tiers?: readonly (TierSpec & { skip?: Skip })[]
  skip?: Skip
} & EvaluableProps

/**
 * The per-mark visual props the resolver owns: filled from the top level where
 * a mark left them undefined and, when function-valued, evaluated with a
 * `TickContext`. An allowlist, not a denylist — resolution reads exactly these
 * keys by name, so an unrecognised field that happens to hold a function
 * (`renderItem`, an event handler, a callback `ref`) is left alone
 * structurally instead of invoked by accident. Geometry props merge into one
 * path; `fill` splits paint and costs a node per colour.
 */
export const EVALUABLE_PROPS: ReadonlySet<keyof ResolvedProps> = new Set<keyof ResolvedProps>([
  "length",
  "width",
  "offset",
  "inset",
  "r",
  "fill",
])

function contextOf(tick: ResolvedTick, scale: Scale): TickContext {
  return {
    item: tick.item,
    value: tick.value,
    t: tick.t,
    index: tick.index,
    tier: tick.tier,
    angle: tick.at ?? valueToAngle(tick.value, scale),
  }
}

function shouldSkip(skip: Skip | undefined, ctx: TickContext, eps: number): boolean {
  if (!skip) return false
  if (typeof skip === "function") return skip(ctx)
  return skip.some((v) => Math.abs(v - ctx.value) <= eps)
}

/** Stage 6's one move: pass a `TickContext` through the function form, keep the plain form. */
function evaluate<V extends DialUnits | string>(
  prop: TickProp<V> | undefined,
  ctx: TickContext,
): V | undefined {
  return typeof prop === "function" ? prop(ctx) : prop
}

/**
 * Stages 1 through 6 of the pipeline.
 *
 * The two `skip` placements are the same operation at two points, and that
 * placement is the difference in meaning: a per-tier skip runs before the merge
 * so the tier below shows through, a top-level skip runs after it so the
 * position is cleared outright.
 *
 * `index` is within-tier and assigned during population; skipping leaves holes
 * rather than renumbering, so an index always names the same conceptual mark.
 */
export function resolveTicks<const I extends ResolveInput>(
  input: I,
  scale: Scale,
): (ResolvedTick<ItemOf<I>> & ResolvedProps)[]
export function resolveTicks(input: ResolveInput, scale: Scale): (ResolvedTick & ResolvedProps)[] {
  const eps = epsilonFor({ min: input.from ?? scale.min, max: input.to ?? scale.max })

  // 1–2. Population and bounds. A tier's `skip` is an instruction to this
  // stage's caller, not a prop; strip it so population does not fold it onto
  // every item, where it would masquerade as an authored per-mark field.
  const tiers = input.tiers?.map(({ skip: _skip, ...rest }) => rest)
  let ticks: ResolvedTick[] = populate(tiers ? { ...input, tiers } : input, scale)

  // 3. Per-tier skip, before the merge.
  const tierSkips = (input.tiers ?? []).map((t) => t.skip)
  if (tierSkips.some(Boolean)) {
    ticks = ticks.filter((tick) => !shouldSkip(tierSkips[tick.tier], contextOf(tick, scale), eps))
  }

  // 4. Tier merge: later tier wins at a shared position, within epsilon.
  if (input.tiers && input.tiers.length > 1) {
    const kept: ResolvedTick[] = []
    for (const tick of ticks) {
      const clash = kept.findIndex((k) => Math.abs(k.value - tick.value) <= eps)
      if (clash === -1) kept.push(tick)
      else if (tick.tier >= (kept[clash]?.tier ?? 0)) kept[clash] = tick
    }
    ticks = kept.sort((a, b) => a.value - b.value)
  }

  // 5. Top-level skip, after the merge.
  ticks = ticks.filter((tick) => !shouldSkip(input.skip, contextOf(tick, scale), eps))

  // 6. Prop resolution and function evaluation. Per-item beats tier, which
  // beats top-level; population already folded tier props onto each item, so
  // the top level only fills what the mark left undefined. Exactly the six
  // EVALUABLE_PROPS are read — resolution names its keys instead of iterating
  // the item's, so a passthrough field is never evaluated — and `item` rides
  // through untouched.
  return ticks.map((tick) => {
    const ctx = contextOf(tick, scale)
    return {
      ...tick,
      length: evaluate(tick.length ?? input.length, ctx),
      width: evaluate(tick.width ?? input.width, ctx),
      offset: evaluate(tick.offset ?? input.offset, ctx),
      inset: evaluate(tick.inset ?? input.inset, ctx),
      r: evaluate(tick.r ?? input.r, ctx),
      fill: evaluate(tick.fill ?? input.fill, ctx),
    }
  })
}
