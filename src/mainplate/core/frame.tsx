"use client"

/**
 * The frame: the angular coordinate system, and the root that establishes it.
 * May import: geometry, outline. Must not import: time/.
 */
import { createContext, type ReactNode, type SVGProps, use, useId, useMemo } from "react"
import {
  angleToValue,
  type Degrees,
  DIAL_RADIUS,
  type DialUnits,
  type DomainValue,
  polar,
  type Scale,
  valueToAngle,
} from "./geometry"
import { type Outline, type OutlineSpec, resolveOutline } from "./outline"

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
  children,
  style,
  ...rest
}: MainplateProps) {
  // The one default that cannot be a default parameter: it depends on another
  // prop. Clipping makes the space outside the outline undrawable, so a clipped
  // face reserves none of it and the viewBox hugs the outline; an unclipped one
  // keeps the 10 units that numerals and an overhanging hand need.
  const padding = explicitPadding ?? (clip ? 0 : 10)

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

  const box = resolvedOutline.bbox()
  const viewBox = [
    box.x - padding,
    box.y - padding,
    box.width + padding * 2,
    box.height + padding * 2,
  ].join(" ")

  const aspect = (box.height + padding * 2) / (box.width + padding * 2)
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
      data-mp="mainplate"
      xmlns="http://www.w3.org/2000/svg"
      {...sized}
      {...rest}
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
