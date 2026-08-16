"use client"

/**
 * `<Arc>` — the stroked sweep, and the face's one embedded SVG layer.
 * May import: core, faces/mainplate.
 *
 * A stroke is the one thing HTML cannot draw. Everything else on a face is a
 * div — that is the whole point of this layer — but an arc with a round cap
 * along a shaped outline is a path, so exactly one `<svg>` exists per face and
 * every arc on that face draws into it. Spec §3: an implementation detail, and
 * **no `<svg>` appears in any public type**. A consumer writes `<Arc>`; the
 * element it lands in is this module's business.
 *
 * ## One layer, and how the arcs get into it
 *
 * The layer is a sibling of the face's divs, not an ancestor of them, so an
 * arc cannot simply render inside it where it stands. Two mechanisms could
 * bridge that: a portal, or composition. A portal is out — it renders nothing
 * on the server, and a gauge's track is in the server HTML today and must stay
 * there (`faces.ssr.test.tsx` pins it). So it is composition: the context
 * holders — `<Mainplate>` and a `<Complication size>` — pass their children
 * through `hoistArcs`, which lifts every `<Arc>` among them into ONE
 * `<ArcLayer>` placed **where the first arc was written**, so the shared layer
 * keeps the composition's own z-order instead of imposing one.
 *
 * The walk sees fragments and arrays, and stops at every other component —
 * the same shallow-plus-fragment reach `<Face>`'s slot claiming has, and the
 * same reason: React can only see the elements it is handed, never what
 * another component will return. An `<Arc>` the walk cannot see still draws:
 * it hosts a layer of its own, which is correct wherever it sits inside a
 * plain (unpositioned) wrapper, and merely local inside a positioned one.
 * That fallback is why a stray arc degrades instead of vanishing.
 *
 * ## The live path
 *
 * `from`/`to` take `Source`s, and a live endpoint rewrites `d` on the element
 * with no React commit at all — the same bargain `<Hand>` strikes for
 * rotation. Two consequences, both deliberate:
 *
 * - **A live endpoint renders empty.** No reading reaches server HTML, so two
 *   server renders are identical while the value moves, and hydration has
 *   nothing to mismatch. The mount write supplies the truth.
 * - **The write is quantised.** Not by the render path — it never runs — but
 *   because both paths build the string through the engine's `arcPath`, whose
 *   every coordinate goes through `fmt`. One builder, shared verbatim, is what
 *   keeps the ref path from reintroducing the hydration-mismatch bug.
 */
import {
  type ComponentProps,
  type CSSProperties,
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import {
  arcPath,
  type Degrees,
  type DialUnits,
  frameBox,
  isSource,
  quantize,
  type Scale,
  type Source,
  valueToAngle,
} from "../core"
import { useFaceContext } from "./mainplate"

/** The arc's own defaults, in dial units. Private: sizing is CSS. */
const ARC_INSET = 10
const ARC_WIDTH = 3

/**
 * Is this element rendering inside the shared layer already? The layer
 * provides it; an arc that reads `false` was never hoisted and hosts its own.
 */
const ArcLayerContext = createContext(false)

/** The layer's own box: absolute over the dial, unclipped, invisible to AT. */
const LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  overflow: "visible",
}

/**
 * The face's single `<svg>`, sized to the face box in dial units so an arc's
 * coordinates are the same numbers every other part reasons in.
 *
 * `role="presentation"` plus `aria-hidden`: a face root is already
 * children-presentational (`role="img"`/`"meter"`), and this layer is pure
 * decoration under either one — it carries no text and no reading.
 */
function ArcLayer({ children }: { children: ReactNode }) {
  const { outline } = useFaceContext()
  const box = useMemo(() => frameBox({ outline, clip: false }), [outline])
  return (
    <svg
      viewBox={`${quantize(box.x)} ${quantize(box.y)} ${quantize(box.width)} ${quantize(box.height)}`}
      role="presentation"
      aria-hidden="true"
      style={LAYER_STYLE}
      data-mp="arcs"
    >
      <ArcLayerContext.Provider value={true}>{children}</ArcLayerContext.Provider>
    </svg>
  )
}

