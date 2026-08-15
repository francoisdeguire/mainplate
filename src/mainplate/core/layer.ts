/**
 * The frame's box, and positioning HTML against it from outside the SVG.
 * May import: geometry, outline. Must not import: react, time/.
 *
 * mainplate's answer to "arbitrary HTML on a face" is not `<foreignObject>` —
 * WebKit bug 23113 displaces any HTML there that uses `position`, `transform`,
 * `opacity` below 1 or a filter, which is most components worth dropping on a
 * dial. The answer is layer composition *outside* the SVG: stacked
 * absolutely-positioned `<Mainplate>` roots with plain HTML between them in one
 * relative container, which recovers paint-order interleaving at layer
 * granularity with no Safari restrictions and unrestricted consumer CSS.
 *
 * That leaves exactly one gap, and this module is it. An HTML layer is a
 * *sibling* of `<Mainplate>`, not a child, so `useFrame()` cannot reach it —
 * there is no context out there to read. So the geometry is passed explicitly,
 * under the same three names `<Mainplate>` uses, and this is a function rather
 * than a component for the same reason.
 */
import { type DialUnits, fmt, type Point } from "./geometry"
import { type OutlineSpec, type Rect, resolveOutline } from "./outline"

/**
 * The three `<Mainplate>` props that decide where the frame's box falls.
 *
 * Deliberately named for the props rather than for this module: a consumer
 * positioning an HTML layer copies the same values across to the face beside
 * it, and identical names are what stops the two silently disagreeing.
 */
export type FrameBoxOptions = {
  /** The face's shape — the same value the sibling `<Mainplate>` is given. */
  outline?: OutlineSpec
  /** Room reserved outside the outline. @default 0 when clipping, 10 when not */
  padding?: DialUnits
  /** Whether the face clips to its outline; decides `padding`'s default. @default true */
  clip?: boolean
}

/**
 * `padding`'s default, which depends on `clip` and so cannot be a default
 * parameter anywhere.
 *
 * Clipping makes the space outside the outline undrawable, so a clipped face
 * reserves none of it; an unclipped one keeps the 10 units that numerals set
 * beyond the edge and an overhanging hand need. Lives here, called by both
 * `<Mainplate>` and `frameBox`, so the two cannot drift apart.
 */
export function framePadding(padding: DialUnits | undefined, clip: boolean): DialUnits {
  return padding ?? (clip ? 0 : 10)
}

/**
 * The region a face covers in dial units: its outline's bounding box grown by
 * `padding` on every side. This is `<Mainplate>`'s viewBox, and it is derived
 * here rather than inside the component so that anything positioning itself
 * against a face reads the identical numbers.
 *
 * Useful on its own for sizing the container a stack of layers lives in —
 * `height / width` is the face's aspect ratio, the same one `<Mainplate>`
 * applies to `size`.
 */
export function frameBox({ outline, padding, clip = true }: FrameBoxOptions = {}): Rect {
  const pad = framePadding(padding, clip)
  const box = resolveOutline(outline).bbox()
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  }
}

/**
 * A position within a face, as CSS percentages — spread straight into `style`.
 *
 * Percentages rather than pixels because `size` is optional on `<Mainplate>`:
 * a fluid face is whatever width its container is this millisecond, so a pixel
 * answer would be stale the moment anything resized. These hold at every size.
 */
export type DialPercent = { left: string; top: string }

/**
 * Where a dial point falls inside a face, for HTML positioned beside it rather
 * than inside it.
 *
 * Pass the same `outline`, `padding` and `clip` the sibling `<Mainplate>` gets
 * — the names match its props precisely so the values can be copied across —
 * and put the result on an element in a layer that exactly overlays the face.
 *
 * Two things it deliberately leaves to you, because both are yours to own:
 *
 * - **Positioning.** `left`/`top` mean nothing without `position: absolute`
 *   inside the container the face fills. Returning it would be this function
 *   deciding your layout.
 * - **Centring.** These place an element's top-left corner on the point, not
 *   its centre. Add `transform: translate(-50%, -50%)` to centre it — which is
 *   safe here precisely because this is ordinary HTML outside the SVG, where
 *   the `<foreignObject>` transform restriction does not apply. Returning the
 *   transform would clobber any of your own.
 *
 * ```tsx
 * <div className="relative">
 *   <Mainplate outline={outline} clip={false} className="absolute top-0 left-0">…</Mainplate>
 *   <div className="absolute inset-0">
 *     <Badge
 *       style={{
 *         position: "absolute",
 *         transform: "translate(-50%, -50%)",
 *         ...dialPercent(polar(45, 62), { outline, clip: false }),
 *       }}
 *     />
 *   </div>
 * </div>
 * ```
 */
export function dialPercent(point: Point, options: FrameBoxOptions = {}): DialPercent {
  const box = frameBox(options)
  return {
    left: `${fmt(along(point.x, box.x, box.width))}%`,
    top: `${fmt(along(point.y, box.y, box.height))}%`,
  }
}

/**
 * One axis of the mapping, kept separate so the two cannot quietly share an
 * extent — on any non-square outline they differ, and a face that used the
 * width twice looks merely a little off rather than broken.
 *
 * A zero extent is only reachable through a custom `Outline` whose bbox
 * collapses. Half-way is the honest answer there, and it beats the `NaN` that
 * makes the element vanish with nothing in the console.
 */
function along(value: DialUnits, min: DialUnits, extent: DialUnits): number {
  return extent === 0 ? 50 : ((value - min) / extent) * 100
}
