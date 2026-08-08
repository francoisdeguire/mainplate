"use client"

/**
 * The frame: the angular coordinate system, and the root that establishes it.
 * May import: geometry, outline. Must not import: time/.
 */
import { createContext, type ReactNode, type SVGProps, use, useMemo } from "react"
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

const FrameContext = createContext<Frame | null>(null)

/** Props for {@link Mainplate}: the frame's scale, its outline, and any SVG prop. */
export type MainplateProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  /** Width in px. Omit for a fluid face that scales with its container. */
  size?: number
  /** Room reserved outside the outline, in dial units. @default 10 */
  padding?: DialUnits
  /**
   * The face's shape, as a name, a descriptor, or an `Outline`. Prefer the
   * plain-data forms in a server component. @default "circle"
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
 * The root of a face: an `<svg>` in dial units that establishes the frame every
 * primitive inside it reads from.
 */
export function Mainplate({
  size,
  padding = 10,
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
  const resolvedOutline = useMemo(() => resolveOutline(outline), [outline])

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
      <FrameContext value={frame}>{children}</FrameContext>
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
      "useFrame() must be used inside <Mainplate>. If you are building a custom mark, " +
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