/** A node the walk may descend into: an array, or a fragment's children. */
function childrenOf(node: ReactElement): ReactNode {
  return (node.props as { children?: ReactNode }).children
}

/** Every `<Arc>` among these children, in written order. Fragments opened. */
function collectArcs(node: ReactNode, out: ReactElement[]): void {
  if (Array.isArray(node)) {
    for (const kid of node as ReactNode[]) collectArcs(kid, out)
    return
  }
  if (!isValidElement(node)) return
  if (node.type === Arc) {
    out.push(node)
    return
  }
  if (node.type === Fragment) collectArcs(childrenOf(node), out)
}

/**
 * The same walk again, rebuilding the tree: the first arc becomes the layer,
 * every later one is dropped (it is inside the layer now). Fragments are
 * cloned rather than flattened, so nothing but the arcs changes position.
 */
function replaceArcs(node: ReactNode, state: { layer: ReactNode; placed: boolean }): ReactNode {
  if (Array.isArray(node)) return (node as ReactNode[]).map((kid) => replaceArcs(kid, state))
  if (!isValidElement(node)) return node
  if (node.type === Arc) {
    if (state.placed) return null
    state.placed = true
    return state.layer
  }
  if (node.type === Fragment) {
    return cloneElement(node, {}, replaceArcs(childrenOf(node), state))
  }
  return node
}

/**
 * Children with their arcs lifted into one shared `<svg>`. Called by the two
 * components that establish a face context — `<Mainplate>` and a
 * `<Complication size>` — so "one layer per context" is structural rather
 * than a rule someone has to remember.
 *
 * Returns the children untouched when there is no arc among them: a clock
 * pays a shallow walk and not one node more.
 */
export function hoistArcs(children: ReactNode): ReactNode {
  const arcs: ReactElement[] = []
  collectArcs(children, arcs)
  if (arcs.length === 0) return children
  const layer = (
    <ArcLayer key="mp-arcs">
      {arcs.map((arc, i) => cloneElement(arc, { key: arc.key ?? `arc-${i}` }))}
    </ArcLayer>
  )
  return replaceArcs(children, { layer, placed: false })
}

export type ArcProps = {
  /** Where the sweep starts, as a domain value. A `Source` is live. */
  from: number | Source<number>
  /** Where the sweep ends, as a domain value. A `Source` is live. */
  to: number | Source<number>
  /** How far inside the outline the stroke's centre runs, in dial units. @default 10 */
  inset?: DialUnits
  /** Stroke width in dial units. @default 3 */
  width?: DialUnits
  /** Domain minimum. Beats an endpoint's `domain`, which beats 0. @default 0 */
  min?: number
  /** Domain maximum. Beats an endpoint's `domain`, which beats 100. @default 100 */
  max?: number
  /** Where the domain starts, in degrees from 12 o'clock. @default 0 */
  startAngle?: Degrees
  /** The domain's angular span. @default 360 */
  sweepAngle?: Degrees
  className?: string
} & Omit<
  ComponentProps<"path">,
  "d" | "from" | "to" | "min" | "max" | "width" | "className" | "children"
>

/**
 * An arc on the face: a stroked sweep between two domain values, drawn on the
 * face's own outline through the engine's `arcPath` — so it is already
 * shape-correct wherever a `shape` face takes it.
 *
 * The domain follows the same §8.10 precedence every reading part obeys: an
 * explicit `min`/`max` beats a `Source`'s own `domain`, which beats 0–100. A
 * bare arc therefore reads as a percentage, which is what a progress ring is.
 */
