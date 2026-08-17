"use client"

/**
 * `<Gauge>` — the tier-1 instrument reading.
 * May import: core, faces/*.
 *
 * The second prop surface over the same face. Everything structural is
 * `<Face>`'s, exactly as for `<Clock>`: the needle is the shared `<Hand>`
 * built through the shared `handSlot`, so the two components cannot drift
 * apart about how a value becomes a rotation. What is genuinely a gauge's own
 * is here and only here — the arc layer, the readout, and `role="meter"`.
 *
 * The arc layer is the shared `<Arc>` part now: track, redline and sweep fill
 * are three arcs on the face's one embedded `<svg>`, and nothing about paths
 * or view boxes is written here any more. What stays is the gauge's own — how
 * a reading becomes a dash offset, and that the offset GLIDES.
 *
 * **Circle-only, by design.** `<Gauge>` states no `shape` prop, and the shape
 * task deliberately left it that way: the sweep fill's `pathLength`/dash
 * technique equates ANGLE with ARC LENGTH — true on a circle, false on every
 * other outline — so a rect gauge's fill would run fast on the flats and slow
 * around the corners while its needle read correctly. A shaped gauge needs a
 * different fill primitive before it can exist; until someone builds one,
 * the face stays round.
 */
import { type ComponentProps, type ReactNode, type RefObject, useEffect, useRef } from "react"
import { isSource, quantize, type Scale, type Source } from "../core"
import { Arc } from "./arc"
import { Complication } from "./complication"
import { useFaceContext } from "./context"
import { composes, Face, type FaceSlot, handSlot, partSlot, usePrefersReducedMotion } from "./face"
import { Cap, Dial, Hand, STEP_EASE, Ticks } from "./parts"

/** The arc layer's geometry, in dial units. Private: sizing is CSS. */
const TRACK_INSET = 10
const NEEDLE_TRACK_WIDTH = 3
const SWEEP_TRACK_WIDTH = 11

/**
 * The graduation ring, in dial units and marks. Sits just inside the track
 * stroke (whose inner edge is `TRACK_INSET + NEEDLE_TRACK_WIDTH / 2`), and the
 * majors stop a unit short of the needle's own tip.
 *
 * **Twenty-one marks, majors every fourth** — the spike's answer, spec §12,
 * kept as a constant rather than derived from `min`/`max`: a gauge prints no
 * numbers beside its graduations, so nothing about the ring wants the domain's
 * round numbers. It wants a ring the eye can count, and 21/4 is the one that
 * read best. A domain-derived count is the change to make the day the ring
 * carries labels.
 */
const GRAD_INSET = 12
const GRAD_COUNT = 21
const GRAD_MAJOR_EVERY = 4
const GRAD_MINOR_LENGTH = 4.5
const GRAD_MINOR_WIDTH = 1.4
const GRAD_MAJOR_LENGTH = 8
const GRAD_MAJOR_WIDTH = 2.2

/**
 * The dash scale the sweep fill is expressed in. `pathLength` re-declares a
 * path's length as this many units, so the fill's offset is hundredths of the
 * sweep on any outline — no `getTotalLength()`, and therefore no DOM read on
 * a path that has to render identically on the server.
 */
const SWEEP_UNITS = 100

