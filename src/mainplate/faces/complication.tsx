"use client"

/**
 * `<Complication>` — positioned content, and the one nested-face context.
 * May import: core, faces/*. The horological term is the API: anything a face
 * does beyond its hands — a date window, a brand mark, a running-seconds
 * register — is a Complication, and there is no second mechanism.
 *
 * The dual nature, per spec §2:
 *
 * - **Content mode** (no `size`): `at` + `inset` resolve a point through the
 *   outer face's outline, and the children are centred on it. Nothing else
 *   changes — the children INHERIT the outer context, so a bare `<Hand>`
 *   dropped inside still pivots on the OUTER dial. Positioning content is not
 *   a new face.
 *
 * - **Context mode** (`size` given — the nested dial's DIAMETER, in the
 *   parent's dial units): the legacy `<Subdial>` semantics, reborn in HTML.
 *   The element becomes a fresh face box — its own inline-size container,
 *   sized so that the nominal 200-unit dial diameter inside means `size`
 *   parent units — and `FaceContext` is re-established over a nominal circle.
 *   Every part works inside unchanged, because to a part this box is
 *   indistinguishable from a root face: same outline shape, same 220-unit
 *   box, same cqw arithmetic against its own (now smaller) container. The
 *   rescale is the CONTAINER's, never the parts': where the SVG subdial wrote
 *   one `scale(r/100)` on a `<g>`, this writes one `width/height` in the
 *   parent's cqw and lets container-query units do the dividing.
 *
 * Two things deliberately do NOT re-establish:
 *
 * - **Liveness.** `registerLive` is threaded through from the outer context,
 *   so however deep a live hand sits, it registers with the ROOT face's
 *   observer — a register is not a second face to the viewport, and its
 *   seconds hand must go dark when the root scrolls out.
 * - **The domain.** `FaceContext` carries no domain at all — a reading's
 *   min/max/sweep live on the part that maps it — so there is nothing to
 *   leak and nothing to reset. The nested register states its own domain on
 *   its own hand, exactly as it would on a root face.
 */
import { type ComponentProps, type CSSProperties, type ReactNode, useMemo } from "react"
import {
  type ClockPosition,
  type Degrees,
  DIAL_RADIUS,
  type DialUnits,
  type Frame,
  frameBox,
  quantize,
  resolveAt,
  resolveOutline,
} from "../core"
import { hoistArcs } from "./arc"
import { FaceContext, type FaceContextValue, useFaceContext } from "./context"
import { anchorPercent } from "./geometry"

/**
 * Where a complication sits, in the words consumers say: a clock position,
 * the centre, or degrees from 12 o'clock. `"center"` is this component's own
 * addition to the `resolveAt` vocabulary — a readout under the pivot is the
 * most common complication there is, and `at={[0, 0]}` is not how anyone asks
 * for it.
 */
export type ComplicationPosition = ClockPosition | "center" | Degrees

export type ComplicationProps = {
  /** Where the complication's centre goes on the face. */
  at: ComplicationPosition
  /**
   * How far the centre sits inward from the face's outline, in dial units.
   * Outline-anchored, so it follows the face's shape; meaningless at
   * `"center"`, which is already a point. @default 0
   */
  inset?: DialUnits
  /**
   * Give the complication a face of its own: the nested dial's DIAMETER, in
   * the PARENT's dial units — a `size={30}` register spans 30 units of the
   * face it sits on, the way anyone eyeballs one. Omitted, the children are
   * positioned content on the outer face; given, they render inside a fresh
   * scaled context where the nominal 200-unit dial diameter means this many
   * parent units — the `<Subdial>` scaling, restated over a diameter.
   */
  size?: DialUnits
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<"div">, "children" | "className">

/**
 * The one mechanism for added content AND the one context re-establisher.
 * Inside `<Clock>`/`<Gauge>` it is always a free child — no slot claims it —
 * rendering above the face's own parts and below the cap.
 */
export function Complication({
  at,
  inset,
  size,
  className,
  style,
  children,
  ...rest
}: ComplicationProps) {
  const outer = useFaceContext()

  // The outer face as `resolveAt` wants it. The domain half is nominal — a
  // position is asked for in angles or clock positions, never in domain
  // values — and cx/cy are 0 because the face box is centred on the dial
  // origin by contract.
  const frame = useMemo<Frame>(
    () => ({
      cx: 0,
      cy: 0,
      r: DIAL_RADIUS,
      min: 0,
      max: 1,
      startAngle: 0,
      sweepAngle: 360,
      outline: outer.outline,
    }),
    [outer.outline],
  )

  // `"center"` is the tuple form, so it bypasses the anchor exactly as the
  // legacy subdial's omitted `at` did — asking the outline where the origin
  // is has no meaning. Everything is quantised on the way out.
  const { point } = resolveAt(at === "center" ? [0, 0] : at, frame, { inset })
  const { left, top } = anchorPercent(point, { boxW: outer.boxW, boxH: outer.boxH })

  // The nested context, built unconditionally (it is a hook) and used only in
  // context mode: a nominal circle — real Tanks have round registers — with
  // liveness and `unstyled` threaded through from OUTSIDE, per the header.
  const nested = useMemo<FaceContextValue>(() => {
    const outline = resolveOutline("circle")
    const box = frameBox({ outline, clip: false })
    return {
      outline,
      boxW: box.width,
      boxH: box.height,
      unstyled: outer.unstyled,
      registerLive: outer.registerLive,
    }
  }, [outer.unstyled, outer.registerLive])

  const anchor: CSSProperties = {
    position: "absolute",
    left,
    top,
    transform: "translate(-50%, -50%)",
  }

  if (size === undefined) {
    return (
      <div className={className} style={{ ...anchor, ...style }} {...rest} data-mp="complication">
        {children}
      </div>
    )
  }

  // The rescale, in full: the nested face box (its own dial units), times the
  // scale `size` names — diameter over the nominal 200-unit diameter —
  // expressed as cqw of the PARENT's box. On a circle in a circle the
  // arithmetic collapses to exactly `size / 2` cqw — the nominal boxes agree —
  // but it is written out so a future nested shape cannot silently inherit
  // the collapse. Both extents divide by the parent's WIDTH: cqw is
  // width-based by definition, and boxH here would stretch a register on
  // every shaped face.
  const scale = size / (2 * DIAL_RADIUS)
  const w = outer.boxW === 0 ? 0 : quantize((nested.boxW * scale * 100) / outer.boxW)
  const h = outer.boxW === 0 ? 0 : quantize((nested.boxH * scale * 100) / outer.boxW)

  return (
    <div
      className={className}
      style={{
        ...anchor,
        width: `${w}cqw`,
        height: `${h}cqw`,
        // The seam itself: cqw inside resolves against THIS box, so every
        // part's dial-unit arithmetic re-bases with no part changing at all.
        containerType: "inline-size",
        ...style,
      }}
      {...rest}
      data-mp="complication"
    >
      {/* A fresh context is a fresh arc layer: a register's arcs belong to the
          register's own outline and box, never to the face it sits on. */}
      <FaceContext.Provider value={nested}>{hoistArcs(children)}</FaceContext.Provider>
    </div>
  )
}
