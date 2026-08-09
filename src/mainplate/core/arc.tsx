"use client"

/**
 * `<Arc>`: the library's only stroked primitive.
 * May import: frame, geometry, outline, source, ticks. Must not import: time/.
 *
 * Everything else fills — `<Dial>` makes `stroke` a compile error, because a
 * stroked ring at an inset *is* a full-sweep `<Arc>`. So this component
 * carries the whole stroking story: a redline on a tachymeter, a gauge fill
 * that tracks a value, a rail tracing a Tank's rounded-rect case. Its two
 * anchors are deliberately different coordinate systems: `r` is
 * frame-anchored and always circular; `inset` is outline-anchored and traces
 * the outline's own shape. On a circle they coincide; on a rect they diverge
 * completely, and that divergence is the reason both exist.
 */
import { type SVGProps, useEffect, useRef } from "react"
import { useFrame } from "./frame"
import {
  type Degrees,
  type DialUnits,
  type DomainValue,
  fmt,
  normalizeAngle,
  polar,
} from "./geometry"
import type { Outline } from "./outline"
import { isSource, type Source } from "./source"
import type { Align } from "./ticks"

/**
 * Sweeps this close to nothing or to a full turn snap to those cases. Below
 * quantisation, an open arc's endpoints round to the same coordinates — and
 * SVG draws *nothing* for an `A` whose endpoints coincide, so a gauge at
 * 99.99% of its sweep would vanish instead of closing into the ring.
 */
const SWEEP_EPSILON = 1e-4

const RAD_TO_DEG = 180 / Math.PI

/**
 * The anchor: exactly one of two coordinate systems, as an XOR union.
 *
 * `r` ignores the outline and draws a circle of the frame's — right for
 * anything a hand indicates, since hands sweep circles whatever the case
 * shape. `inset` follows the outline — right for bezels, rails and chapter
 * rings that belong to the case. Naming both is a contradiction, not an
 * override, so the `?: never` fields make it a compile error.
 */
type ArcAnchor =
  | {
      /** Anchor distance inward from the outline, in dial units. @default 0 */
      inset?: DialUnits
      r?: never
    }
  | {
      /** Anchor radius from the centre, ignoring the outline, in dial units. */
      r: DialUnits
      inset?: never
    }

/**
 * Props for {@link Arc}: bounds, an anchor (`inset` | `r`), stroke placement,
 * and any SVG prop a `<path>` takes — minus the ones the primitive owns.
 *
 * `d` is the arc's whole output. `from`/`to` are React's SMIL attributes on
 * the base type, redeclared here as domain values. `r` is redeclared by the
 * anchor union. `strokeWidth` narrows to a number because it participates in
 * geometry (`align` shifts the path by half of it), and geometry stays in
 * props — a CSS `stroke-2` can restyle the paint but cannot move the anchor.
 * `ref` is withheld because the `<path>` node is the seam a `Source` mutates;
 * wrap the arc in a `<g>` of your own if you need a handle near it. `fill` is
 * a compile error, mirror-image of `<Dial>`'s `stroke?: never`: SVG fills an
 * open path as if closed by its chord, so a "filled" redline silently renders
 * a chord segment that looks plausible and is wrong — the filled story
 * belongs to `<Dial>`.
 */
export type ArcProps = Omit<
  SVGProps<SVGPathElement>,
  "d" | "fill" | "from" | "r" | "ref" | "stroke" | "strokeWidth" | "to"
> &
  ArcAnchor & {
    /**
     * Where the arc begins: a domain value, or a `Source` of one.
     *
     * A number is the controlled form, a pure function of props. A `Source`
     * makes the arc live: it subscribes and rewrites the path's `d` through a
     * ref, so the value can change without React rendering anything. Unlike a
     * `<Hand>`'s rotation — one compositor-friendly CSS property — every
     * update here recomputes and reparses path data, which is repaint-bound.
     * Pair it with tick-cadence sources (a battery level, a chronograph
     * totaliser), not animation-frame ones; a needle that moves every frame
     * belongs on `<Hand>`.
     *
     * Unlike `<Hand>`, a source's `domain` is **not** consulted: `from` and
     * `to` may be two sources with two domains, and one scale cannot honour
     * both, so the frame's scale governs. A source built with a domain maps
     * differently here than on `<Hand value>`. @default the frame's `min`
     */
    from?: DomainValue | Source<number>
    /**
     * Where the arc ends — `<Arc to={speed} />` is a gauge fill. A `Source`
     * here carries the same repaint-bound cost as on `from`: prefer
     * tick-cadence sources. As on `from`, the source's `domain` is **not**
     * consulted — unlike `<Hand>`, the frame's scale governs both endpoints.
     * @default the frame's `max`
     */
    to?: DomainValue | Source<number>
    /**
     * Which edge of the stroke sits on the anchor. SVG strokes are always
     * centred on the path, so this is the only control over stroke placement:
     * `"inside"` shifts the path by `strokeWidth / 2` so the stroke's *outer*
     * edge lands exactly on the anchor, `"outside"` so its inner edge does.
     * @default "center"
     */
    align?: Align
    /**
     * Paint for the stroke. Defaults to `currentColor` — the rule for every
     * primitive's paint — so a single `color` on an ancestor themes the whole
     * face. On this one primitive the themed paint is the stroke, because the
     * stroke is the primitive. @default "currentColor"
     */
    stroke?: string
    /**
     * Stroke thickness in dial units. A number, not CSS: `align` moves the
     * path by half of it, so the component must know the true value.
     * @default 1
     */
    strokeWidth?: DialUnits
    fill?: never
  }