export function Arc({
  from,
  to,
  inset = ARC_INSET,
  width = ARC_WIDTH,
  min,
  max,
  startAngle = 0,
  sweepAngle = 360,
  className,
  style,
  ref,
  ...rest
}: ArcProps) {
  const { outline, unstyled, registerLive } = useFaceContext()
  const layered = useContext(ArcLayerContext)

  const fromSource = isSource(from) ? (from as Source<number>) : null
  const toSource = isSource(to) ? (to as Source<number>) : null

  // Prop, then whichever endpoint declares a domain (written order), then the
  // percentage default. One rule for both bounds, so a pair of sources cannot
  // contribute half a domain each and leave the arc mapping through neither.
  const domainMin = min ?? fromSource?.domain?.min ?? toSource?.domain?.min ?? 0
  const domainMax = max ?? fromSource?.domain?.max ?? toSource?.domain?.max ?? 100

  /**
   * The path data, built the one way. The render path and the ref path call
   * THIS — the engine's `arcPath` with this arc's geometry — so the string an
   * unmounted server and a running browser produce cannot drift, and the ref
   * path inherits `fmt`'s quantisation instead of needing its own copy.
   */
  const build = useMemo(() => {
    const scale: Scale = { min: domainMin, max: domainMax, startAngle, sweepAngle }
    return (f: number, t: number) =>
      arcPath(
        outline,
        valueToAngle(f, scale),
        valueToAngle(t, scale),
        undefined,
        inset,
        "center",
        width,
      )
  }, [outline, domainMin, domainMax, startAngle, sweepAngle, inset, width])

  const el = useRef<SVGPathElement | null>(null)
  const attachRef = useCallback(
    (node: SVGPathElement | null) => {
      el.current = node
      if (typeof ref === "function") ref(node)
      else if (ref !== null && ref !== undefined) ref.current = node
    },
    [ref],
  )

  const read = useMemo(() => {
    const readFrom = fromSource === null ? () => from as number : fromSource.get
    const readTo = toSource === null ? () => to as number : toSource.get
    return () => build(readFrom(), readTo())
  }, [from, to, fromSource, toSource, build])

  const subFrom = fromSource === null ? null : fromSource.subscribe
  const subTo = toSource === null ? null : toSource.subscribe

  useEffect(() => {
    if (subFrom === null && subTo === null) return
    const bind = () => {
      const write = () => {
        const node = el.current
        if (node === null) return
        node.setAttribute("d", read())
      }
      // Written once on subscription, not only on change: a live endpoint
      // renders empty, so this first write is what puts the arc on the face.
      write()
      const offs: (() => void)[] = []
      if (subFrom !== null) offs.push(subFrom(write))
      // One source on both ends subscribes once — two writes per notification
      // would be the same string twice.
      if (subTo !== null && subTo !== subFrom) offs.push(subTo(write))
      return () => {
        for (const off of offs) off()
      }
    }
    // The face's registry pauses this while the face is offscreen, exactly as
    // it pauses a hand: pausing IS unsubscribing, and the refcount does the
    // rest all the way down to the engine.
    let unbind = bind()
    const unregister = registerLive({
      pause: () => unbind(),
      resume: () => {
        unbind = bind()
      },
    })
    return () => {
      unregister()
      unbind()
    }
  }, [subFrom, subTo, read, registerLive])

  const path = (
    <path
      // A live endpoint renders NOTHING — the mount write places it — which is
      // `arcPath`'s own "nothing to draw" value, so the node exists either way.
      d={subFrom === null && subTo === null ? build(from as number, to as number) : ""}
      fill="none"
      stroke={unstyled ? undefined : "var(--mp-tick)"}
      strokeWidth={width}
      strokeLinecap="round"
      // Before the spread: a face naming its own arcs (`"track"`, `"redline"`)
      // is naming this same element, and the name is the caller's to give.
      data-mp="arc"
      {...rest}
      className={className}
      style={style}
      ref={attachRef}
    />
  )

  return layered ? path : <ArcLayer>{path}</ArcLayer>
}
