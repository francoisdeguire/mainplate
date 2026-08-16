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
 * The arc layer is INTERNAL at this stage, built straight on the engine's
 * `arcPath`; the public `<Arc>` part arrives with the arc task and absorbs it.
 */
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from "react"
import {
  arcPath,
  frameBox,
  isSource,
  quantize,
  type Scale,
  type Source,
  valueToAngle,
} from "../core"
import { Face, type FaceSlot, handSlot, partSlot, usePrefersReducedMotion } from "./face"
import { useFaceContext } from "./mainplate"
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
  /** The readout under the pivot. A function formats; `false` hides it. @default the rounded value */
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
 * Track, redline and sweep fill: three strokes on one `<svg>` sized to the
 * face box, because a stroke is the one thing HTML cannot draw. Every path
 * comes from the engine's `arcPath`, on the face's own outline, so this layer
 * is already shape-correct for the rect faces the shape task turns on.
 */
function GaugeArcs({
  scale,
  redline,
  indicator,
  source,
  controlled,
  animate,
  unstyled,
}: {
  scale: Scale
  redline: [number, number] | undefined
  indicator: NonNullable<GaugeProps["indicator"]>
  source: Source<number> | null
  /** The controlled reading, or `null` when a `Source` owns it. */
  controlled: number | null
  /** Glide the fill to a new controlled reading. Never set on the live path. */
  animate: boolean
  unstyled: boolean
}) {
  const { outline, registerLive } = useFaceContext()
  const box = frameBox({ outline, clip: false })
  const width = indicator === "sweep" ? SWEEP_TRACK_WIDTH : NEEDLE_TRACK_WIDTH
  const end = scale.startAngle + scale.sweepAngle
  const arc = useCallback(
    (from: number, to: number) =>
      arcPath(outline, from, to, undefined, TRACK_INSET, "center", width),
    [outline, width],
  )

  /**
   * The reading as a dash offset over the fixed full-sweep path.
   *
   * **CSS cannot interpolate `d`.** Redrawing the arc per value is what a
   * naive "animate the fill" reaches for, and it produces a hard cut every
   * time. So the fill's path never changes: it is the whole sweep, declared
   * `pathLength={SWEEP_UNITS}` so the dash pattern is expressed in hundredths
   * of it whatever the outline's real length is, and the reading is how much
   * of that pattern is scrolled into view — a plain number, which a transition
   * *can* interpolate. Clamped, because a fill cannot overfill the way an
   * over-range needle can legitimately pin past its stop.
   */
  const offsetFor = useCallback(
    (v: number) => {
      const span = scale.max - scale.min
      const fraction = span === 0 ? 0 : (v - scale.min) / span
      return quantize(SWEEP_UNITS * (1 - Math.min(Math.max(fraction, 0), 1)))
    },
    [scale],
  )

  // The live fill rides the same mechanism a hand's rotation does: a ref write
  // outside React, and — through the face's own registry — an unsubscribe
  // while the face is offscreen. In sweep mode this is the only live part on
  // the face, so without it a scrolled-away gauge would keep its engine warm.
  // One style number per update now, rather than a rebuilt polyline.
  const fill = useRef<SVGPathElement | null>(null)
  const subscribe = source === null ? null : source.subscribe
  const get = source === null ? null : source.get
  useEffect(() => {
    if (subscribe === null || get === null || indicator !== "sweep") return
    const bind = () => {
      const write = () => {
        const node = fill.current
        if (node === null) return
        node.style.strokeDashoffset = String(offsetFor(get()))
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
  }, [subscribe, get, indicator, offsetFor, registerLive])

  const stroke = (paint: string) => (unstyled ? undefined : paint)

  return (
    <svg
      viewBox={`${quantize(box.x)} ${quantize(box.y)} ${quantize(box.width)} ${quantize(box.height)}`}
      role="presentation"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      data-mp="arcs"
    >
      <path
        d={arc(scale.startAngle, end)}
        fill="none"
        stroke={stroke("var(--mp-tick)")}
        strokeWidth={width}
        strokeLinecap="round"
        data-mp="track"
      />
      {redline === undefined ? null : (
        <path
          d={arc(valueToAngle(redline[0], scale), valueToAngle(redline[1], scale))}
          fill="none"
          stroke={stroke("var(--mp-warning)")}
          strokeWidth={width}
          strokeLinecap="round"
          data-mp="redline"
        />
      )}
      {indicator !== "sweep" ? null : (
        <path
          // The path is the whole sweep and never moves; only the dash does.
          d={arc(scale.startAngle, end)}
          pathLength={SWEEP_UNITS}
          strokeDasharray={SWEEP_UNITS}
          style={{
            // A live fill renders fully hidden and is written on mount: no
            // reading of a `Source` reaches server HTML, here or anywhere.
            strokeDashoffset: controlled === null ? SWEEP_UNITS : offsetFor(controlled),
            // Armed for controlled values only. A per-frame ref write must
            // never be chasing a 180ms transition it re-triggers every frame.
            ...(animate ? { transition: `stroke-dashoffset ${STEP_EASE}` } : undefined),
          }}
          fill="none"
          stroke={stroke("var(--mp-accent)")}
          strokeWidth={width}
          strokeLinecap="round"
          ref={fill}
          data-mp="sweep"
        />
      )}
    </svg>
  )
}

/**
 * The graduations: two stacked `<Ticks>` tracks bounded to the gauge's own
 * sweep — the composable tick part doing tier-1 work, with no gauge-specific
 * mark code anywhere. The minor track carves a hole every fourth position and
 * the major track stands in it, which is the clock's minute+hour layout with
 * different numbers.
 *
 * The major ramp arrives as `style`, the way `<Gauge>` already dresses its
 * needle: the part's own default is the minor ink, and a face that wants the
 * prominent one says so. `unstyled` is therefore this caller's business too.
 */
function Graduations({ scale, unstyled }: { scale: Scale; unstyled: boolean }) {
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
        inset={GRAD_INSET}
        length={GRAD_MAJOR_LENGTH}
        width={GRAD_MAJOR_WIDTH}
        style={unstyled ? undefined : { background: "var(--mp-tick-major)" }}
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
  slots.push({
    key: "arcs",
    wiring: {},
    claims: () => false,
    node: (
      <GaugeArcs
        scale={scale}
        redline={redline}
        indicator={indicator}
        source={source}
        controlled={controlled}
        animate={animate}
        unstyled={unstyled}
      />
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
      node: <Graduations scale={scale} unstyled={unstyled} />,
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
      partSlot("cap", <Cap style={unstyled ? undefined : { background: "var(--mp-ink)" }} />, true),
    )
  }
  if (format !== false) {
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
