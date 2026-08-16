/**
 * Source → element rotation, written through a ref outside React.
 * May import: core. Must not import: react.
 *
 * The utility every live part shares, promoted from what the HTML prototype
 * had to hand-roll. Element-agnostic — anything with an inline `style` takes
 * the writes, a div today, an SVG group whenever one needs it — and quantised
 * at the write, because **the ref path bypasses React entirely and render-path
 * rounding does not cover it** (the carry-forward rule that already bit twice).
 *
 * `unwrap` is the Plan 3 wrap finding resolved at the layer that owns the
 * problem. A stepping hand animates each move with a CSS transition, and a
 * transition given an absolute 354° → 0° write spins the long way back. When
 * unwrapping, every write moves the element **by the shortest signed path**
 * from wherever it is: the seam crossing becomes an ordinary +6°, a decreasing
 * reading swings back the short way, and a value oscillating across the seam
 * stays local instead of ratcheting the element upward forever.
 */
import { quantize } from "../core"

export type BindRotationOptions = {
  /** The static half of the transform, preserved verbatim in every write. */
  translate: string
  /**
   * Accumulate each write by the shortest signed path — every delta is
   * normalised into (−180°, 180°] and added to the last written angle — for
   * elements whose writes a CSS transition animates. @default false
   */
  unwrap?: boolean
  /**
   * The accumulator, shared across binders. A caller that rebinds the same
   * element (pause/resume, a controlled value change) passes one cell for the
   * element's whole life; otherwise a fresh binder would write an absolute
   * angle into an element still wearing — and transitioning from — the
   * accumulated one, laps backwards at full speed. @default a private cell
   */
  state?: { last: number | null }
}

/**
 * Write `read()`'s angle into `el.style.transform` now and on every
 * notification from `subscribe`. Pass `subscribe: null` for a one-shot write
 * (a static hand). Returns the teardown; idempotent like every teardown in
 * the library.
 */
export function bindRotation(
  el: ElementCSSInlineStyle,
  read: () => number,
  subscribe: ((cb: () => void) => () => void) | null,
  { translate, unwrap = false, state }: BindRotationOptions,
): () => void {
  const acc = state ?? { last: null }

  const write = () => {
    let angle = read()
    if (unwrap && acc.last !== null) {
      // The signed distance from where the element is to where the value
      // points, normalised into (−180°, 180°] — the short way, either way.
      let delta = (angle - acc.last) % 360
      if (delta > 180) delta -= 360
      else if (delta <= -180) delta += 360
      angle = acc.last + delta
    }
    acc.last = angle
    el.style.transform = `${translate} rotate(${quantize(angle)}deg)`
  }

  write()
  if (subscribe === null) return () => {}
  return subscribe(write)
}
