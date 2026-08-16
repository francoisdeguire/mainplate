"use client"

/**
 * `<Dial>`: the dial surface.
 * May import: geometry, frame, outline. Must not import: time/.
 */
import type { SVGProps } from "react"
import type { DialUnits } from "../core/geometry"
import { useOutline } from "./frame"

/**
 * Props for {@link Dial}: an inset, and any SVG prop a `<path>` takes — minus
 * the three the primitive owns.
 *
 * `d` is the outline's, not the caller's; that is the entire point of the
 * component. `stroke` and `strokeWidth` are absent because `<Dial>` is
 * fill-only (§11.1): a stroked ring at an inset *is* a full-sweep `<Arc>`, and
 * two ways to draw a bezel is one too many. The `?: never` makes that a compile
 * error rather than a paragraph in the docs — the failure is otherwise silent,
 * since a stroke on the surface path looks plausible until it clips at the
 * outline (§3.3) or refuses to animate as an arc.
 */
export type DialProps = Omit<SVGProps<SVGPathElement>, "d" | "fill" | "stroke" | "strokeWidth"> & {
  /** Distance inward from the outline edge, in dial units. @default 0 */
  inset?: DialUnits
  /**
   * Paint for the surface: a solid, a gradient or a pattern `url()`. Defaults
   * to `currentColor` — the rule for every primitive's paint — so a single
   * `color` on an ancestor themes the whole face, and Tailwind's colour
   * utilities work without per-element classes. @default "currentColor"
   */
  fill?: string
  stroke?: never
  strokeWidth?: never
}

/**
 * The dial surface: the outline's own shape, filled.
 *
 * One `<path>` and nothing else — no group, no wrapper — so `fill` can be a
 * solid, a gradient or a pattern with no library mechanism in between, and so
 * the surface costs exactly one node on a face that may carry hundreds.
 */
export function Dial({ inset = 0, fill = "currentColor", ...rest }: DialProps) {
  const outline = useOutline()
  // `data-mp` after the spread: TypeScript's data-* exemption lets a spread
  // smuggle `data-mp` past the props type, so the second lock keeps the one
  // attribute the library guarantees — and it stays a compile-time static.
  return <path d={outline.path(inset)} fill={fill} {...rest} data-mp="dial" />
}
