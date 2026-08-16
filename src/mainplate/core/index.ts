/**
 * mainplate core — the engine.
 *
 * Geometry, outlines, sources, the `at` vocabulary, the tick population
 * pipeline, and the layer helpers that map a dial point onto a box. No
 * components live here: the SVG component layer is frozen in `legacy/`, the
 * HTML face layer is `faces/`, and both are built on this.
 *
 * Nothing in this directory may import from `time/`, `faces/` or `legacy/`.
 */

export type { Align } from "./arc-path"
export { arcPath } from "./arc-path"
export type { Anchor, At, ClockPosition, Frame } from "./at"
export { resolveAt } from "./at"
export { bothAnchorsMessage, failSoft } from "./errors"
export type { Degrees, DialUnits, DomainValue, Point, Scale } from "./geometry"
export {
  angleToValue,
  DIAL_RADIUS,
  epsilonFor,
  fmt,
  normalizeAngle,
  polar,
  quantize,
  valueToAngle,
} from "./geometry"
export type { DialPercent, FrameBoxOptions } from "./layer"
export { dialPercent, frameBox } from "./layer"
export type { Outline, OutlineSpec, Rect } from "./outline"
export { circleOutline, rectOutline, resolveOutline } from "./outline"
export type { Source, WritableSource } from "./source"
export { createSource, isSource } from "./source"
export type {
  EvaluableProps,
  ItemOf,
  PopulateInput,
  ResolvedProps,
  ResolvedTick,
  ResolveInput,
  Skip,
  TickContext,
  TickItem,
  TickProp,
  TierItemOf,
  TierSpec,
} from "./tick-scale"
export { EVALUABLE_PROPS, populate, resolveTicks } from "./tick-scale"
export { useSourceValue } from "./use-source-value"
