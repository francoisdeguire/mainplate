/**
 * The tick pipeline. Pure array transformation: zero imports beyond geometry,
 * no React, no DOM.
 * May import: geometry. Must not import: react, time/.
 */
import { type Degrees, type DomainValue, epsilonFor, type Scale } from "./geometry"

/** One mark, as authored. `value` is a domain value; `at` overrides its position. */
export type TickItem = {
  value: DomainValue
  /** Position override in degrees, for nudging a mark without falsifying its value. */
  at?: Degrees
  [key: string]: unknown
}

/** One tier of a multi-track scale. `every` is a step in domain units. */
export type TierSpec = {
  every: DomainValue
  [key: string]: unknown
}

/** A mark after population, carrying its normalized position and provenance. */
export type ResolvedTick = TickItem & {
  /** Normalized position in [0, 1] across the covered bounds. */
  t: number
  /** Index within this mark's own tier. */
  index: number
  /** Which tier produced it; 0 when tiers are not used. */
  tier: number
}

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
 * Stages 1 and 2 of the pipeline: build the mark population and bound it.
 *
 * `count`, `ticks`, and `tiers` are exactly-one-of. Combining them would need a
 * precedence rule, and a precedence rule is a thing to remember; an error is not.
 */
export function populate(input: PopulateInput, scale: Scale): ResolvedTick[] {
  const sources = [input.count !== undefined, input.ticks !== undefined, input.tiers !== undefined]
  if (sources.filter(Boolean).length !== 1) {
    throw new Error(
      "<Ticks> needs exactly one of `count`, `ticks`, or `tiers`. " +
        `Received ${sources.filter(Boolean).length}.`,
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
    const items: TickItem[] = []
    for (let k = 0; k <= lastStep; k++) {
      const value = from + k * every
      // On a closed arc the mark at `to` sits on top of the one at `from`.
      if (wraps && k > 0 && Math.abs(value - to) <= eps) break
      items.push({ ...tierProps, value })
    }
    return withPosition(items, tierIndex)
  })
}
