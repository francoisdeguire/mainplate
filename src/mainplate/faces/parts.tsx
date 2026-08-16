"use client"

/**
 * The shared face parts: `<Hand>`, `<Cap>`, `<Dial>`, and a minimal `<Ticks>`.
 * May import: core, faces/*. One set for every face — flavor lives in the
 * `<Clock>`/`<Gauge>` wrappers, never in part duplicates.
 *
 * Two placement conventions, and which part uses which is the point:
 *
 * - **Marks on the outline go through `markTransform`** — no part assembles a
 *   transform by hand (the Task 2 rule; the spike shipped two defects doing
 *   exactly that).
 * - **Centre-anchored parts (hand, cap, dial) sit at `left/top: 50%`,**
 *   because the face box is centred on the dial origin by contract — the same
 *   assumption `markTransform` documents. Their only geometry is the dial→cqw
 *   size conversion, quantised through the shared `quantize` below.
 */
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { isSource, quantize, type Source, valueToAngle } from "../core"
import { bindRotation } from "./bind-rotation"
import { type MarkTransform, markTransform } from "./geometry"
import { useFaceContext } from "./mainplate"

/** Dial units → cqw (percent of the container's inline size), quantised. */
function cq(u: number, boxW: number): number {
  return boxW === 0 ? 0 : quantize((u / boxW) * 100)
}

/** A `MarkTransform` as the style every mark shares. */
function markStyle(t: MarkTransform): CSSProperties {
  return {
    position: "absolute",
    left: t.left,
    top: t.top,
    width: `${t.widthCqw}cqw`,
    height: `${t.heightCqw}cqw`,
    // Translate first, so the rotation happens about the centred mark.
    transform: `translate(-50%, -50%) rotate(${t.rotate}deg)`,
  }
}

/* ------------------------------------------------------------------- Dial */

