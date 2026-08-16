/**
 * One color in, whole face out — the theming contract of the face layer.
 * May import: nothing. Must not import: react, the DOM.
 *
 * Every derivation is a **CSS relative-color string**, never a computed value:
 * the browser resolves `oklch(from currentColor …)` against whatever ink the
 * face inherits *at paint time*, so `color="var(--primary)"` follows a theme
 * switch live and a dark app's light ink produces light ramps with no prop and
 * no mode switch. Reading `getComputedStyle` instead would bake one moment's
 * answer into the DOM — banned here by plan constraint, not preference.
 *
 * The ramps are alpha off the ink, not lightness shifts (spec §12, measured in
 * the spike on zinc-100 and zinc-900 grounds): dial 5%, minor tick 32%, major
 * tick 78%, numeral 72%. One scheme, both grounds, untouched.
 */

/** The face's CSS custom properties, spread onto the `<Mainplate>` root. */
export type PaletteVars = Record<`--mp-${string}`, string>

/**
 * The default accent: the warm red of a Swiss railway seconds hand. Fixed —
 * it is the one piece of the palette that does not follow the ink, because an
 * accent that greyed out with a grey ink would stop being an accent.
 */
const WARM_RED = "oklch(0.62 0.19 27)"

/**
 * Build the palette from one color, or from the inherited `currentColor`.
 *
 * With an explicit color the accent derives from it — lightness pinned to the
 * red's own, chroma boosted (`c * 1.2 + 0.06`) so even a muted brand color
 * yields an accent that reads as one — while the hue stays the caller's. All
 * in CSS, so the derivation is as live as the input.
 */
export function paletteVars(color: string | undefined): PaletteVars {
  const ink = color ?? "currentColor"
  return {
    "--mp-ink": ink,
    "--mp-accent":
      color === undefined ? WARM_RED : `oklch(from ${color} 0.62 calc(c * 1.2 + 0.06) h)`,
    "--mp-dial": `oklch(from ${ink} l c h / 0.05)`,
    "--mp-tick": `oklch(from ${ink} l c h / 0.32)`,
    "--mp-tick-major": `oklch(from ${ink} l c h / 0.78)`,
    "--mp-numeral": `oklch(from ${ink} l c h / 0.72)`,
  }
}
