/**
 * mainplate core — declarative primitives for analog instrument faces.
 *
 * The single public import path. Everything here is dependency-free apart from
 * React, and nothing in this directory may import from `time/`.
 */

export type { Frame, MainplateProps, ScaleOverride } from "./frame"
export { Mainplate, useFrame, useOutline } from "./frame"
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
export type { Outline, OutlineSpec, Rect } from "./outline"
export { circleOutline, rectOutline, resolveOutline } from "./outline"
export type { Source, WritableSource } from "./source"
export { createSource, isSource } from "./source"
export type {
  PopulateInput,
  ResolvedTick,
  ResolveInput,
  Skip,
  TickContext,
  TickItem,
  TickProp,
  TierSpec,
} from "./tick-scale"
export { EVALUABLE_PROPS, populate, resolveTicks } from "./tick-scale"
export type { Align, MarkGeometry, Orient, Placement, TicksProps } from "./ticks"
export { orientationOf, Ticks, useTicks } from "./ticks"
export { useSourceValue } from "./use-source-value"
