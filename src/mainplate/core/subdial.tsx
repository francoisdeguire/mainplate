"use client"

/**
 * `<Subdial>`: a small dial living inside a big one.
 * May import: at, frame, geometry, outline. Must not import: time/.
 *
 * The component itself is one transformed `<g>`; the point of it is the seam.
 * It provides a fresh `FrameContext` at the scaled origin, so every primitive
 * — `<Ticks>`, `<Dial>`, `<Place>`, a custom mark on `useFrame()` — renders
 * inside it unchanged, with no knowledge that it is in a subdial at all.
 */
import { createContext, type ReactNode, type SVGProps, use, useMemo } from "react"
import { type At, resolveAt } from "./at"
import { type Frame, FrameContext, useFrame } from "./frame"
import { type Degrees, DIAL_RADIUS, type DialUnits, type DomainValue, fmt } from "./geometry"
import { type OutlineSpec, resolveOutline } from "./outline"

/**
 * How many subdials deep the current subtree is; 0 at the root face.
 *
 * Its own context rather than a field on `Frame`, so depth stays an
 * implementation detail of the cap: a consumer reading `useFrame()` inside a
 * subdial must see a frame indistinguishable from a root one — that is the
 * invariant that lets every primitive work in here unchanged.
 */
const SubdialDepthContext = createContext(0)

/** Registers hold registers on real instruments; nothing holds a third. */
const MAX_DEPTH = 2

/**
 * Production errors already spoken, keyed by their whole message.
 *
 * The offending depth is interpolated into the message, so a three-deep and a
 * four-deep misuse each get a line of their own instead of collapsing into
 * one — while a face re-rendering sixty times a second still says each once.
 */
const warned = new Set<string>()

/**
 * The production half of the depth cap: degrading beats taking down a
 * dashboard route, but degrading in silence is the failure class the cap
 * exists to catch. Dev never reaches this — it throws instead.
 */
function warnTooDeep(message: string) {
  if (warned.has(message)) return
  warned.add(message)
  console.error(message)
}

/**
 * Props for {@link Subdial}: a radius in the parent's units, a position, its
 * own scale and outline, and any SVG prop a `<g>` takes.
 *
 * `r` is omitted from the `SVGProps` base because React types it as the SVG
 * geometry attribute (`number | string`), which would widen the one prop this
 * component cannot do without. `transform` is omitted because the transform
 * *is* the subdial — a caller's would silently replace both the position and
 * the scale. Wrap your own `<g>` inside instead.
 */
export type SubdialProps = Omit<SVGProps<SVGGElement>, "r" | "transform"> & {
  /**
   * The subdial's radius, in the *parent's* dial units — the one number that
   * sizes everything. Inside, dial-unit 100 means this radius again, so a
   * `<Ticks inset={0}>` child sits `r` parent units from the subdial centre.
   */
  r: DialUnits
  /**
   * Where the subdial's centre goes on the parent face: degrees, a clock
   * position, or a literal `[x, y]` in the parent's dial units.
   * @default the parent's centre
   */
  at?: At
  /**
   * How far the centre sits inward from the parent's outline, in the parent's
   * dial units. Outline-anchored, so it follows the parent's shape; ignored
   * when `at` is a literal point, which already says exactly where.
   * @default 0
   */
  inset?: DialUnits
  /**
   * The subdial's own shape. Deliberately not inherited from the parent — real
   * Tanks have round subdials in rectangular cases. @default "circle"
   */
  outline?: OutlineSpec
  /** @default 0 */
  min?: DomainValue
  /** @default 1 */
  max?: DomainValue
  /** @default 0 */
  startAngle?: Degrees
  /** @default 360 */
  sweepAngle?: Degrees
  /** Accessible name for the subdial group. Unnamed groups stay anonymous. */
  label?: string
  children?: ReactNode
}

/**
 * A dial inside a dial: a chronograph's running-seconds register, a power
 * reserve. It re-establishes the frame at a scaled origin, so every primitive
 * works inside it unchanged, with dial-unit 100 meaning the subdial's own
 * radius.
 *
 * The scaling is one SVG `scale(r / 100)` on the group, which means **stroke
 * widths scale with the subdial**: a tick or a hand drawn inside comes out
 * proportionally finer, exactly as it does on a real dial. That is the reason
 * the transform is a `scale` rather than every dial-unit value being divided
 * by hand — geometry and line weight shrink together, so artwork designed at
 * full size drops in unchanged.
 *
 * Nothing about the scale inherits: the domain resets to `0..1` over a full
 * clockwise turn and the outline to a circle unless the subdial says
 * otherwise. A `max={220}` speedometer must not leak its domain into a power
 * reserve that happens to live on it.
 */
export function Subdial({
  r,
  at,
  inset,
  outline,
  min = 0,
  max = 1,
  startAngle = 0,
  sweepAngle = 360,
  label,
  children,
  ...rest
}: SubdialProps) {
  const { frame: parent } = useFrame()
  const depth = use(SubdialDepthContext) + 1
  const resolvedOutline = useMemo(() => resolveOutline(outline), [outline])

  // A fresh frame at the nominal radius — this is what preserves the
  // dial-unit invariant. `cx`/`cy` are 0 because inside the transformed group
  // the origin *is* the subdial centre; the translation lives on the group.
  const frame = useMemo<Frame>(
    () => ({
      cx: 0,
      cy: 0,
      r: DIAL_RADIUS,
      min,
      max,
      startAngle,
      sweepAngle,
      outline: resolvedOutline,
    }),
    [min, max, startAngle, sweepAngle, resolvedOutline],
  )

  if (depth > MAX_DEPTH) {
    const received =
      `mainplate: <Subdial> is nested ${depth} levels deep, and two is the cap. A register ` +
      `may hold a register; at a third level the geometry is a few pixels wide and the ` +
      `nesting is almost always an accident of composition — a subdial rendered inside ` +
      `the wrong parent.`

    if (process.env.NODE_ENV !== "production") throw new Error(received)

    // Deliberately outside the guard: a depth cap must not take down a
    // production dashboard route, but degrading in silence is the failure
    // class the guard exists to catch.
    warnTooDeep(`${received} Rendering it anyway.`)
  }

  // An omitted `at` is the parent's centre — the tuple form, so it bypasses
  // the anchor exactly as an explicit `[0, 0]` would. The point comes back
  // quantised; `fmt` below quantises the scale the same way.
  const { point } = resolveAt(at ?? [0, 0], parent, { inset })

  return (
    <g
      data-mp="subdial"
      {...(label !== undefined && { role: "group", "aria-label": label })}
      {...rest}
      // After the spread, not before: the type already refuses a caller's
      // `transform`, and this is the second lock, for the untyped spread that
      // gets past it. Everything else a caller passes still wins.
      transform={`translate(${fmt(point.x)} ${fmt(point.y)}) scale(${fmt(r / DIAL_RADIUS)})`}
    >
      <SubdialDepthContext value={depth}>
        <FrameContext value={frame}>{children}</FrameContext>
      </SubdialDepthContext>
    </g>
  )
}
