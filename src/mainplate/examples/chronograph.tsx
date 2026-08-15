"use client"

/**
 * The chronograph — §21's compositional stress test.
 * May import: core/, time/, theme. This face is the reason `check:boundaries`
 * names the speedometer and not "the examples": a chronograph legitimately
 * pays for the clock, and its wall-time half rides `useWatchSource`.
 *
 * What it proves, deliberately:
 * - Three `<Subdial>`s at 3, 6 and 9 o'clock, each with its **own domain**
 *   (§4.8): 60 running seconds, a 30-minute counter, a 12-hour counter. The
 *   counters' hands carry no `source.domain` on purpose, so the register's
 *   `min`/`max` is what maps them — the exact trap §4.8's no-inherit rule
 *   exists for, exercised rather than avoided.
 * - A tachymeter on the outer chapter ring via the explicit `ticks` array in
 *   domain units (§6.1): positions are seconds, labels are `3600 / t`. No
 *   `count` + `format` combination can express that spacing.
 * - `skip` clearing the chapter ring where the registers paint over it —
 *   subdials are later siblings, so anything drawn beneath them is hidden,
 *   not gone; `skip` removes it the way a real dial simply doesn't print it.
 */
import { type CSSProperties, useId, useMemo } from "react"
import {
  Arc,
  Dial,
  type DomainValue,
  Hand,
  isSource,
  Mainplate,
  Numerals,
  Place,
  type Source,
  Subdial,
  type TickContext,
  Ticks,
} from "../core"
import { useWatchSource } from "../time"
import { type FaceTheme, type Oklch, oklchGradientStops, themeVars } from "./theme"

/**
 * A dark racing palette, exported as the chronograph's default dress. Wall
 * time reads in warm white (`hour`/`minute`/`index`); everything the stopwatch
 * owns — the central chrono hand and both counters — reads in the one loud
 * orange (`second`/`accent`), the way a real chrono separates "what time is
 * it" from "what am I timing".
 */
export const racingTheme: FaceTheme = {
  dial: "oklch(0.23 0.012 255)",
  chapter: "oklch(0.55 0.015 255)",
  index: "oklch(0.92 0.01 95)",
  lume: "oklch(0.86 0.06 95)",
  hour: "oklch(0.92 0.01 95)",
  minute: "oklch(0.92 0.01 95)",
  second: "oklch(0.7 0.19 45)",
  accent: "oklch(0.7 0.19 45)",
}

/**
 * The default dial vignette, `racingTheme.dial`'s hue lighter at the centre
 * and darker at the rim — `Oklch` numbers, not theme strings, because the
 * gradient helper interpolates them (§2.11).
 */
const DIAL_VIGNETTE: [Oklch, Oklch] = [
  { l: 0.28, c: 0.015, h: 255 },
  { l: 0.18, c: 0.012, h: 255 },
]

/**
 * The registers' recessed plate. Not a `FaceTheme` token because the theme's
 * eight paints have no word for "a well inside the dial" — the first face to
 * need a ninth color, noted as such — so it ships as its own prop with a
 * default that sits one step darker than `racingTheme.dial`.
 */
const REGISTER_WELL = "oklch(0.17 0.012 255)"

/**
 * Where a tachymeter prints a speed, in units/hour. The classic bezel
 * progression: steps of 50 down the crowded fast end (400→300), then 25
 * (300→250 and 250→200 via 275/225), 20, 10, and finally 5 below 100 — the
 * spacing shrinks as the scale decompresses, so the printed labels stay
 * roughly evenly readable in angle even though the mechanism (t = 3600/v) is
 * wildly non-linear. 60 is the floor a 60-second bezel can show at all.
 */
const TACHY_SPEEDS = [
  400, 350, 300, 275, 250, 225, 200, 180, 160, 150, 140, 130, 120, 110, 100, 95, 90, 85, 80, 75, 70,
  65, 60,
] as const

/**
 * The tachymeter as §6.1's explicit `ticks` array: each mark's `value` is a
 * time in **seconds** — the frame's domain unit — placed by the ordinary
 * value→angle mapping. The speeds above are authored; the positions are
 * derived, because the dial is a clock face and the speed scale is what's
 * warped, not the other way around.
 */
const TACHY_TICKS = TACHY_SPEEDS.map((speed) => ({ value: 3600 / speed }))

/**
 * A tachymeter label is computed, never authored: the mark at t seconds reads
 * `3600 / t` units per hour — 45 s over a measured mile is 80 mph. Rounded
 * because the positions were themselves derived from round speeds and the
 * division only reintroduces float dust. Module-scope for a stable identity.
 */
