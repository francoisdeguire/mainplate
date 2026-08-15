"use client"

/**
 * The frame: the angular coordinate system, and the root that establishes it.
 * May import: geometry, layer, outline. Must not import: time/.
 */
import {
  createContext,
  type ReactNode,
  type SVGProps,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react"
import {
  angleToValue,
  type Degrees,
  DIAL_RADIUS,
  type DialUnits,
  type DomainValue,
  polar,
  quantize,
  type Scale,
  valueToAngle,
} from "./geometry"
import { frameBox, framePadding } from "./layer"
import { type Outline, type OutlineSpec, resolveOutline } from "./outline"
import { isSource, type Source } from "./source"

/**
 * The angular coordinate system a face establishes, plus its centre, nominal
 * radius and outline. Read it with `useFrame`.
 */
export type Frame = Scale & {
  cx: DialUnits
  cy: DialUnits
  r: DialUnits
  outline: Outline
}

/** Any primitive may override part of the frame's scale locally. */
export type ScaleOverride = Partial<Scale>

/**
 * The context `<Mainplate>` provides and `useFrame` reads.
 *
 * Exported for exactly one consumer: `<Subdial>`, whose whole job is to provide
 * this context again at a scaled origin so every primitive inside it works
 * unchanged. It is deliberately not re-exported from the barrel — `useFrame` is
 * the public way to read it, and `<Mainplate>`/`<Subdial>` the ways to set it.
 */
export const FrameContext = createContext<Frame | null>(null)

/**
 * Props for {@link Mainplate}: the frame's scale, its outline, and any SVG prop.
 *
 * `clip` is omitted from the `SVGProps` base before being redeclared below.
 * React still types the deprecated SVG `clip` presentation attribute as
 * `number | string`, and intersecting that with a boolean gives `never` — the
 * prop would exist and be impossible to pass. The attribute it shadows was
 * removed from the spec and does nothing in any current browser.
 */
export type MainplateProps = Omit<SVGProps<SVGSVGElement>, "clip" | "viewBox"> & {
  /** Width in px. Omit for a fluid face that scales with its container. */
  size?: number
  /**
   * Room reserved outside the outline, in dial units — the viewBox grows by
   * this much on every side. It exists for the things that are allowed to live
   * out there: numerals set beyond the edge, a hand overhanging it.
   *
   * The default follows `clip`, because a fixed one would contradict it. With
   * clipping on nothing outside the outline can be drawn at all, so reserved
   * room is dead space and the viewBox hugs the outline instead; with clipping
   * off that room is usable, so it is there by default.
   *
   * An explicit value always wins, in both cases. Passing a padding while
   * clipping is on is legal — it insets the face within its own box — but it
   * warns in development, since nothing may be drawn in the space it buys.
   *
   * @default 0 when `clip` is true (the default), 10 when `clip` is false
   */
  padding?: DialUnits
  /**
   * Clip every child to the outline — `outline.path()` at inset 0, the same
   * shape the outline draws, not its bounding box. A real case and crystal cut
   * the dial off at the bezel and nothing escapes it; this is that.
   *
   * It decides what `padding` defaults to, since the two describe the same
   * region from opposite sides: numerals set beyond the edge and a hand
   * overhanging it are both legal, and both invisible while this is on, so a
   * clipped face reserves no room outside the outline unless you ask. Pass
   * `clip={false}` to let them show — padding then defaults to 10, and the
   * opt-out costs nothing else, as no group and no `<defs>` are emitted at
   * all.
   *
   * One thing to know before drawing on the boundary: a stroke centred on the
   * outline loses its outer half to the clip. Draw the bezel at a small inset,
   * or turn clipping off for that face. @default true
   */
  clip?: boolean
  /**
   * The face's shape, as a name, a descriptor, or an `Outline`. Prefer the
   * plain-data forms in a server component.
   *
   * Memoised on identity, not on contents: an object written inline —
   * `outline={{ kind: "rect", ratio: 0.78 }}` — is a new object on every parent
   * render, so it rebuilds the outline and invalidates the frame context every
   * time, re-rendering every primitive in the face. Hoist the descriptor to
   * module scope or wrap it in `useMemo`. The string forms (`"circle"`,
   * `"rect"`) are stable already and need neither. @default "circle"
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
  /** Accessible name. @default "Instrument face" */
  label?: string
  /**
   * Opt the face into `role="meter"` — the accessible value of a gauge
   * (§14.2). Without it the root stays one `role="img"`.
   *
   * A number is the controlled form. A `Source` keeps the accessible value
   * live the same way `<Hand>` keeps its rotation live: the root subscribes
   * and writes `aria-valuenow` / `aria-valuetext` through a ref, at zero
   * React renders — an accessible value frozen at first render is a screen
   * reader confidently announcing a stale number, worse than no value at
   * all. Bounds come from the source's `domain` when it declares one, else
   * from the frame's `min`/`max`. Typically the same source a `<Hand>` or
   * `<Arc>` inside the face draws.
   */
  value?: DomainValue | Source<number>
  /**
   * Formats `aria-valuetext` from the current value — `"88 km/h"`, `"10:09"`.
   *
   * This is where a clock's label helper plugs in: core cannot know what the
   * number means (§14.1, §16), so the reading's phrasing is the caller's, as
   * a function. Function-shaped props put the call site behind
   * `"use client"` — already true for any face driven by a `Source`. Pass a
   * stable function (a module-scope helper, not an inline closure): its
   * identity is a dependency of the live subscription, and a fresh closure
   * per render would churn it. Omitted, the meter speaks `aria-valuenow`
   * alone — a valuetext restating the number would only freeze its phrasing.
   */
  valueText?: (value: DomainValue) => string
  children?: ReactNode
}

/**
 * Dev warnings already spoken, keyed by their whole message.
 *
 * A face re-renders on every tick of its source — ten times a second on the
 * live gauge — and a warning repeated ten times a second is a warning nobody
 * reads. Keyed by the message rather than by a single flag, so a genuinely
 * different misconfiguration still gets said out loud once. Dev only: the
 * caller below never reaches this in production.
 */
const warned = new Set<string>()

/**
 * `clip` and `padding` pull against each other, and the loser is silent.
 *
 * `padding` reserves room outside the outline for the things allowed to live
 * there — numerals set beyond the edge, a hand overhanging it — and clipping
 * then cuts every one of them off. The face still renders, so nothing throws
 * and nothing looks broken; the marks simply are not there. Say so once.
 *
 * Only an explicit `padding` can reach here: the default is 0 while clipping,
 * so the combination is always something the caller asked for. A warning that
 * fired on the bare `<Mainplate />` would teach nothing except to ignore it.
 */
function warnClipHidesPadding(padding: DialUnits) {
  const message =
    `mainplate: <Mainplate clip padding={${padding}}> reserves ${padding} dial units outside ` +
    `the outline that clipping then makes unusable — anything drawn out there, such as ` +
    `numerals beyond the edge or a hand overhanging it, is cut off at the outline. Pass ` +
    `clip={false} to let content overhang, or drop the prop to take the clipped default of 0.`

  if (warned.has(message)) return
  warned.add(message)
  console.warn(message)
}

/**
 * The grid `aria-valuenow` is reported on: about a hundred graduations across
 * the span, snapped to a power of ten so the reported numbers read as numbers.
 *
 * This is how §14.2's "tick cadence, not rAF" is met without core/ knowing any
 * clock exists (§16): a glide source notifies ~60×/s, but a value rounded to
 * this grid changes about once per graduation, and the live write below is
 * skipped whenever the reported text is unchanged. Finer graduations would
 * only churn the accessibility tree at animation cadence — no assistive
 * technology resolves a meter beyond roughly one part in a hundred.
 */
function meterStep(min: DomainValue, max: DomainValue): number {
  const span = Math.abs(max - min)
  if (span === 0) return 1
  return 10 ** Math.round(Math.log10(span / 100))
}

/** The value `aria-valuenow` reports: on the meter grid, quantised for the DOM. */
function meterValue(value: DomainValue, step: number): number {
  return quantize(Math.round(value / step) * step)
}

/**
 * The root of a face: an `<svg>` in dial units that establishes the frame every
 * primitive inside it reads from.
 */
export function Mainplate({
  size,
  padding: explicitPadding,
  clip = true,
  outline,
  min = 0,
  max = 1,
  startAngle = 0,
  sweepAngle = 360,
  label = "Instrument face",
  value,
  valueText,
  children,
  style,
  ref,
  ...rest
}: MainplateProps) {
  // The one default that cannot be a default parameter: it depends on another
  // prop. It lives in `layer` alongside the box derivation that consumes it, so
  // that an HTML layer positioning itself against this face resolves the very
  // same number — see `framePadding`'s own note for why the number is what it
  // is. Read back here only for the warning below.
  const padding = framePadding(explicitPadding, clip)

  const resolvedOutline = useMemo(() => resolveOutline(outline), [outline])

  // Unconditional, as hooks must be, and per instance: two faces on one page
  // must not share a `<defs>` id, or the second silently clips to the first
  // one's outline — and a docs page renders many faces at once.
  //
  // `useId` and nothing else. A module counter breaks hydration, and a literal
  // breaks the second face. Its output has changed shape across React versions
  // — `:r0:`, `«r0»`, `_R_0_` — so `url(#…)` is the only way this reference is
  // ever written: all three delimiter styles resolve there, but the first two
  // are not valid in a bare `#id` CSS selector.
  const clipId = useId()

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

  const rootRef = useRef<SVGSVGElement | null>(null)
  // Two hands want the root node: the library, for the live ARIA writes
  // below, and the caller — `<Mainplate ref={clock.observe}>` is the
  // documented way to pause a clock offscreen. Merged rather than withheld
  // (contrast `<Arc>`, which owns its path node outright), so both get it.
  const composedRef = useCallback(
    (node: SVGSVGElement | null) => {
      rootRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref != null) ref.current = node
    },
    [ref],
  )

  // The runtime discriminator for the meter's value union — same shape as
  // `<Hand>`'s, and `null` when the face never opted in at all.
  let source: Source<number> | null = null
  let current: DomainValue | null = null
  if (isSource(value)) {
    source = value
    current = source.get()
  } else if (value !== undefined) {
    current = value
  }

  // The meter reports the value's own span: a watch frame runs 0–60 while an
  // hour24 source spans 0–24, and announcing "10.2 of 60" would be a lie. No
  // explicit-prop tier here, unlike §8.10 on `<Hand>` — the frame's `min`/`max`
  // are the dial's printed scale, which a domain-declaring source overrides.
  const domain = source === null ? undefined : source.domain
  const ariaMin = domain !== undefined ? domain.min : min
  const ariaMax = domain !== undefined ? domain.max : max
  const step = meterStep(ariaMin, ariaMax)

  // Detached so the effect's dependencies are the stable closures themselves,
  // exactly as on `<Hand>`: re-renders re-run nothing, swapping the source —
  // or dropping to a plain number, which nulls both — resubscribes.
  const subscribe = source === null ? null : source.subscribe
  const get = source === null ? null : source.get

  useEffect(() => {
    if (subscribe === null || get === null) return
    const write = () => {
      // Null while unmounting: a notification arriving mid-teardown must not
      // touch a detached node.
      const node = rootRef.current
      if (node === null) return
      const v = get()
      // §14.2's ref path: the accessible value rides the same mechanism as a
      // hand's rotation, bypassing React entirely. Written only when the
      // reported text changes — the structural form of "tick cadence": a
      // glide source notifying every frame moves this string about once per
      // meter graduation, and an unchanged attribute is never rewritten.
      const now = String(meterValue(v, step))
      if (node.getAttribute("aria-valuenow") !== now) node.setAttribute("aria-valuenow", now)
      if (valueText !== undefined) {
        // The formatter sees the raw value — its own precision (whole km/h,
        // minutes on a clock) decides how often its text changes.
        const text = valueText(v)
        if (node.getAttribute("aria-valuetext") !== text) node.setAttribute("aria-valuetext", text)
      }
    }
    // Written once on subscription, not only on change: a value that moved
    // between this render and this effect would otherwise never be reported.
    write()
    return subscribe(write)
  }, [subscribe, get, step, valueText])

  // §14.1 forbids aria-live in any form: the value is fresh when queried,
  // never announced — a clock speaking every minute is screen-reader spam.
  const meter =
    current === null
      ? null
      : ({
          role: "meter",
          "aria-valuemin": quantize(ariaMin),
          "aria-valuemax": quantize(ariaMax),
          "aria-valuenow": meterValue(current, step),
          ...(valueText === undefined ? null : { "aria-valuetext": valueText(current) }),
        } as const)

  // Shared with `dialPercent`, not recomputed: the two would drift the first
  // time either the bbox or the padding default changed, and a layer half a
  // padding out of register is the kind of bug nobody attributes to a default.
  const box = frameBox({ outline: resolvedOutline, padding: explicitPadding, clip })
  const viewBox = [box.x, box.y, box.width, box.height].join(" ")

  const aspect = box.height / box.width
  const sized =
    size === undefined
      ? { style: { width: "100%", height: "auto", ...style } }
      : { width: size, height: Math.round(size * aspect), style }

  if (process.env.NODE_ENV !== "production" && clip && padding > 0) warnClipHidesPadding(padding)

  // Opting out costs nothing in the DOM: no wrapper group, no empty `<defs>`.
  const body = clip ? (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={resolvedOutline.path()} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>{children}</g>
    </>
  ) : (
    children
  )

  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={label}
      {...meter}
      xmlns="http://www.w3.org/2000/svg"
      {...sized}
      {...rest}
      // After the spreads: the data-* exemption lets a spread smuggle
      // `data-mp` past the props type, so the second lock keeps the one
      // attribute the library guarantees — still a compile-time static.
      data-mp="mainplate"
      ref={composedRef}
    >
      <FrameContext value={frame}>{body}</FrameContext>
    </svg>
  )
}

/**
 * Read the current frame and its value-to-angle mapping.
 *
 * This is public API, not an internal: a component you write yourself is a
 * first-class citizen of the coordinate system.
 */
export function useFrame() {
  const frame = use(FrameContext)
  if (!frame) {
    throw new Error(
      "mainplate: useFrame() must be used inside <Mainplate>. If you are building a custom mark, " +
        "render it as a child of <Mainplate> or <Subdial>.",
    )
  }

  return useMemo(
    () => ({
      frame,
      angleFor: (value: DomainValue, override?: ScaleOverride): Degrees =>
        valueToAngle(value, { ...frame, ...override }),
      valueFor: (angle: Degrees, override?: ScaleOverride): DomainValue =>
        angleToValue(angle, { ...frame, ...override }),
      polar,
    }),
    [frame],
  )
}

/** The current outline. Answers edge questions; `useFrame` answers angle questions. */
export function useOutline(): Outline {
  return useFrame().frame.outline
}
