/**
 * `at`: the one way to say *where* on a face something goes.
 * May import: geometry, outline, frame (types only). Must not import: react, time/.
 *
 * Position on a dial is asked for in three registers — an angle, a clock
 * position, or a literal point — and `<Place>`, `<Subdial>`, `<Numerals>` and
 * `<Arc>` all have to answer the same way, or the vocabulary is a per-component
 * dialect (§2.6). This module is that single answer.
 */
import type { Frame } from "./frame"
import { type Degrees, type DialUnits, type Point, polar, quantize } from "./geometry"

/**
 * A position on the clock face, as consumers say it out loud.
 *
 * Typed as a literal union so all twelve autocomplete and `at="13h"` is a
 * compile error rather than a silent landing at 30 degrees. The `h` is what
 * keeps the sugar honest: a bare `9` meaning twelfths would be a hidden dialect
 * in a library whose bare numbers are degrees everywhere else.
 */
export type ClockPosition = `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}h`

/**
 * Where something sits: an angle in degrees, a clock position, or a literal
 * `[x, y]` in dial units.
 *
 * `at={270}` and `at="9h"` are the same point. The tuple is the escape hatch
 * for the things a dial has that no angle describes — a date window, a logo
 * set off-centre — and it is deliberately in dial units, not viewBox units, so
 * it renormalises inside a `<Subdial>` like everything else.
 */
export type At = Degrees | ClockPosition | [DialUnits, DialUnits]

/**
 * How far out the position sits: from the centre (`r`), or in from the outline
 * (`inset`). Exactly one, as an XOR union.
 *
 * They coincide on a circle and diverge on every other outline — `r` is
 * frame-anchored and ignores the shape, `inset` is outline-anchored and follows
 * it — so honouring both is not a thing that has a meaning. Omit both to sit on
 * the outline edge.
 */
export type Anchor =
  | {
      /** Distance inward from the outline edge, in dial units. @default 0 */
      inset?: DialUnits
      r?: never
    }
  | {
      /** Radius from the centre, ignoring the outline, in dial units. */
      r: DialUnits
      inset?: never
    }

const RAD_TO_DEG = 180 / Math.PI

/**
 * Production warnings already spoken, keyed by their whole message.
 *
 * `resolveAt` runs per primitive per render — sixty times a second on a face
 * driven by a hand — so an undeduped log is a log that buries the page. Keyed
 * by message rather than a flag, so a second, different misuse still speaks up.
 */
const warned = new Set<string>()

/**
 * Both anchors at once is a programmer error, and the production half of the
 * error ruling has to pick a survivor.
 *
 * `r` wins. `inset` has a natural default — an omitted anchor *is* `inset: 0` —
 * so it is the value that can arrive by accident, from a spread or a shared
 * props object. `r` only ever appears because somebody wrote a number.
 */
function warnBothAnchors(message: string) {
  if (warned.has(message)) return
  warned.add(message)
  console.error(`${message} Ignoring \`inset\`.`)
}

/**
 * Resolve an `at` into the angle and the point every primitive positions with.
 *
 * The angle comes back even for a tuple, because position and orientation are
 * separate axes here: artwork dropped at a literal point still has to know
 * which way is out.
 */
export function resolveAt(
  at: At,
  frame: Frame,
  anchor: Anchor = {},
): { angle: Degrees; point: Point } {
  const { r, inset } = anchor

  if (r !== undefined && inset !== undefined) {
    const received =
      "mainplate: an `at` anchor takes only one of `r` or `inset`. `r` is frame-anchored — a " +
      "fixed radius from the centre, ignoring the outline. `inset` is outline-anchored — a " +
      "distance inward from the edge, so it follows the shape. On a circle they can agree; on " +
      "any other outline they cannot, so there is no sensible way to honour both."

    if (process.env.NODE_ENV !== "production") throw new Error(received)

    // Deliberately outside the guard: degrading beats taking down the route,
    // but degrading in silence is the failure class the guard exists to catch.
    warnBothAnchors(received)
  }

  // A tuple is already the answer. It bypasses the anchor completely — asking
  // an outline where `[30, -40]` is has no meaning — but it still earns an
  // angle, from the library's own convention: 0 is up, clockwise positive.
  if (Array.isArray(at)) {
    const [x, y] = at
    return {
      angle: x === 0 && y === 0 ? 0 : quantize(Math.atan2(x, -y) * RAD_TO_DEG),
      point: { x: quantize(x), y: quantize(y) },
    }
  }

  // Degrees pass through untouched — unnormalised, so a caller animating past
  // 360 reads back the number they wrote. A clock position is the same axis in
  // twelfths, and `12h` folds to 0 rather than to 360 for the same reason.
  const angle = typeof at === "number" ? at : (Number.parseInt(at, 10) % 12) * 30

  const point = r !== undefined ? polar(angle, r) : frame.outline.pointAt(angle, inset ?? 0)

  // Quantised on the way out, not only when written into path data: these
  // numbers reach consumer JSX, and raw trig differs in the last ULP between
  // the server's engine and the browser's — a guaranteed hydration mismatch.
  return { angle, point: { x: quantize(point.x), y: quantize(point.y) } }
}