/**
 * Arc length along the outline of the point at `angle`, found by bisection.
 *
 * The outline answers angle→point and length→point but not angle→length, and
 * tracing needs the arc-length coordinates of the two endpoints. On every
 * outline this library builds — closed, convex, centred on the origin — the
 * clock angle of `pointAtLength(s)` grows monotonically from 0 to 360 over
 * one perimeter, so the inverse is a clean bisection: 52 halvings put the
 * error below a millionth of a dial unit, far under `fmt`'s quantisation.
 */
function lengthAtAngle(
  outline: Outline,
  angle: Degrees,
  inset: DialUnits,
  total: DialUnits,
): DialUnits {
  const target = normalizeAngle(angle)
  if (target === 0) return 0
  let lo = 0
  let hi = total
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2
    const p = outline.pointAtLength(mid, inset)
    const raw = normalizeAngle(Math.atan2(p.x, -p.y) * RAD_TO_DEG)
    // The seam: a point rounding to exactly the top-centre reads as angle 0,
    // which in the second half of the walk means 360, not the start.
    const a = raw === 0 && mid > total / 2 ? 360 : raw
    if (a <= target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The path data for an arc, shared verbatim by the render path and the ref
 * path so the two cannot disagree — the same reasoning as `<Hand>`'s
 * `buildOverride`. Every coordinate goes through `fmt`: this string is a
 * hydration boundary, and with a `Source` it is also rewritten outside React,
 * where the render path's quantisation cannot cover it.
 *
 * The full-sweep circular form is written in `circleOutline().path()`'s exact
 * shape — two half-arcs, since SVG cannot express a full circle in one arc
 * command — so `r` and `inset` coinciding on a circle is visible as literal
 * string equality, not just as geometry.
 */
function arcPath(
  outline: Outline,
  angleFrom: Degrees,
  angleTo: Degrees,
  r: DialUnits | undefined,
  inset: DialUnits,
  align: Align,
  strokeWidth: DialUnits,
): string {
  const sweep = angleTo - angleFrom
  // Nothing to draw — but the caller still renders the node, because a
  // Source may drive the sweep off zero without a React render.
  if (Math.abs(sweep) < SWEEP_EPSILON) return ""
  const full = Math.abs(sweep) >= 360 - SWEEP_EPSILON

  if (r !== undefined) {
    // Inside means deeper into the face: for a frame anchor, a smaller radius.
    const shift = align === "inside" ? -strokeWidth / 2 : align === "outside" ? strokeWidth / 2 : 0
    const radius = Math.max(r + shift, 0)
    const f = fmt(radius)
    if (full) {
      return `M 0 ${fmt(-radius)} A ${f} ${f} 0 1 1 0 ${f} A ${f} ${f} 0 1 1 0 ${fmt(-radius)} Z`
    }
    const p0 = polar(angleFrom, radius)
    const p1 = polar(angleTo, radius)
    const large = Math.abs(sweep) > 180 ? 1 : 0
    const dir = sweep > 0 ? 1 : 0
    return `M ${fmt(p0.x)} ${fmt(p0.y)} A ${f} ${f} 0 ${large} ${dir} ${fmt(p1.x)} ${fmt(p1.y)}`
  }

  // The same shift with the opposite sign: an inset already measures inward,
  // so deeper is a *larger* inset. Negative is legal — an outside-aligned
  // stroke on the outline itself sits beyond it, and the outline's own inset
  // handling grows outward correctly, rounding the corners a true outward
  // offset acquires.
  const shift = align === "inside" ? strokeWidth / 2 : align === "outside" ? -strokeWidth / 2 : 0
  const effInset = inset + shift

  // A full sweep along the outline is the outline: exact, closed, no samples.
  if (full) return outline.path(effInset)

  const total = outline.length(effInset)
  if (total <= 0) return ""

  const s0 = lengthAtAngle(outline, angleFrom, effInset, total)
  const s1 = lengthAtAngle(outline, angleTo, effInset, total)
  // Signed distance to walk, wrapping in the sweep's direction. `forward` and
  // its backward complement sum to the perimeter, so the negative branch is
  // just the other way round the case.
  const forward = (((s1 - s0) % total) + total) % total
  const walk = sweep > 0 ? forward : forward - total
  if (walk === 0) return ""

  // A polyline along the outline, one sample per ≤2 dial units. The chord
  // error is r·Δθ²/8: under 0.006 units on the main circle, and still under
  // a tenth of a unit on the tightest corner an outline offers — beneath
  // visibility at any size a face renders at. `pointAtLength` wraps, so the
  // walk may cross the top-centre seam freely.
  const segments = Math.max(8, Math.ceil(Math.abs(walk) / 2))
  const parts: string[] = []
  for (let i = 0; i <= segments; i++) {
    const p = outline.pointAtLength(s0 + (walk * i) / segments, effInset)
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(p.x)} ${fmt(p.y)}`)
  }
  return parts.join(" ")
}

/**
 * A stroked arc between two domain values, on one of two anchors.
 *
 * With plain numbers it is a pure function of props: a redline, a bezel, a
 * rail. With a `Source` on `from` or `to` it is live: it subscribes and
 * rewrites the path's `d` through a ref, costing zero React renders — but,
 * unlike a hand's compositor-promoted rotation, each rewrite recomputes and
 * reparses path data and triggers a repaint. That makes a live `<Arc>` a more
 * expensive class than a live `<Hand>`: drive it at tick cadence, not at
 * animation-frame cadence.
 */
export function Arc({
  from,
  to,
  r,
  inset = 0,
  align = "center",
  stroke = "currentColor",
  strokeWidth = 1,
  ...rest
}: ArcProps) {
  const { frame, angleFor } = useFrame()
  const pathRef = useRef<SVGPathElement | null>(null)

  // The runtime discriminators for the two unions. Each endpoint narrows
  // independently: `from` may be a number while `to` is live.
  let fromSource: Source<number> | null = null
  let currentFrom: DomainValue
  if (from === undefined) currentFrom = frame.min
  else if (isSource(from)) {
    fromSource = from
    currentFrom = fromSource.get()
  } else currentFrom = from

  let toSource: Source<number> | null = null
  let currentTo: DomainValue
  if (to === undefined) currentTo = frame.max
  else if (isSource(to)) {
    toSource = to
    currentTo = toSource.get()
  } else currentTo = to

  const outline = frame.outline
  // With a source, this render path still draws the current value, so the
  // server's HTML carries the same quantised `d` the client hydrates and the
  // effect below then keeps live.
  const d = arcPath(
    outline,
    angleFor(currentFrom),
    angleFor(currentTo),
    r,
    inset,
    align,
    strokeWidth,
  )

  // Detached from the source objects so the effect's dependencies are the
  // methods themselves: `createSource` returns closures with stable identity,
  // so re-renders re-run nothing, while swapping a source — or swapping to a
  // plain number, which nulls its pair — tears down and resubscribes. The
  // static stand-ins are pinned to 0 while a source is live so a moving
  // `get()` read here cannot churn the subscription; `write` never reads a
  // stand-in whose endpoint has a source.
  const subscribeFrom = fromSource === null ? null : fromSource.subscribe
  const getFrom = fromSource === null ? null : fromSource.get
  const subscribeTo = toSource === null ? null : toSource.subscribe
  const getTo = toSource === null ? null : toSource.get
  const staticFrom = fromSource === null ? currentFrom : 0
  const staticTo = toSource === null ? currentTo : 0

  useEffect(() => {
    if (subscribeFrom === null && subscribeTo === null) return
    const write = () => {
      // Null while unmounting: a notification arriving mid-teardown must not
      // touch a detached node.
      const node = pathRef.current
      if (node === null) return
      const f = getFrom === null ? staticFrom : getFrom()
      const t = getTo === null ? staticTo : getTo()
      // Quantised because arcPath runs everything through fmt — this write
      // bypasses React entirely, so nothing else would cover it.
      node.setAttribute(
        "d",
        arcPath(outline, angleFor(f), angleFor(t), r, inset, align, strokeWidth),
      )
    }
    // Written once on subscription, not only on change: a value that moved
    // between this render and this effect would otherwise never be drawn.
    write()
    const offFrom = subscribeFrom === null ? null : subscribeFrom(write)
    const offTo = subscribeTo === null ? null : subscribeTo(write)
    return () => {
      offFrom?.()
      offTo?.()
    }
  }, [
    subscribeFrom,
    getFrom,
    subscribeTo,
    getTo,
    staticFrom,
    staticTo,
    outline,
    angleFor,
    r,
    inset,
    align,
    strokeWidth,
  ])

  return (
    <path
      data-mp="arc"
      stroke={stroke}
      strokeWidth={strokeWidth}
      {...rest}
      // After the spread: the types already refuse a caller's `d` and `fill`,
      // and this is the second lock, for the untyped spread that gets past
      // them. `d` is the component's whole output; `fill` on an open path
      // paints the chord segment, the exact mistake the type exists to stop.
      ref={pathRef}
      fill="none"
      d={d}
    />
  )
}
