/**
 * `at`: the one way to say *where* on a face something goes.
 * May import: errors, geometry, outline. Must not import: react, time/, legacy/, faces/.
 *
 * Position on a dial is asked for in three registers — an angle, a clock
 * position, or a literal point — and `<Place>`, `<Subdial>`, `<Numerals>` and
 * `<Arc>` all have to answer the same way, or the vocabulary is a per-component
 * dialect (§2.6). This module is that single answer.
 */
import { bothAnchorsMessage, failSoft } from "./errors"
import { type Degrees, type DialUnits, type Point, polar, quantize, type Scale } from "./geometry"
import type { Outline } from "./outline"

/**
 * The angular coordinate system a face establishes, plus its centre, nominal
 * radius and outline.
 *
 * Engine data, not a component's: `resolveAt` takes one, and every renderer
 * — the frozen SVG layer's `useFrame`, the HTML face layer — supplies one.
 * It lives here, beside the vocabulary that consumes it, so neither renderer
 * owns the shape.
 */
export type Frame = Scale & {
  cx: DialUnits
  cy: DialUnits
  r: DialUnits
  outline: Outline
}

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
    // `r` survives, per the precedence documented on `bothAnchorsMessage`:
    // `inset` has a natural default, so it is the value that can arrive by
    // accident; `r` only ever appears because somebody wrote a number. The
    // resolution below already prefers it, so degrading is just proceeding —
    // out loud.
    failSoft(bothAnchorsMessage("an `at` anchor", r, inset), "Ignoring `inset`.")
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
