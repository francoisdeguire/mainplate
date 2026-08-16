"use client"

/**
 * `<Face>` — the internal both tier-1 wrappers are.
 * May import: faces/*. Not exported from the barrel: it is the shared body of
 * `<Clock>` and `<Gauge>`, not a third public component.
 *
 * The owner's framing, made structural: **`<Clock>` and `<Gauge>` are the same
 * logic behind two prop surfaces.** Each wrapper's whole job is to turn its
 * props into a list of `FaceSlot`s — a reading, a part, and the identity a
 * child element must match to take that part over — and hand them here. This
 * component owns everything after that: the `<Mainplate>` root, the slot
 * composition, the render order. Neither wrapper computes a transform; neither
 * knows how a hand is placed. Give `<Gauge>` its own needle geometry and there
 * is nowhere to put it that `<Clock>` does not also read.
 *
 * The slot rule, stated once: **props decide existence, slots decide
 * appearance, and the wrapper keeps the wiring.** A `<Clock ticks="none">` has
 * no tick slot at all; a `<Ticks variant="quarters">` child changes how the
 * slot looks; and a `<Hand type="second">` child cannot detach the seconds
 * hand from the clock, because the reading is re-applied over whatever the
 * child passed. That is why slot props in the spec's table are appearance
 * props only — `className`, `variant`, `children` — and never `value`.
 */
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useSyncExternalStore,
} from "react"
import { Mainplate, type MainplateProps } from "./mainplate"
import { Hand, type HandProps, type HandType } from "./parts"

/** A child element, as this module has to inspect one. */
type AnyElement = ReactElement<Record<string, unknown>>

/** One replaceable position on a face. */
export type FaceSlot = {
  /** Stable identity — also the React key, so composition never keys on index. */
  key: string
  /**
   * The props the wrapper keeps even when a child takes the slot over: the
   * reading, and whatever domain the wrapper itself owns. Re-applied *after*
   * the child's own props, which is the whole difference between a slot and a
   * free child.
   *
   * It pins exactly the keys it names, and no others. `<Gauge>` wires the
   * domain, because `min`/`max`/`sweep` are its own props and a slot must not
   * outvote them; `<Clock>` does not, because a clock hand's domain is the
   * type preset's (or the source's) — so an explicit `max` on a slot hand
   * still wins there, which is §8.10's standing precedence, not a leak.
   */
  wiring: Record<string, unknown>
  /** Does this child claim this slot? Matched in order, one child per slot. */
  claims: (el: AnyElement) => boolean
  /** The default part, built from the same `wiring` — so the two cannot drift. */
  node: ReactNode
}

/** What a wrapper owns about a hand: the reading and the domain it maps through. */
export type HandWiring = Pick<
  HandProps,
  "value" | "type" | "min" | "max" | "startAngle" | "sweepAngle" | "tick" | "long"
>

/**
 * What a slot child owns about a hand: how it looks. A face's own flavor lives
 * here — the gauge's tapered accent needle, say — as a *default* the child
 * replaces wholesale, never as wiring re-applied over it.
 */
export type HandLook = Pick<HandProps, "variant" | "style">

/**
 * A hand slot: the wrapper's wiring, this face's default look, and the child
 * that may take it over — `forType` narrows the match so a clock's three hands
 * are three distinct slots rather than a first-come queue.
 *
 * Both wrappers build every one of their hands through this function, which is
 * the concrete form of the shared-core claim: there is no second place a hand
 * could be constructed differently.
 */
export function handSlot(
  key: string,
  wiring: HandWiring,
  look?: HandLook,
  forType?: HandType,
): FaceSlot {
  return {
    key,
    wiring,
    claims: (el) => el.type === Hand && (forType === undefined || el.props.type === forType),
    // The default is built from the same wiring the replacement is re-wired
    // with, so a slot and its default cannot disagree about the reading.
    node: <Hand {...look} {...wiring} />,
  }
}

/**
 * A part slot with no wiring at all — dial, ticks, cap. The claim is read off
 * the default node's own component, so naming the part twice is impossible.
 */
export function partSlot(key: string, node: ReactElement): FaceSlot {
  return { key, wiring: {}, claims: (el) => el.type === node.type, node }
}

/**
 * Children with fragments opened, depth-first.
 *
 * `Children.toArray` flattens nested *arrays* but leaves a `<>…</>` intact as
 * one opaque element — and a fragment is what `{flag && <Hand/>}` groups, what
 * a `.map` over slots produces, and what a consumer's own wrapper component
 * returns. Left unopened, a slot inside one claims nothing and renders as a
 * second hand beside the default it meant to replace. Keys are prefixed by the
 * fragment's own key on the way down, so two fragments cannot both contribute
 * a `.0`.
 */
function flatten(children: ReactNode, prefix: string, out: ReactNode[]): void {
  for (const kid of Children.toArray(children)) {
    if (!isValidElement<{ children?: ReactNode }>(kid)) {
      out.push(kid)
      continue
    }
    if (kid.type === Fragment) {
      flatten(kid.props.children, `${prefix}${String(kid.key)}/`, out)
      continue
    }
    out.push(cloneElement(kid, { key: `${prefix}${String(kid.key)}` }))
  }
}

/**
 * Slots in their canonical order, each either the default part or the child
 * that claimed it, followed by every child that claimed nothing.
 *
 * Order is the z-order — dial under ticks under hands under cap — so a
 * replacement renders *where its slot was*, not where the caller wrote it. A
 * seconds hand restyled through a slot must not suddenly paint over the cap.
 * Free children come last, on top, which is where added content belongs.
 */
function composeSlots(slots: FaceSlot[], children: ReactNode): ReactNode[] {
  const kids: ReactNode[] = []
  flatten(children, "", kids)
  const claimed = new Map<string, ReactNode>()
  const extras: ReactNode[] = []

  for (const kid of kids) {
    const el = isValidElement<Record<string, unknown>>(kid) ? kid : null
    const slot = el === null ? undefined : slots.find((s) => !claimed.has(s.key) && s.claims(el))
    if (el === null || slot === undefined) {
      extras.push(kid)
      continue
    }
    // `cloneElement` merges this config over the child's own props, so the
    // wiring wins and everything the child said about appearance survives.
    claimed.set(slot.key, cloneElement(el, { ...slot.wiring, key: slot.key }))
  }

  return [
    ...slots.map((s) => {
      const claimant = claimed.get(s.key)
      if (claimant !== undefined) return claimant
      return isValidElement(s.node) ? cloneElement(s.node, { key: s.key }) : s.node
    }),
    ...extras,
  ]
}

export type FaceProps = {
  slots: FaceSlot[]
} & MainplateProps

/** The shared body: one `<Mainplate>`, its slots composed, nothing else. */
export function Face({ slots, children, ...root }: FaceProps) {
  return <Mainplate {...root}>{composeSlots(slots, children)}</Mainplate>
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function subscribeMotion(onChange: () => void): () => void {
  if (typeof matchMedia === "undefined") return () => {}
  const mql = matchMedia(REDUCED_MOTION)
  // Safari served `matchMedia` without `addEventListener` until 14 — the same
  // guard the ticker carries, for the same browsers.
  if (typeof mql.addEventListener !== "function") return () => {}
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function readMotion(): boolean {
  return typeof matchMedia === "undefined" ? false : matchMedia(REDUCED_MOTION).matches
}

/**
 * `prefers-reduced-motion`, live. The server snapshot is always `false`: no
 * transition is *armed* server-side either (the binder writes the first pose
 * after mount), so there is nothing to mismatch, and a viewer who reduces
 * motion gets the instant path from their first client render.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, readMotion, () => false)
}
