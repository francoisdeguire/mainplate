"use client"

/**
 * Tier-1 spike — a disposable implementation of the simple-layer direction
 * (.planning/simple-layer-direction.md), built to answer its open questions
 * with eyes: palette ramps, shape-in-HTML, hand variants, inscriptions, the
 * sweep indicator. Nothing here is Plan 5 code; it is the drawing board.
 *
 * Scratch. Plan 4 deletes `www/app/lab` entirely.
 */

import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { circleOutline, type Outline, rectOutline, type Source } from "@/mainplate/core"
import { useWatchSource } from "@/mainplate/time"

/* ---------------------------------------------------------------- geometry */

const PADDING = 10
const q = (n: number) => Math.round(n * 1000) / 1000

type Shape = "circle" | "rect" | { ratio?: number; radius?: number }

type FaceGeometry = {
  outline: Outline
  /** dial units → cqw units (1cqw = 1% of container width) */
  cq: (u: number) => number
  /** dial point → left/top percentages of the face box */
  pct: (p: { x: number; y: number }) => { left: string; top: string }
  boxW: number
  boxH: number
  accent: string
  ink: string
}

const FaceCtx = createContext<FaceGeometry | null>(null)
const useFace = () => {
  const ctx = useContext(FaceCtx)
  if (ctx === null) throw new Error("spike: face part used outside <Face>")
  return ctx
}

function resolveShape(shape: Shape): Outline {
  if (shape === "circle") return circleOutline()
  if (shape === "rect") return rectOutline({ ratio: 0.82, radius: 24 })
  return rectOutline({ ratio: shape.ratio ?? 0.82, radius: shape.radius ?? 24 })
}

/** Rotation (deg) that points a vertical element's top along `outward`. */
const outwardRotation = (o: { x: number; y: number }) => (Math.atan2(o.x, -o.y) * 180) / Math.PI

/* ----------------------------------------------------------------- palette */

/**
 * One color in, whole face out — alpha ramps off the ink so the same scheme
 * works on light and dark grounds, accent boosted through relative color
 * syntax when a color is given, warm red when not.
 */
function paletteVars(color: string | undefined): CSSProperties {
  const ink = color ?? "currentColor"
  const accent =
    color === undefined ? "oklch(0.62 0.19 27)" : `oklch(from ${color} 0.62 calc(c * 1.2 + 0.06) h)`
  return {
    "--mp-ink": ink,
    "--mp-accent": accent,
    "--mp-dial": `oklch(from ${ink} l c h / 0.05)`,
    "--mp-tick": `oklch(from ${ink} l c h / 0.32)`,
    "--mp-tick-major": `oklch(from ${ink} l c h / 0.78)`,
    "--mp-numeral": `oklch(from ${ink} l c h / 0.72)`,
  } as CSSProperties
}

/* -------------------------------------------------------------------- root */

function Face({
  shape = "circle",
  color,
  className,
  style,
  label,
  children,
  observe,
}: {
  shape?: Shape
  color?: string
  className?: string
  style?: CSSProperties
  label: string
  children: ReactNode
  observe?: (node: Element | null) => void
}) {
  const geo = useMemo<FaceGeometry>(() => {
    const outline = resolveShape(shape)
    const box = outline.bbox(-PADDING)
    const cq = (u: number) => q((u / box.width) * 100)
    const pct = (p: { x: number; y: number }) => ({
      left: `${q(((p.x - box.x) / box.width) * 100)}%`,
      top: `${q(((p.y - box.y) / box.height) * 100)}%`,
    })
    return {
      outline,
      cq,
      pct,
      boxW: box.width,
      boxH: box.height,
      accent: "var(--mp-accent)",
      ink: "var(--mp-ink)",
    }
  }, [shape])

  return (
    <FaceCtx.Provider value={geo}>
      <div
        ref={observe}
        role="img"
        aria-label={label}
        className={className}
        style={{
          position: "relative",
          containerType: "inline-size",
          aspectRatio: `${q(geo.boxW)} / ${q(geo.boxH)}`,
          ...paletteVars(color),
          ...style,
        }}
      >
        {children}
      </div>
    </FaceCtx.Provider>
  )
}

