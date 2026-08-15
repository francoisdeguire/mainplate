/**
 * A copyable face theme — an example artifact, not a core contract (§21.1).
 * May import: nothing. Copied into a project and edited, never depended on.
 *
 * Core deliberately owns no token names: watchface palettes don't normalize —
 * a diver needs lume and bezel tokens a Tank has no concept of — so a core
 * theme object would freeze a vocabulary the faces themselves disagree on.
 * This file is the compromise: typed, demonstrated by the examples, deletable.
 * SVG inheritance plus custom properties does the actual theming.
 */

/**
 * The eight paints a face names. Any CSS color; OKLCH is the house convention
 * (§2.11) because `color-mix(in oklch, …)` derives variants without mud.
 * Not every face uses every token — a speedometer has no hour hand — and
 * that is the point: the theme outlives any one face's needs.
 */
export type FaceTheme = {
  /** The plate itself — what `<Dial>` fills. */
  dial: string
  /** The minute/minor track: the quiet graduations. */
  chapter: string
  /** The major indices: the marks the eye actually reads. */
  index: string
  /** Numerals and anything that glows — lume plots, night-shift paint. */
  lume: string
  /** The hour hand. */
  hour: string
  /** The minute hand. */
  minute: string
  /** The fast hand — seconds on a watch, the needle on a gauge. */
  second: string
  /** The one loud color: a redline, a chrono ring, a signal. */
  accent: string
}

/**
 * A `FaceTheme` as `--mp-*` custom properties, ready to spread into a root's
 * `style`. Custom properties rather than per-element fills so one object
 * themes a whole face: primitives inside reference `var(--mp-…)` and inherit
 * through the SVG tree with zero library code.
 */
export function themeVars(t: FaceTheme): Record<`--mp-${keyof FaceTheme}`, string> {
  return {
    "--mp-dial": t.dial,
    "--mp-chapter": t.chapter,
    "--mp-index": t.index,
    "--mp-lume": t.lume,
    "--mp-hour": t.hour,
    "--mp-minute": t.minute,
    "--mp-second": t.second,
    "--mp-accent": t.accent,
  }
}

/** An OKLCH color as numbers: `l` in [0, 1], `c` ≥ 0, `h` in degrees. */
export type Oklch = { l: number; c: number; h: number }

/** One SVG gradient stop: an `offset` in [0, 1] and an sRGB hex `color`. */
export type GradientStop = { offset: number; color: string }

/** sRGB gamma encoding of one linear channel, clipped to the gamut. */
function encode(linear: number): number {
  const x = Math.min(Math.max(linear, 0), 1)
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

/**
 * OKLCH → sRGB hex, via OKLab (Björn Ottosson's matrices). Out-of-gamut
 * colors clip channelwise — good enough for gradient stops, where the ramp's
 * neighbours mask a clipped extreme.
 */
function toHex({ l, c, h }: Oklch): string {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  return `#${channels
    .map((ch) =>
      Math.round(encode(ch) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}

/**
 * Intermediate gradient stops interpolated in OKLCH, emitted as sRGB.
 *
 * The reason this exists: SVG gradients always interpolate in sRGB —
 * `<linearGradient>` offers no OKLCH mode — so two OKLCH endpoints muddy
 * through grey between them (§2.11). Pre-computing the in-between stops on
 * the OKLCH path and handing SVG seven short sRGB segments keeps the rendered
 * ramp on the perceptual route. Hue takes the shorter arc, the CSS default.
 * Offsets are quantised to 4dp, like every number this library hands to the
 * DOM. A `stops` below 2 cannot describe a gradient and degrades to the two
 * endpoints.
 */
export function oklchGradientStops(from: Oklch, to: Oklch, stops = 7): GradientStop[] {
  const n = Math.max(2, Math.round(stops))
  // Shorter-arc hue delta, mapped into (-180, 180].
  const dh = ((((to.h - from.h) % 360) + 540) % 360) - 180
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return {
      offset: Number(t.toFixed(4)),
      color: toHex({
        l: from.l + (to.l - from.l) * t,
        c: from.c + (to.c - from.c) * t,
        h: from.h + dh * t,
      }),
    }
  })
}