export type GaugeProps = {
  /** The reading. A number is controlled; a `Source` is live (zero renders per update). */
  value: number | Source<number>
  /** Domain minimum. Beats `value.domain`, which beats 0. @default 0 */
  min?: number
  /** Domain maximum. Beats `value.domain`, which beats 100. @default 100 */
  max?: number
  /** Angular span in degrees, its gap centred at 6 o'clock. @default 270 */
  sweep?: number
  /** Domain span drawn as the warning band on the arc layer. */
  redline?: [number, number]
  /**
   * How the value reads. `"hand"` is the needle; `"sweep"` fills the arc from
   * the minimum to the value — the progress-ring mode. @default "hand"
   */
  indicator?: "hand" | "sweep"
  /**
   * The bare-mode readout under the pivot. A function formats; `false` hides
   * it; a composed `<Complication>` supersedes it entirely (spec §6) — the
   * consumer's content becomes the reading's presentation.
   * @default the rounded value
   */
  format?: false | ((value: number) => string)
  /** One CSS color; the whole palette derives from it in CSS. @default the inherited `currentColor` */
  color?: string
  /** Accessible name, e.g. `"Speed"` — the meter's name. @default "Gauge" */
  label?: string
  /** Full structure, zero default paint; slots own everything. @default false */
  unstyled?: boolean
  className?: string
  /** Slots: a part here replaces its default, keeping the gauge's own reading. */
  children?: ReactNode
} & Omit<
  ComponentProps<"div">,
  "children" | "className" | "aria-label" | "aria-valuemin" | "aria-valuemax" | "aria-valuenow"
>

/** The default readout: the number, rounded. */
function roundedFormat(value: number): string {
  return String(Math.round(value))
}

/**
 * The grid `aria-valuenow` is reported on: about a hundred graduations across
 * the span, snapped to a power of ten so the reported numbers read as numbers.
 *
 * A glide source notifies ~60×/s, but a value rounded to this grid changes
 * about once per graduation, and the live write below skips whenever the
 * reported text is unchanged. Finer graduations would only churn the
 * accessibility tree at animation cadence — no assistive technology resolves a
 * meter beyond roughly one part in a hundred.
 */
function meterStep(min: number, max: number): number {
  const span = Math.abs(max - min)
  if (span === 0) return 1
  return 10 ** Math.round(Math.log10(span / 100))
}

/**
 * The reported value: snapped to the meter grid and **clamped into
 * `[min, max]`**.
 *
 * The clamp is not decoration. `aria-valuenow` outside its own declared bounds
 * is an ARIA violation, and it is exactly what an over-range reading produces
 * — a gauge pinned past its redline, a source that overshoots, a snap that
 * rounds the last graduation outward. One function, both writers: the render
 * path below and the ref path that keeps a live meter fresh call this, so a
 * clamped attribute cannot become an unclamped one halfway through a session.
 */
function meterValue(value: number, min: number, max: number, step: number): number {
  const snapped = Math.round(value / step) * step
  return quantize(Math.min(Math.max(snapped, min), max))
}

/**
 * The reading as a dash offset over the fixed full-sweep path.
 *
 * **CSS cannot interpolate `d`.** Redrawing the arc per value is what a naive
 * "animate the fill" reaches for, and it produces a hard cut every time. So
 * the fill's path never changes: it is the whole sweep, declared
 * `pathLength={SWEEP_UNITS}` so the dash pattern is expressed in hundredths of
 * it whatever the outline's real length is, and the reading is how much of
 * that pattern is scrolled into view — a plain number, which a transition
 * *can* interpolate. Clamped, because a fill cannot overfill the way an
 * over-range needle can legitimately pin past its stop.
 *
 * Quantised, and this one is load-bearing: the live writer below puts this
 * number straight into a style, where the render path's rounding cannot reach
 * it. Both writers call this function, so neither can round differently.
 */
function sweepOffset(value: number, min: number, max: number): number {
  const span = max - min
  const fraction = span === 0 ? 0 : (value - min) / span
  return quantize(SWEEP_UNITS * (1 - Math.min(Math.max(fraction, 0), 1)))
}

/**
 * The live sweep fill's wiring — and **no element at all**.
 *
 * The fill itself is an ordinary `<Arc>`, which the face's layer host lifts
 * into the shared `<svg>`. That lift can only see elements, never what a
 * component returns, so the arc has to stay written in `<Gauge>`'s own
 * markup — which leaves the ref writing homeless, because `<Gauge>` renders
 * *outside* `<Mainplate>` and cannot read `registerLive` from the face
 * context. This renders null and does that one job from inside, so a
 * scrolled-away gauge still lets go of its source.
 *
 * The mechanism is a hand's, exactly: a ref write outside React, and an
 * unsubscribe while the face is offscreen. One style number per update, rather
 * than a rebuilt polyline.
 */