/* -------------------------------------------------------------------- dial */

function Dial({ className, style }: { className?: string; style?: CSSProperties }) {
  const { cq, boxW, boxH } = useFace()
  // The dial fills the outline at inset 0; for both spike shapes that is the
  // box minus padding, radius handled by border-radius (circle: 50%).
  const inset = cq(PADDING)
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: `${inset}cqw`,
        top: `${inset}cqw`,
        width: `${q(100 - 2 * inset)}cqw`,
        height: `${q(((boxH - 2 * PADDING) / boxW) * 100)}cqw`,
        borderRadius: boxW === boxH ? "50%" : `${cq(26)}cqw`,
        background: "var(--mp-dial)",
        ...style,
      }}
    />
  )
}

/* ------------------------------------------------------------------- ticks */

function Ticks({
  minors = true,
  majors = true,
  majorLength = 9,
  minorLength = 5,
  majorWidth = 2.4,
  minorWidth = 1,
  inset = 4,
  className,
  majorClassName,
}: {
  minors?: boolean
  majors?: boolean
  majorLength?: number
  minorLength?: number
  majorWidth?: number
  minorWidth?: number
  inset?: number
  className?: string
  majorClassName?: string
}) {
  const { outline, cq, pct } = useFace()
  const marks: ReactNode[] = []

  // Majors sit at angular positions so the hands point at them.
  if (majors) {
    for (let h = 0; h < 12; h++) {
      const angle = h * 30
      const p = outline.pointAt(angle, inset + majorLength / 2)
      const n = outline.normalAt(angle)
      const rot = outwardRotation({ x: -n.x, y: -n.y })
      marks.push(
        <div
          key={`M${h}`}
          className={majorClassName}
          style={{
            position: "absolute",
            ...pct(p),
            width: `${cq(majorWidth)}cqw`,
            height: `${cq(majorLength)}cqw`,
            borderRadius: 999,
            background: majorClassName === undefined ? "var(--mp-tick-major)" : undefined,
            transform: `translate(-50%, -50%) rotate(${q(rot)}deg)`,
          }}
        />,
      )
    }
  }

  // Minors divide the perimeter evenly — the chemin-de-fer rhythm.
  if (minors) {
    const L = outline.length(inset + minorLength / 2)
    const eps = L / 720
    for (let i = 0; i < 60; i++) {
      if (majors && i % 5 === 0) continue
      const s = (i / 60) * L
      const p = outline.pointAtLength(s, inset + minorLength / 2)
      const a = outline.pointAtLength(s - eps, inset + minorLength / 2)
      const b = outline.pointAtLength(s + eps, inset + minorLength / 2)
      // Outward normal from the local tangent (rotate it -90°: clockwise travel, y-down).
      const t = { x: b.x - a.x, y: b.y - a.y }
      const len = Math.hypot(t.x, t.y) || 1
      const o = { x: t.y / len, y: -t.x / len }
      marks.push(
        <div
          key={`m${i}`}
          className={className}
          style={{
            position: "absolute",
            ...pct(p),
            width: `${cq(minorWidth)}cqw`,
            height: `${cq(minorLength)}cqw`,
            borderRadius: 999,
            background: className === undefined ? "var(--mp-tick)" : undefined,
            transform: `translate(-50%, -50%) rotate(${q(outwardRotation(o))}deg)`,
          }}
        />,
      )
    }
  }

  return <>{marks}</>
}

/* ---------------------------------------------------------------- numerals */

