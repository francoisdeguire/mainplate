"use client"

/**
 * The speedometer — §18's proof, not a decoration.
 * May import: core/, theme. Must not import: time/ — `check:boundaries`
 * enforces it, because "a dashboard gauge never pays for a clock" is an API
 * claim, and an untested claim is a wish.
 *
 * Everything here is `core/` plus the copyable theme: a partial 270° sweep,
 * a two-tier track, solved numerals, a redline `<Arc>`, and a `<Hand>` driven
 * by a controlled number. No `useWatchSource`, no ticker, no `observe` ref —
 * this face deliberately has no clock to pause.
 */
import { type CSSProperties, useId } from "react"
import { Arc, Dial, type DomainValue, Hand, Mainplate, Numerals, Place, Ticks } from "../core"
import { type FaceTheme, type Oklch, oklchGradientStops, themeVars } from "./theme"

/**
 * A dark dashboard palette, exported so a consumer can start from something
 * that already reads at night. `hour`/`minute` are set even though this face
 * never draws them: a theme describes paints, not one face's part list.
 */
export const dashboardTheme: FaceTheme = {
  dial: "oklch(0.22 0.015 265)",
  chapter: "oklch(0.52 0.02 265)",
  index: "oklch(0.9 0.015 95)",
  lume: "oklch(0.88 0.06 95)",
  hour: "oklch(0.9 0.015 95)",
  minute: "oklch(0.9 0.015 95)",
  second: "oklch(0.64 0.24 27)",
  accent: "oklch(0.55 0.21 27)",
}

/**
 * The default dial vignette: `dashboardTheme.dial`'s hue, lighter at the
 * centre, darker at the rim. As `Oklch` numbers rather than strings because
 * the gradient helper interpolates them — a theme paint is opaque to math.
 */
const DIAL_VIGNETTE: [Oklch, Oklch] = [
  { l: 0.27, c: 0.02, h: 265 },
  { l: 0.17, c: 0.015, h: 265 },
]

/**
 * Module-scope, not inline: the formatter's identity is a dependency of the
 * meter's live subscription path, and a fresh closure per render would churn
 * it if this face ever swapped its number for a `Source`.
 */
function kmh(value: DomainValue): string {
  return `${Math.round(value)} km/h`
}

/** Props for {@link Speedometer}: a controlled number and the face's dress. */
export type SpeedometerProps = {
  /**
   * Indicated speed in km/h — a plain controlled number, never a clock. The
   * needle is a pure function of this prop; nothing inside ticks.
   */
  value: DomainValue
  /** Rendered width in px. Omitted, the face is fluid. */
  size?: number
  /** The paints. @default dashboardTheme */
  theme?: FaceTheme
  /**
   * The dial's shading, centre to rim, interpolated in OKLCH and emitted as
   * sRGB stops (§2.11) — SVG would otherwise interpolate the endpoints in
   * sRGB and grey the ramp. A pair of numbers rather than a theme paint
   * because gradients need coordinates, not strings; a light theme wants a
   * light pair here too. @default the dashboard's dark vignette
   */
  vignette?: [centre: Oklch, edge: Oklch]
}

/**
 * A 0–220 km/h gauge on a 270° sweep — the first example face, and the proof
 * that a clock and a speedometer are the same component: everything below is
 * `core/`, and CI fails if this file ever imports `time/`.
 */
export function Speedometer({
  value,
  size,
  theme = dashboardTheme,
  vignette = DIAL_VIGNETTE,
}: SpeedometerProps) {
  const gradientId = useId()
  return (
    <Mainplate
      size={size}
      min={0}
      max={220}
      startAngle={-135}
      sweepAngle={270}
      label="Speedometer"
      value={value}
      valueText={kmh}
      style={{ color: theme.index, ...themeVars(theme) } as CSSProperties}
    >
      <defs>
        <radialGradient id={gradientId}>
          {oklchGradientStops(vignette[0], vignette[1]).map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </radialGradient>
      </defs>
      <Dial fill={`url(#${gradientId})`} />

      {/* The redline: 180–220 as a solid band under the track, so the marks
          above it stay in ink — the way a printed dial actually layers. */}
      <Arc from={180} to={220} r={93.5} strokeWidth={9} stroke="var(--mp-accent)" />

      <Ticks
        inset={2}
        align="inside"
        tiers={[
          { every: 4, length: 5, width: 1, fill: "var(--mp-chapter)" },
          { every: 20, length: 9, width: 2.4, fill: "var(--mp-index)" },
        ]}
      />

      {/* Solved anchoring: every label's ink holds 3.5 units off the major
          ticks' inner ends at r 89 (100 − inset 2 − length 9), so "0" and
          "220" read equally clear of their marks despite the width gap. */}
      <Numerals
        tiers={[{ every: 20 }]}
        track={{ r: 89, width: 2.4 }}
        clearance={3.5}
        fontSize={11}
        fill="var(--mp-lume)"
      />

      {/* The sweep's empty quarter is where a dashboard prints its unit. */}
      <Place at="6h" inset={68} fill="var(--mp-chapter)">
        <text fontSize={7} letterSpacing={1.2} textAnchor="middle" dominantBaseline="central">
          km/h
        </text>
      </Place>

      <Hand value={value} length={86} tail={18} width={3.5} fill="var(--mp-second)" />
      <circle r={6} fill="var(--mp-second)" />
      <circle r={2.2} fill="var(--mp-dial)" />
    </Mainplate>
  )
}