function SweepFill({
  node,
  source,
  min,
  max,
}: {
  node: RefObject<SVGPathElement | null>
  source: Source<number>
  min: number
  max: number
}) {
  const { registerLive } = useFaceContext()
  const { subscribe, get } = source
  useEffect(() => {
    const bind = () => {
      const write = () => {
        const el = node.current
        if (el === null) return
        el.style.strokeDashoffset = String(sweepOffset(get(), min, max))
      }
      write()
      return subscribe(write)
    }
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
  }, [subscribe, get, min, max, node, registerLive])
  return null
}

/**
 * The graduations: two stacked `<Ticks>` tracks bounded to the gauge's own
 * sweep — the composable tick part doing tier-1 work, with no gauge-specific
 * mark code anywhere. The minor track carves a hole every fourth position and
 * the major track stands in it, which is the clock's minute+hour layout with
 * different numbers.
 *
 * The prominent track says `emphasis="major"` — the ramp comes with the word,
 * `unstyled` is the part's own business through the face context, and the
 * gauge's ring geometry stays its own: the explicit `length`/`width` beat the
 * preset, which is the override rule working in the direction it was built for.
 */
function Graduations({ scale }: { scale: Scale }) {
  const range = { startAngle: scale.startAngle, sweepAngle: scale.sweepAngle }
  return (
    <>
      <Ticks
        count={GRAD_COUNT}
        skip={(value) => value % GRAD_MAJOR_EVERY === 0}
        inset={GRAD_INSET}
        length={GRAD_MINOR_LENGTH}
        width={GRAD_MINOR_WIDTH}
        {...range}
      />
      <Ticks
        count={(GRAD_COUNT - 1) / GRAD_MAJOR_EVERY + 1}
        emphasis="major"
        inset={GRAD_INSET}
        length={GRAD_MAJOR_LENGTH}
        width={GRAD_MAJOR_WIDTH}
        {...range}
      />
    </>
  )
}

/**
 * The bare-mode readout. Live values arrive through the ref the gauge already
 * holds for the meter's value — one subscription serving both, so the number a
 * sighted viewer reads and the number a screen reader announces are the same
 * read of the same source.
 */
function Readout({
  text,
  indicator,
  unstyled,
  nodeRef,
}: {
  text: string
  indicator: NonNullable<GaugeProps["indicator"]>
  unstyled: boolean
  nodeRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        // Centred in sweep mode; in needle mode it drops into the gap at the
        // bottom of the sweep, which is the one part of the face no needle
        // ever crosses — the centre there belongs to the cap.
        top: indicator === "sweep" ? "50%" : "70%",
        transform: "translate(-50%, -50%)",
        fontSize: indicator === "sweep" ? "20cqw" : "13cqw",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        ...(unstyled ? undefined : { fontWeight: 600, color: "var(--mp-ink)" }),
      }}
      ref={nodeRef}
      data-mp="readout"
    >
      {text}
    </div>
  )
}

/**
 * A gauge. Controlled with a number — changes glide to the new reading, and
 * fall back to instant under `prefers-reduced-motion` — or live with a
 * `Source`, which drives its own motion at zero renders.
 *
 * `role="meter"` with clamped bounds is the accessible surface; the reading is
 * served on the ref path, never announced (§14.1 forbids `aria-live` here).
 */
