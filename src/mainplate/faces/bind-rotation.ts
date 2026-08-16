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
 * unwrapping, every write is accumulated monotonically instead: the element's
 * rotation only ever grows, and the seam crossing becomes an ordinary +6°.
 */
import { quantize } from "../core"

export type BindRotationOptions = {
  /** The static half of the transform, preserved verbatim in every write. */
  translate: string
  /**
   * Accumulate rotation monotonically across the 360° seam — for elements
   * whose writes a CSS transition animates. @default false
   */
  unwrap?: boolean
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
  { translate, unwrap = false }: BindRotationOptions,
): () => void {
  let last: number | null = null

  const write = () => {
    let angle = read()
    if (unwrap && last !== null) {
      // The forward distance from where the element is to where the value
      // points, in [0, 360). Backwards never happens on the clocks that step
      // — so a near-full lap is the same position wobbling in its last float
      // bits, and unwrapping it would spin the element 360° for nothing.
      const forward = (((angle - last) % 360) + 360) % 360
      angle = forward > 359 ? last : last + forward
    }
    last = angle
    el.style.transform = `${translate} rotate(${quantize(angle)}deg)`
  }

  write()
  if (subscribe === null) return () => {}
  return subscribe(write)
}