function tachyLabel({ value }: TickContext<{ value: number }>): string {
  return String(Math.round(3600 / value))
}

/**
 * One elapsed-seconds input split into the three chronograph channels. The
 * derived sources deliberately carry **no `domain`**: §8.10's precedence would
 * let a source domain silently outvote the register's own `min`/`max`, and
 * this face exists to prove the registers' domains are load-bearing (§4.8) —
 * each hand maps through the frame it actually lives in.
 */
function splitElapsed(elapsed: DomainValue | Source<number>) {
  if (isSource(elapsed)) {
    const derive = (project: (s: number) => number): Source<number> => ({
      get: () => project(elapsed.get()),
      subscribe: elapsed.subscribe,
    })
    return {
      seconds: derive((s) => s % 60),
      minutes: derive((s) => (s / 60) % 30),
      hours: derive((s) => (s / 3600) % 12),
    }
  }
  return {
    seconds: elapsed % 60,
    minutes: (elapsed / 60) % 30,
    hours: (elapsed / 3600) % 12,
  }
}

/** Props for {@link Chronograph}: the stopwatch's elapsed time and the dress. */
export type ChronographProps = {
  /**
   * Elapsed stopwatch time in **seconds** — a plain number (controlled,
   * testable) or a `Source` of one (live: the central hand and both counters
   * subscribe and move at zero React renders). Wall time is not this prop's
   * business; the hour/minute hands and the running-seconds register read the
   * real clock via `useWatchSource` internally.
   */
  elapsed: DomainValue | Source<number>
  /** Rendered width in px. Omitted, the face is fluid. */
  size?: number
  /** The paints. @default racingTheme */
  theme?: FaceTheme
  /**
   * Paint for the three registers' recessed plates — the ninth color the
   * eight-token theme has no name for. @default a step darker than the dial
   */
  well?: string
  /**
   * The dial's shading, centre to rim, interpolated in OKLCH and emitted as
   * sRGB stops (§2.11). @default the racing vignette
   */
  vignette?: [centre: Oklch, edge: Oklch]
  /**
   * IANA zone for the wall-time half of the face. Read on the first render,
   * like every `useWatchSource` option. @default the environment's local zone
   */
  timezone?: string
}

/**
 * A 60-second chronograph: wall time on the central hour/minute hands and the
 * 9 o'clock running-seconds register, elapsed stopwatch time on the central
 * chrono hand, the 30-minute counter at 3 and the 12-hour counter at 6 — the
 * heaviest composition in the examples, and the one built to break the API if
 * anything will (§21). The main frame is 0–60 seconds; every register resets
 * it (§4.8); the tachymeter warps around it (§6.1).
 */