function Numerals({
  variant = "arabic",
  inset = 20,
  fontSize = 15,
  className,
}: {
  variant?: "arabic" | "roman" | "quarters"
  inset?: number
  fontSize?: number
  className?: string
}) {
  const { outline, cq, pct } = useFace()
  const ROMAN = ["I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
  const hours = variant === "quarters" ? [12, 3, 6, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  return (
    <>
      {hours.map((h) => {
        const p = outline.pointAt(h * 30, inset)
        return (
          <div
            key={h}
            className={className}
            style={{
              position: "absolute",
              ...pct(p),
              transform: "translate(-50%, -50%)",
              fontSize: `${cq(fontSize)}cqw`,
              fontWeight: 600,
              color: className === undefined ? "var(--mp-numeral)" : undefined,
            }}
          >
            {variant === "roman" ? ROMAN[h - 1] : h}
          </div>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------- hands */

/**
 * Rotation binder — writes rotation through the ref, unwrapping to a
 * monotonic angle when a transition is animating the step (`tick` cadence),
 * so 354° → 0° never spins backwards. The spike's answer to the wrap finding.
 */
function useRotation(
  read: () => number,
  subscribe: ((cb: () => void) => () => void) | null,
  ref: RefObject<HTMLDivElement | null>,
  translate: string,
  unwrap: boolean,
) {
  const last = useRef<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const write = () => {
      let angle = read()
      if (unwrap) {
        const prev = last.current
        if (prev !== null) {
          let next = prev + ((((angle - prev) % 360) + 360) % 360)
          if (next - prev > 359) next = prev // same position, no lap
          angle = next
        }
        last.current = angle
      }
      el.style.transform = `${translate} rotate(${q(angle)}deg)`
    }
    write()
    return subscribe === null ? undefined : subscribe(write)
  }, [read, subscribe, ref, translate, unwrap])
}

type HandVariant = "bar" | "taper" | "line"

function Hand({
  source,
  value,
  max = 60,
  min = 0,
  startAngle = 0,
  sweepAngle = 360,
  length,
  tail = 12,
  width = 5,
  variant = "bar",
  tick = false,
  color = "var(--mp-ink)",
  className,
  shadow = true,
  children,
}: {
  source?: Source<number>
  value?: number
  max?: number
  min?: number
  startAngle?: number
  sweepAngle?: number
  length: number
  tail?: number
  width?: number
  variant?: HandVariant
  /** step once per unit with a transition (the wrap case) */
  tick?: boolean
  color?: string
  className?: string
  shadow?: boolean
  children?: ReactNode
}) {
  const { cq } = useFace()
  const ref = useRef<HTMLDivElement>(null)
  const total = length + tail
  const pivotPct = q((length / total) * 100)
  const translate = `translate(-50%, -${pivotPct}%)`

  const domainMin = source?.domain?.min ?? min
  const domainMax = source?.domain?.max ?? max
  const read = useMemo(() => {
    return () => {
      const v = source !== undefined ? source.get() : (value ?? 0)
      return startAngle + ((v - domainMin) / (domainMax - domainMin)) * sweepAngle
    }
  }, [source, value, domainMin, domainMax, startAngle, sweepAngle])
  const subscribe = useMemo(
    () => (source === undefined ? null : (cb: () => void) => source.subscribe(cb)),
    [source],
  )
  useRotation(read, subscribe, ref, translate, tick)

  const w = cq(width)
  const shape: CSSProperties =
    variant === "taper"
      ? { clipPath: "polygon(8% 100%, 92% 100%, 56% 0%, 44% 0%)" }
      : { borderRadius: 999 }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${variant === "line" ? cq(Math.min(width, 1.6)) : w}cqw`,
        height: `${cq(total)}cqw`,
        transformOrigin: `50% ${pivotPct}%`,
        transform: translate,
        transition: tick ? "transform 180ms cubic-bezier(0.23, 1, 0.32, 1)" : undefined,
        background: children === undefined ? color : undefined,
        filter: shadow ? `drop-shadow(0 ${cq(1.6)}cqw ${cq(3)}cqw rgb(0 0 0 / 0.28))` : undefined,
        ...(children === undefined ? shape : {}),
      }}
    >
      {children}
    </div>
  )
}

function Cap({ color = "var(--mp-accent)", r = 4.5 }: { color?: string; r?: number }) {
  const { cq } = useFace()
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${cq(r * 2)}cqw`,
        height: `${cq(r * 2)}cqw`,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        background: color,
        boxShadow: "0 1px 2px rgb(0 0 0 / 0.35)",
      }}
    />
  )
}

/* ----------------------------------------------------------- complications */

const CLOCK_AT: Record<string, number> = {
  "12h": 0,
  "1h": 30,
  "2h": 60,
  "3h": 90,
  "4h": 120,
  "5h": 150,
  "6h": 180,
  "7h": 210,
  "8h": 240,
  "9h": 270,
  "10h": 300,
  "11h": 330,
}

function Complication({
  at,
  inset = 30,
  children,
  className,
}: {
  at: keyof typeof CLOCK_AT | "center" | number
  inset?: number
  children: ReactNode
  className?: string
}) {
  const { outline, pct } = useFace()
  const p =
    at === "center"
      ? { x: 0, y: 0 }
      : outline.pointAt(typeof at === "number" ? at : (CLOCK_AT[at] ?? 0), inset)
  return (
    <div
      className={className}
      style={{ position: "absolute", ...pct(p), transform: "translate(-50%, -50%)" }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------- inscription */

function Inscription({
  at,
  inset = 20,
  fontSize = 7,
  tracking = 0.45,
  className,
  children,
}: {
  at: keyof typeof CLOCK_AT | number
  inset?: number
  fontSize?: number
  /** extra advance per character, in dial units */
  tracking?: number
  className?: string
  children: string
}) {
  const { outline, cq, pct } = useFace()
  const chars = [...children]
  const angle = typeof at === "number" ? at : (CLOCK_AT[at] ?? 0)
  // Bottom text flips to read outward — the SWISS MADE convention.
  const flipped = angle > 90 && angle < 270
  const L = outline.length(inset)
  const advance = fontSize * 0.62 + tracking
  const s0 = (angle / 360) * L
  const eps = L / 720

  return (
    <>
      {chars.map((ch, i) => {
        const offset = (i - (chars.length - 1) / 2) * advance
        const s = s0 + (flipped ? -offset : offset)
        const p = outline.pointAtLength(s, inset)
        const a = outline.pointAtLength(s - eps, inset)
        const b = outline.pointAtLength(s + eps, inset)
        const t = { x: b.x - a.x, y: b.y - a.y }
        const len = Math.hypot(t.x, t.y) || 1
        const o = { x: t.y / len, y: -t.x / len }
        const rot = outwardRotation(o) + (flipped ? 180 : 0)
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: characters repeat; position is identity here
            key={`${ch}${i}`}
            className={className}
            style={{
              position: "absolute",
              ...pct(p),
              transform: `translate(-50%, -50%) rotate(${q(rot)}deg)`,
              fontSize: `${cq(fontSize)}cqw`,
              letterSpacing: 0,
              color: className === undefined ? "var(--mp-numeral)" : undefined,
            }}
          >
            {ch}
          </span>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------- clock */

export function SpikeClock({
  color,
  time,
  second = "sweep",
  numerals = "arabic",
  ticks = "all",
  shape = "circle",
  label = "Analog clock",
  className,
  children,
}: {
  color?: string
  time?: Date
  second?: "sweep" | "tick" | "none"
  numerals?: "arabic" | "roman" | "quarters" | "none"
  ticks?: "all" | "quarters" | "none"
  shape?: Shape
  label?: string
  className?: string
  children?: ReactNode
}) {
  const clock = useWatchSource(second === "tick" ? { second: "tick" } : undefined)
  const fixed = useMemo(() => {
    if (time === undefined) return null
    const h = time.getHours() % 12
    const m = time.getMinutes()
    const s = time.getSeconds()
    return { hour: h + m / 60, minute: m + s / 60, second: s }
  }, [time])

  return (
    <Face
      shape={shape}
      color={color}
      className={className}
      label={label}
      observe={time === undefined ? clock.observe : undefined}
    >
      <Dial />
      {ticks !== "none" && (
        <Ticks minors={ticks === "all"} majorLength={shape === "circle" ? 9 : 10} />
      )}
      {numerals !== "none" && (
        <Numerals variant={numerals} inset={numerals === "roman" ? 21 : 22} />
      )}
      {children}
      {fixed !== null ? (
        <>
          <Hand
            value={fixed.hour}
            max={12}
            length={numerals === "none" ? 55 : 46}
            tail={12}
            width={6.5}
          />
          <Hand value={fixed.minute} length={numerals === "none" ? 80 : 68} tail={12} width={5} />
          {second !== "none" && (
            <Hand
              value={fixed.second}
              length={74}
              tail={22}
              width={1.6}
              variant="line"
              color="var(--mp-accent)"
            />
          )}
        </>
      ) : (
        <>
          <Hand source={clock.hour} length={46} tail={12} width={6.5} />
          <Hand source={clock.minute} length={68} tail={12} width={5} />
          {second !== "none" && (
            <Hand
              source={clock.second}
              tick={second === "tick"}
              length={numerals === "none" ? 86 : 74}
              tail={22}
              width={1.6}
              variant="line"
              color="var(--mp-accent)"
            />
          )}
        </>
      )}
      <Cap />
    </Face>
  )
}

/* ------------------------------------------------------------------- gauge */

function arcPath(r: number, a0: number, a1: number): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180
  const x = (a: number) => q(110 + r * Math.cos(rad(a)))
  const y = (a: number) => q(110 + r * Math.sin(rad(a)))
  const large = a1 - a0 > 180 ? 1 : 0
  return `M ${x(a0)} ${y(a0)} A ${q(r)} ${q(r)} 0 ${large} 1 ${x(a1)} ${y(a1)}`
}

/** Tapered band: thin at a0, full width at a1, outer edge fixed. */
function wedgePath(rOut: number, w: number, a0: number, a1: number): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180
  const px = (r: number, a: number) =>
    `${q(110 + r * Math.cos(rad(a)))} ${q(110 + r * Math.sin(rad(a)))}`
  const steps = 24
  const outer: string[] = []
  const inner: string[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    outer.push(px(rOut, a))
    inner.unshift(px(rOut - (w * i) / steps, a))
  }
  return `M ${outer[0]} L ${outer.join(" L ")} L ${inner.join(" L ")} Z`
}

function GaugeGraduations({ angles, majorsEvery }: { angles: number[]; majorsEvery: number }) {
  const { outline, cq, pct } = useFace()
  return (
    <>
      {angles.map((angle, i) => {
        const major = i % majorsEvery === 0
        const len = major ? 7 : 3.5
        const p = outline.pointAt(angle, 16 + (major ? 0 : 2) + len / 2)
        const n = outline.normalAt(angle)
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: angles are a static computed set
            key={i}
            style={{
              position: "absolute",
              ...pct(p),
              width: `${cq(major ? 2 : 1)}cqw`,
              height: `${cq(len)}cqw`,
              borderRadius: 999,
              background: major ? "var(--mp-tick-major)" : "var(--mp-tick)",
              transform: `translate(-50%, -50%) rotate(${q(outwardRotation({ x: -n.x, y: -n.y }))}deg)`,
            }}
          />
        )
      })}
    </>
  )
}

export function SpikeGauge({
  value,
  min = 0,
  max = 100,
  sweep = 270,
  redline,
  indicator = "hand",
  sweepVariant = "arc",
  format = (v: number) => `${Math.round(v)}`,
  unit,
  color,
  label,
  className,
  children,
}: {
  value: number | Source<number>
  min?: number
  max?: number
  sweep?: number
  redline?: [number, number]
  indicator?: "hand" | "sweep"
  sweepVariant?: "arc" | "wedge"
  format?: false | ((v: number) => string)
  unit?: string
  color?: string
  label?: string
  className?: string
  children?: ReactNode
}) {
  const start = -sweep / 2
  const toAngle = (v: number) => start + ((v - min) / (max - min)) * sweep
  const live = typeof value === "object"
  const current = live ? value.get() : value
  const fillRef = useRef<SVGPathElement>(null)

  // Live sweep: rewrite the fill path per update through a ref.
  useEffect(() => {
    if (!live || indicator !== "sweep") return
    const el = fillRef.current
    if (el === null) return
    const write = () => {
      const a = toAngle(value.get())
      el.setAttribute(
        "d",
        sweepVariant === "wedge" ? wedgePath(96, 12, start, a) : arcPath(90, start, a),
      )
    }
    write()
    return value.subscribe(write)
  })

  const gradAngles: number[] = []
  if (indicator === "hand") {
    for (let i = 0; i <= 20; i++) gradAngles.push(start + (sweep * i) / 20)
  }

  return (
    <Face shape="circle" color={color} className={className} label={label ?? "Gauge"}>
      {indicator === "hand" && <Dial />}
      {indicator === "hand" && <GaugeGraduations angles={gradAngles} majorsEvery={4} />}
      <svg
        viewBox="0 0 220 220"
        role="presentation"
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
        }}
      >
        <path
          d={arcPath(90, start, start + sweep)}
          fill="none"
          stroke="var(--mp-tick)"
          strokeWidth={indicator === "sweep" && sweepVariant === "arc" ? 10 : 3}
          strokeLinecap="round"
          opacity={0.5}
        />
        {redline !== undefined && (
          <path
            d={arcPath(90, toAngle(redline[0]), toAngle(redline[1]))}
            fill="none"
            stroke="var(--mp-accent)"
            strokeWidth={indicator === "sweep" ? 10 : 3}
            strokeLinecap="round"
          />
        )}
        {indicator === "sweep" &&
          (sweepVariant === "wedge" ? (
            <path
              ref={fillRef}
              d={wedgePath(96, 12, start, toAngle(current))}
              fill="var(--mp-accent)"
            />
          ) : (
            <path
              ref={fillRef}
              d={arcPath(90, start, toAngle(current))}
              fill="none"
              stroke="var(--mp-accent)"
              strokeWidth={10}
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 6px oklch(from var(--mp-accent) l c h / 0.45))" }}
            />
          ))}
      </svg>
      {indicator === "hand" && (
        <>
          <Hand
            source={live ? value : undefined}
            value={live ? undefined : current}
            min={min}
            max={max}
            startAngle={start}
            sweepAngle={sweep}
            length={72}
            tail={16}
            width={4}
            variant="taper"
            color="var(--mp-accent)"
          />
          <Cap color="var(--mp-ink)" r={4} />
        </>
      )}
      {format !== false && (
        <Complication at="center" inset={0}>
          <div
            style={{
              textAlign: "center",
              transform: indicator === "hand" ? "translateY(55%)" : undefined,
            }}
          >
            <div
              style={{
                fontSize: "14cqw",
                fontWeight: 650,
                fontVariantNumeric: "tabular-nums",
                color: "var(--mp-ink)",
              }}
            >
              {format(current)}
            </div>
            {unit !== undefined && (
              <div
                style={{
                  fontSize: "5cqw",
                  letterSpacing: "0.1em",
                  opacity: 0.55,
                  color: "var(--mp-ink)",
                }}
              >
                {unit}
              </div>
            )}
          </div>
        </Complication>
      )}
      {children}
    </Face>
  )
}

export { Complication as SpikeComplication, Hand as SpikeHand, Inscription as SpikeInscription }