export function Gauge({
  value,
  min,
  max,
  sweep = 270,
  redline,
  indicator = "hand",
  format = roundedFormat,
  label = "Gauge",
  unstyled = false,
  children,
  ...root
}: GaugeProps) {
  const source = isSource(value) ? (value as Source<number>) : null
  const controlled = typeof value === "number" ? value : null

  // §8.10 precedence, prop > `value.domain` > default — the same rule `<Hand>`
  // resolves by, restated here because the meter's bounds and the dial's
  // printed scale must be the same two numbers.
  const domainMin = min ?? source?.domain?.min ?? 0
  const domainMax = max ?? source?.domain?.max ?? 100
  // The gap is centred at 6 o'clock: a 270° sweep runs -135° to +135°.
  const scale: Scale = {
    min: domainMin,
    max: domainMax,
    startAngle: -sweep / 2,
    sweepAngle: sweep,
  }
  const step = meterStep(domainMin, domainMax)

  // Controlled values animate; a `Source` is already smooth and a viewer who
  // reduced motion gets neither. `tick` is both halves of the stepping hand —
  // the transition and the shortest-path unwrapping — and the second is what
  // keeps a needle from swinging the long way round a wide sweep.
  const reduced = usePrefersReducedMotion()
  const animate = source === null && !reduced

  const rootNode = useRef<HTMLDivElement | null>(null)
  const readoutNode = useRef<HTMLDivElement | null>(null)
  // The sweep fill's element, handed to the arc that renders it and to the
  // binder that writes its dash offset — one node, two collaborators.
  const fillNode = useRef<SVGPathElement | null>(null)
  const subscribe = source === null ? null : source.subscribe
  const get = source === null ? null : source.get

  useEffect(() => {
    if (subscribe === null || get === null) return
    const write = () => {
      const v = get()
      const root = rootNode.current
      if (root !== null) {
        const now = String(meterValue(v, domainMin, domainMax, step))
        if (root.getAttribute("aria-valuenow") !== now) root.setAttribute("aria-valuenow", now)
      }
      const readout = readoutNode.current
      if (readout !== null && format !== false) {
        const text = format(v)
        if (readout.textContent !== text) readout.textContent = text
      }
    }
    // Written once on subscription, not only on change: a value that moved
    // between render and effect would otherwise never be reported. This one
    // deliberately does NOT pause offscreen — a screen reader can query a
    // meter that is nowhere near the viewport, and a frozen `aria-valuenow`
    // is a confident lie where a live one costs one attribute write.
    write()
    return subscribe(write)
  }, [subscribe, get, domainMin, domainMax, step, format])

  const slots: FaceSlot[] = []
  if (indicator === "hand") slots.push(partSlot("dial", <Dial />))

  // The arc layer, as three `<Arc>`s: the composable part doing tier-1 work,
  // with no path code left in this file. They are written HERE, as elements,
  // rather than wrapped in a component of their own — the layer host lifts
  // elements it can see, and a component boundary would hide them and cost
  // the face a second `<svg>`.
  const arcWidth = indicator === "sweep" ? SWEEP_TRACK_WIDTH : NEEDLE_TRACK_WIDTH
  const band = {
    min: domainMin,
    max: domainMax,
    startAngle: scale.startAngle,
    sweepAngle: scale.sweepAngle,
    inset: TRACK_INSET,
    width: arcWidth,
  }
  // The gauge's flavor, gated by `unstyled` here rather than inside the part:
  // the arc's own default is the tick ink, which is exactly what the track
  // wants, and the other two say what they are.
  const stroke = (paint: string) => (unstyled ? undefined : paint)
  slots.push({
    key: "arcs",
    wiring: {},
    claims: () => false,
    node: (
      <>
        <Arc key="track" from={domainMin} to={domainMax} {...band} data-mp="track" />
        {redline === undefined ? null : (
          <Arc
            key="redline"
            from={redline[0]}
            to={redline[1]}
            {...band}
            stroke={stroke("var(--mp-warning)")}
            data-mp="redline"
          />
        )}
        {indicator !== "sweep" ? null : (
          <Arc
            key="sweep"
            // The path is the whole sweep and never moves; only the dash does.
            from={domainMin}
            to={domainMax}
            {...band}
            stroke={stroke("var(--mp-accent)")}
            pathLength={SWEEP_UNITS}
            strokeDasharray={SWEEP_UNITS}
            style={{
              // A live fill renders fully hidden and is written on mount: no
              // reading of a `Source` reaches server HTML, here or anywhere.
              strokeDashoffset:
                controlled === null ? SWEEP_UNITS : sweepOffset(controlled, domainMin, domainMax),
              // Armed for controlled values only. A per-frame ref write must
              // never be chasing a 180ms transition it re-triggers every frame.
              ...(animate ? { transition: `stroke-dashoffset ${STEP_EASE}` } : undefined),
            }}
            ref={fillNode}
            data-mp="sweep"
          />
        )}
        {indicator !== "sweep" || source === null ? null : (
          <SweepFill
            key="sweep-live"
            node={fillNode}
            source={source}
            min={domainMin}
            max={domainMax}
          />
        )}
      </>
    ),
  })
  if (indicator === "hand") {
    slots.push({
      key: "ticks",
      // The gauge keeps the angular range, exactly as it keeps the needle's
      // domain: a replacement track decides how the marks look and how many
      // there are, never which arc they sit on. Both default tracks go at
      // once — one `<Ticks>` child is one tick track, whatever it replaces.
      wiring: { startAngle: scale.startAngle, sweepAngle: scale.sweepAngle },
      claims: (el) => el.type === Ticks,
      node: <Graduations scale={scale} />,
    })
    slots.push(
      handSlot(
        "hand",
        {
          value,
          min: domainMin,
          max: domainMax,
          startAngle: scale.startAngle,
          sweepAngle: scale.sweepAngle,
          tick: animate,
          long: true,
        },
        // The gauge's flavor, and the whole of it: the needle is the face's
        // one accent — the clock spends that red on its seconds hand, a gauge
        // spends it on the reading — so the pivot cover underneath goes to
        // ink. Defaults, not wiring: a slot child replaces them outright.
        { variant: "taper", style: unstyled ? undefined : { background: "var(--mp-accent)" } },
      ),
      partSlot(
        "cap",
        <Cap style={unstyled ? undefined : { background: "var(--mp-ink)" }} />,
        "top",
      ),
    )
  }
  // Spec §6: the readout is the BARE-mode reading — a composed Complication
  // supersedes it, wherever the consumer put one. ANY Complication, not only
  // a central one, per the spec's wording: composing content hands the
  // reading's presentation to the consumer outright, and a position test
  // would quietly double-print at "center" the moment it mis-measured.
  // `format={false}` still hides the readout with nothing composed.
  if (format !== false && !composes(children, Complication)) {
    slots.push({
      key: "readout",
      wiring: {},
      claims: () => false,
      node: (
        <Readout
          // A live readout renders empty and is filled on mount, for the same
          // reason the meter's value is: no reading in server HTML.
          text={controlled === null ? "" : format(controlled)}
          indicator={indicator}
          unstyled={unstyled}
          nodeRef={readoutNode}
        />
      ),
    })
  }

  return (
    <Face
      slots={slots}
      label={label}
      unstyled={unstyled}
      {...root}
      // After the spread, exactly as `<Mainplate>` re-affirms its own role and
      // label: the root spread is how `id`, `data-*` and handlers reach the
      // div, and it must not be a way to demote a reading back to a picture.
      role="meter"
      aria-valuemin={quantize(domainMin)}
      aria-valuemax={quantize(domainMax)}
      // Omitted for a `Source`: the server has no business reporting a live
      // reading, and a client-only attribute is a hydration mismatch. The
      // effect above writes it after mount instead — the deferred meter item,
      // settled here.
      {...(controlled === null
        ? null
        : { "aria-valuenow": meterValue(controlled, domainMin, domainMax, step) })}
      ref={rootNode}
    >
      {children}
    </Face>
  )
}

/** The slots, namespaced for discovery: `<Gauge.Hand className="…"/>`. */
Gauge.Dial = Dial
Gauge.Ticks = Ticks
Gauge.Hand = Hand
Gauge.Cap = Cap
// Not slots — always free children — but discovered the same way (spec §2).
// An `<Arc>` added here joins the gauge's own three on the one shared layer.
Gauge.Arc = Arc
Gauge.Complication = Complication