export function Chronograph({
  elapsed,
  size,
  theme = racingTheme,
  well = REGISTER_WELL,
  vignette = DIAL_VIGNETTE,
  timezone,
}: ChronographProps) {
  const gradientId = useId()
  // The wall clock: stable sources, zero parent renders. `observe` goes on
  // the root below so a face scrolled offscreen releases the shared ticker.
  const clock = useWatchSource(timezone === undefined ? undefined : { timezone })
  // Memoised so the derived sources keep their identity across renders —
  // `<Hand>`'s subscription effect depends on `get`/`subscribe` themselves,
  // and fresh wrappers per render would churn it.
  const chrono = useMemo(() => splitElapsed(elapsed), [elapsed])

  return (
    <Mainplate
      ref={clock.observe}
      size={size}
      min={0}
      max={60}
      label="Chronograph"
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

      {/* The tachymeter ring: marks in seconds, labels in units/hour. */}
      <Ticks
        ticks={TACHY_TICKS}
        inset={0.5}
        align="inside"
        length={3.5}
        width={1}
        fill="var(--mp-chapter)"
      />
      <Numerals
        ticks={TACHY_TICKS}
        r={91}
        fontSize={5}
        fill="var(--mp-index)"
        format={tachyLabel}
      />

      {/* The rehaut line dividing the tachymeter from the seconds track. */}
      <Arc inset={13.5} strokeWidth={0.6} stroke="var(--mp-chapter)" />

      {/* The chrono seconds track. Top-level skip, not per-tier: at 15, 30 and
          45 a register paints over this ring, so the position is removed
          outright — the date-window rule (§6.7) — rather than letting a lower
          tier show through under a plate that hides it anyway. */}
      <Ticks
        inset={16}
        align="inside"
        skip={[15, 30, 45]}
        tiers={[
          { every: 1, length: 3.5, width: 0.8, fill: "var(--mp-chapter)" },
          { every: 5, length: 7, width: 2, fill: "var(--mp-index)" },
        ]}
      />

      {/* Solved numerals for the track; the labels the registers would cover
          are skipped, exactly as a printed dial omits them. from={5} keeps the
          top label 60 — a full-turn population would print 0 there. */}
      <Numerals
        tiers={[{ every: 5 }]}
        from={5}
        to={60}
        skip={[15, 30, 45]}
        track={{ r: 77, width: 2 }}
        clearance={3}
        fontSize={9}
        fill="var(--mp-lume)"
      />

      <Place at="12h" inset={38} fill="var(--mp-chapter)">
        <text fontSize={4} letterSpacing={1.5} textAnchor="middle" dominantBaseline="central">
          TACHYMETRE
        </text>
      </Place>

      {/* Running seconds — wall time. Its own 0–60 domain (§4.8): the frame
          resets inside a register, never inherits. */}
      <Subdial at="9h" inset={48} r={28} min={0} max={60} label="Running seconds">
        <Dial fill={well} />
        <circle r={97} fill="none" stroke="var(--mp-chapter)" strokeWidth={2} />
        <Ticks
          inset={6}
          align="inside"
          tiers={[
            { every: 5, length: 8, width: 2, fill: "var(--mp-chapter)" },
            { every: 15, length: 13, width: 3.2, fill: "var(--mp-index)" },
          ]}
        />
        <Numerals
          tiers={[{ every: 15 }]}
          from={15}
          to={60}
          r={56}
          fontSize={20}
          fill="var(--mp-lume)"
        />
        <Hand value={clock.second} length={80} tail={16} width={4} fill="var(--mp-index)" />
        <circle r={5} fill="var(--mp-index)" />
      </Subdial>

      {/* 30-minute counter — elapsed time. Domain 0–30: value 15 points
          straight down, not at 3 o'clock. */}
      <Subdial at="3h" inset={48} r={28} min={0} max={30} label="30-minute counter">
        <Dial fill={well} />
        <circle r={97} fill="none" stroke="var(--mp-chapter)" strokeWidth={2} />
        <Ticks
          inset={6}
          align="inside"
          tiers={[
            { every: 1, length: 5, width: 1.2, fill: "var(--mp-chapter)" },
            { every: 5, length: 10, width: 2.6, fill: "var(--mp-index)" },
          ]}
        />
        <Numerals
          tiers={[{ every: 10 }]}
          from={10}
          to={30}
          r={54}
          fontSize={20}
          fill="var(--mp-lume)"
        />
        <Hand value={chrono.minutes} length={78} tail={16} width={4} fill="var(--mp-accent)" />
        <circle r={5} fill="var(--mp-accent)" />
      </Subdial>

      {/* 12-hour counter — elapsed time. Domain 0–12. */}
      <Subdial at="6h" inset={48} r={28} min={0} max={12} label="12-hour counter">
        <Dial fill={well} />
        <circle r={97} fill="none" stroke="var(--mp-chapter)" strokeWidth={2} />
        <Ticks
          inset={6}
          align="inside"
          tiers={[
            { every: 1, length: 6, width: 1.4, fill: "var(--mp-chapter)" },
            { every: 3, length: 11, width: 2.8, fill: "var(--mp-index)" },
          ]}
        />
        <Numerals
          tiers={[{ every: 3 }]}
          from={3}
          to={12}
          r={52}
          fontSize={20}
          fill="var(--mp-lume)"
        />
        <Hand value={chrono.hours} length={78} tail={16} width={4} fill="var(--mp-accent)" />
        <circle r={5} fill="var(--mp-accent)" />
      </Subdial>

      {/* Wall time reads white; the stopwatch reads orange. Hands paint after
          the registers, so the minute hand crosses the wells the way a real
          one does — above the plates, below nothing. */}
      <Hand value={clock.hour} length={46} tail={10} width={6} fill="var(--mp-hour)" />
      <Hand value={clock.minute} length={68} tail={12} width={4.5} fill="var(--mp-minute)" />
      <Hand value={chrono.seconds} length={90} tail={20} width={1.8} fill="var(--mp-second)" />
      <circle r={5} fill="var(--mp-second)" />
      <circle r={1.8} fill="var(--mp-dial)" />
    </Mainplate>
  )
}
