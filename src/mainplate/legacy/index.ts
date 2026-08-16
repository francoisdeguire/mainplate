/**
 * mainplate legacy — the frozen SVG component layer.
 *
 * These are the primitives Plans 1–3 built: `<Mainplate>` and the seven parts
 * that read its frame from context, plus the numeral clearance solver. They
 * work, they are tested, and they are **frozen** — the product moved to the
 * HTML face layer in `faces/`, and nothing here is developed further.
 *
 * They build on `core/` and may import nothing else: not `time/`, not
 * `faces/`. Enforced by `scripts/check-boundaries.ts`.
 */

export type { ArcProps } from "./arc"
export { Arc } from "./arc"
export type { Ink, TickFace } from "./clearance"
export { clearanceRadius, estimateInk, inkClearance } from "./clearance"
export type { DialProps } from "./dial"
export { Dial } from "./dial"
export type { Frame, MainplateProps, ScaleOverride } from "./frame"
export { Mainplate, useFrame, useOutline } from "./frame"
export type { HandProps } from "./hand"
export { Hand } from "./hand"
export type { NumeralGeometry, NumeralsProps } from "./numerals"
export { Numerals } from "./numerals"
export type { PlaceProps } from "./place"
export { Place } from "./place"
export type { SubdialProps } from "./subdial"
export { Subdial } from "./subdial"
export type { Align, MarkGeometry, Orient, Placement, TicksProps } from "./ticks"
export { orientationOf, Ticks, useTicks } from "./ticks"