export type DialProps = {
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<"div">, "children" | "className">

/**
 * The background surface: the outline's own bounding box, tinted from the
 * palette's 5% ramp. Rarely touched — it exists so a shadow, a texture, or a
 * hard-edged design-system surface has one obvious `className` target.
 */
export function Dial({ className, style, children, ...rest }: DialProps) {
  const { outline, boxW, unstyled } = useFaceContext()
  const box = outline.bbox()
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${cq(box.width, boxW)}cqw`,
        height: `${cq(box.height, boxW)}cqw`,
        transform: "translate(-50%, -50%)",
        ...(unstyled
          ? undefined
          : {
              // A round dial is a border-radius; the rect dial's corner radius
              // is pinned properly by the shape task — until then this is the
              // spike's eyeballed constant, good for the default rect only.
              borderRadius: box.width === box.height ? "50%" : `${cq(24, boxW)}cqw`,
              background: "var(--mp-dial)",
            }),
        ...style,
      }}
      {...rest}
      data-mp="dial"
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ Ticks */

export type TicksProps = {
  /** `"all"` is the minute track with hour majors; `"quarters"` keeps 12/3/6/9. @default "all" */
  variant?: "all" | "quarters"
  className?: string
} & Omit<ComponentProps<"div">, "children" | "className">

/** The minute ring's geometry, in dial units. Private: sizing is CSS. */
const TICK_INSET = 4
const MAJOR_LENGTH = 9
const MAJOR_WIDTH = 2.4
const MINOR_LENGTH = 5
const MINOR_WIDTH = 1

/**
 * The minimal tick part: hour majors at angular positions (so the hands point
 * at them), minute minors dividing the perimeter evenly (the chemin-de-fer
 * rhythm — identical on a circle, deliberate on anything else). The full
 * option surface (`count`/`every`/`skip`/`render`, stacked tracks) is the
 * tick-tracks task's; this ships the two variants tier 1 needs.
 */
export function Ticks({ variant = "all", className, style, ...rest }: TicksProps) {
  const { outline, boxW, boxH, unstyled } = useFaceContext()
  const marks: ReactNode[] = []

  const hours = variant === "quarters" ? [0, 3, 6, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  for (const h of hours) {
    const t = markTransform(
      outline,
      { angle: h * 30, inset: TICK_INSET + MAJOR_LENGTH / 2 },
      { orient: "edge", width: MAJOR_WIDTH, length: MAJOR_LENGTH, boxW, boxH },
    )
    marks.push(
      <div
        key={`M${h}`}
        className={className}
        style={{
          ...markStyle(t),
          ...(unstyled ? undefined : { borderRadius: 999, background: "var(--mp-tick-major)" }),
          ...style,
        }}
        {...rest}
        data-mp="tick"
      />,
    )
  }

  if (variant === "all") {
    const ring = outline.length(TICK_INSET + MINOR_LENGTH / 2)
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue // a major already holds this minute
      const t = markTransform(
        outline,
        { along: (i / 60) * ring, inset: TICK_INSET + MINOR_LENGTH / 2 },
        { orient: "edge", width: MINOR_WIDTH, length: MINOR_LENGTH, boxW, boxH },
      )
      marks.push(
        <div
          key={`m${i}`}
          className={className}
          style={{
            ...markStyle(t),
            ...(unstyled ? undefined : { borderRadius: 999, background: "var(--mp-tick)" }),
            ...style,
          }}
          {...rest}
          data-mp="tick"
        />,
      )
    }
  }

  return <>{marks}</>
}

/* ------------------------------------------------------------------- Hand */

export type HandType = "hour" | "minute" | "second"
export type HandVariant = "bar" | "taper" | "line"

/**
 * Per-type geometry, private by plan constraint: reach, counterweight tail,
 * width and the domain a bare hand of that type maps through. `plain` is the
 * untyped hand — a gauge needle before the Gauge wrapper dresses one.
 * `accent` marks the one red element of the design direction.
 */
const PRESETS: Record<
  HandType | "plain",
  {
    length: number
    tail: number
    width: number
    max: number
    accent: boolean
  }
> = {
  hour: { length: 46, tail: 12, width: 6.5, max: 12, accent: false },
  minute: { length: 68, tail: 12, width: 5, max: 60, accent: false },
  second: { length: 74, tail: 22, width: 1.6, max: 60, accent: true },
  plain: { length: 68, tail: 12, width: 5, max: 60, accent: false },
}

/**
 * The same hands on a face with no numerals, reaching into the ring the
 * numerals would have occupied (spec §12: minute 68 → 80). The spike gave one
 * anchor; hour and second follow it proportionally, so the three keep the
 * length relationships the eye reads as a set. Private constants, selected by
 * a wrapper's `numerals` prop — there is no public length prop, by plan
 * constraint, and this is why one is not missed.
 */
const LONG_REACH: Record<HandType | "plain", number> = {
  hour: 54,
  minute: 80,
  second: 86,
  plain: 80,
}

/** The stepping cadence's ease: fast out, soft landing — a quartz escapement. */
const TICK_TRANSITION = "transform 180ms cubic-bezier(0.23, 1, 0.32, 1)"

export type HandProps = {
  /**
   * The reading. A number is controlled; a `Source` is live (zero renders per
   * update). Omit it only as a slot inside `<Clock>`/`<Gauge>`: the wrapper
   * owns the reading and supplies it to whatever fills the slot, which is what
   * lets `<Clock><Hand type="second" className="…"/></Clock>` restyle the
   * seconds hand without also re-wiring it. A bare hand with no value sits at
   * its domain minimum.
   */
  value?: number | Source<number>
  /** Geometry and domain preset. Untyped hands get the minute's geometry over 0-60. */
  type?: HandType
  /** Domain minimum. Beats `source.domain`, which beats the type preset. @default 0 */
  min?: number
  /** Domain maximum. Beats `source.domain`, which beats the type preset. */
  max?: number
  /** Where the domain starts, in degrees from 12 o'clock. @default 0 */
  startAngle?: number
  /** The domain's angular span. @default 360 */
  sweepAngle?: number
  /** @default "bar" */
  variant?: HandVariant
  /**
   * Step once per value with the 180ms transition — which is exactly the case
   * where an absolute 354°→0° write spins backwards, so tick mode also turns
   * on the binder's unwrapping: every step moves by the shortest signed path
   * (59s→0s is +6°; a decreasing reading swings back the short way). @default false
   */
  tick?: boolean
  /**
   * Reach further into the ring a numeral track would have occupied. Set by
   * `<Clock numerals="none">` and by `<Gauge>`, whose face has no numerals at
   * all; the lengths themselves stay private constants. @default false
   */
  long?: boolean
  className?: string
  /** Replaces the shape entirely: the rotating box owns pivot and rotation, children own the look. */
  children?: ReactNode
} & Omit<ComponentProps<"div">, "children" | "className">

/**
 * A hand: a box pivoting on the dial centre, rotation written through a ref.
 *
 * The transform's division of labour is the SSR contract: **render emits the
 * translate only** — the pivot, static and deterministic — and the binder
 * writes `translate rotate(…)` on the client. No value, live or not, ever
 * reaches server HTML, so two server renders are byte-identical while real
 * time moves between them, and hydration has nothing to mismatch.
 */
export function Hand({
  value,
  type,
  min,
  max,
  startAngle = 0,
  sweepAngle = 360,
  variant = "bar",
  tick = false,
  long = false,
  className,
  style,
  children,
  ref,
  ...rest
}: HandProps) {
  const { boxW, unstyled, registerLive } = useFaceContext()
  const kind = type ?? "plain"
  const preset = PRESETS[kind]
  const length = long ? LONG_REACH[kind] : preset.length

  const source = isSource(value) ? value : null
  const controlled = typeof value === "number" ? value : 0

  // §8.10 precedence, prop > source.domain > preset — the same rule the SVG
  // layer rules by, restated here because this layer is where it now lives.
  const domainMin = min ?? source?.domain?.min ?? 0
  const domainMax = max ?? source?.domain?.max ?? preset.max

  const total = length + preset.tail
  const pivot = quantize((length / total) * 100)
  const translate = `translate(-50%, -${pivot}%)`

  const read = useMemo(() => {
    const get = source === null ? () => controlled : source.get
    const scale = { min: domainMin, max: domainMax, startAngle, sweepAngle }
    return () => valueToAngle(get(), scale)
  }, [source, controlled, domainMin, domainMax, startAngle, sweepAngle])
  const subscribe = source === null ? null : source.subscribe

  const el = useRef<HTMLDivElement | null>(null)
  const attachRef = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node
      if (typeof ref === "function") ref(node)
      else if (ref !== null && ref !== undefined) ref.current = node
    },
    [ref],
  )

  // ONE accumulator for the hand's whole life. Rebinds happen — a controlled
  // value change re-runs the effect, pause/resume constructs fresh binders —
  // and each fresh binder must continue from the rotation the element is
  // already wearing, or its first write is an absolute angle the armed
  // transition animates backwards through every accumulated lap.
  const accumulator = useRef<{ last: number | null }>({ last: null })

  useEffect(() => {
    const node = el.current
    if (node === null) return
    const options = { translate, unwrap: tick, state: accumulator.current }

    /**
     * Bind, with the mount pose exempted from the stepping transition.
     *
     * A hand's first write is where it *is*, not a step it took. Render emits
     * the translate alone — every hand points at 12 until the binder runs — so
     * with the transition armed that write animates the hand in from 12
     * o'clock over 180ms while the untransitioned hands beside it snap into
     * place, and it replays on every remount. One hand arriving late is read
     * as lag, not as charm, so the first write lands instantly and every step
     * after it animates. The accumulator dates the write: it is null exactly
     * once, before the hand has ever been placed.
     */
    const bind = (to: typeof subscribe) => {
      const armed = node.style.transition
      const mounting = tick && accumulator.current.last === null
      if (mounting) node.style.transition = "none"
      const off = bindRotation(node, read, to, options)
      if (mounting) {
        // Flush the pose against `none` before re-arming, or the restore lands
        // in the same style recalc and the transition runs after all.
        void node.getBoundingClientRect()
        node.style.transition = armed
      }
      return off
    }

    if (subscribe === null) {
      // Controlled: one write per value change, no liveness to manage.
      return bind(null)
    }
    // Live: bind, and register so the face can pause this hand offscreen.
    // Pausing IS unbinding — the unsubscribe rides the source's own refcount
    // down to the engine — and resuming rebinds, whose initial write resyncs
    // to the value as of now (seeded, so within ±180°) rather than replaying
    // the backlog.
    let unbind = bind(subscribe)
    const unregister = registerLive({
      pause: () => unbind(),
      resume: () => {
        unbind = bind(subscribe)
      },
    })
    return () => {
      unregister()
      unbind()
    }
  }, [read, subscribe, translate, tick, registerLive])

  const width = variant === "line" ? Math.min(preset.width, 1.6) : preset.width
  const paint: CSSProperties =
    unstyled || children !== undefined
      ? {}
      : {
          background: preset.accent ? "var(--mp-accent)" : "var(--mp-ink)",
          ...(variant === "taper"
            ? { clipPath: "polygon(8% 100%, 92% 100%, 56% 0%, 44% 0%)" }
            : { borderRadius: 999 }),
          filter: `drop-shadow(0 ${cq(1.6, boxW)}cqw ${cq(3, boxW)}cqw rgb(0 0 0 / 0.2))`,
        }

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${cq(width, boxW)}cqw`,
        height: `${cq(total, boxW)}cqw`,
        transformOrigin: `50% ${pivot}%`,
        transform: translate,
        ...(tick ? { transition: TICK_TRANSITION } : undefined),
        ...paint,
        ...style,
      }}
      {...rest}
      ref={attachRef}
      data-mp="hand"
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------- Cap */

export type CapProps = {
  className?: string
} & Omit<ComponentProps<"div">, "children" | "className">

/** The cap's diameter in dial units. Private: sizing is CSS. */
const CAP_DIAMETER = 9

/** The pivot cover — accent by default, the lollipop's dot. */
export function Cap({ className, style, ...rest }: CapProps) {
  const { boxW, unstyled } = useFaceContext()
  const d = cq(CAP_DIAMETER, boxW)
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${d}cqw`,
        height: `${d}cqw`,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        ...(unstyled
          ? undefined
          : {
              background: "var(--mp-accent)",
              boxShadow: `0 ${cq(0.5, boxW)}cqw ${cq(1, boxW)}cqw rgb(0 0 0 / 0.3)`,
            }),
        ...style,
      }}
      {...rest}
      data-mp="cap"
    />
  )
}
