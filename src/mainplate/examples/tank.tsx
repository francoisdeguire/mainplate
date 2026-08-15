"use client"

/**
 * The Tank — §1's load-bearing demo, and the reason this library separates the
 * frame from the outline.
 * May import: core/, theme. Deliberately does not import time/: the Tank is a
 * controlled face, so a page can pose it at 10:09 for a screenshot.
 *
 * Everything on it exists to make one claim visible. The case is a rounded
 * rectangle, so the *outline* answers "given an angle, where is the edge?"
 * with a shape no radius can describe. The chemin de fer is
 * `placement="perimeter"`, so its sixty ties divide the case by **arc length**
 * — evenly, corners included — which is what a real railway track does and
 * what no per-angle query can express. The Roman numerals are radial, so they
 * still line up with the hands. Two coordinate answers on one face, from the
 * same population code.
 *
 * `"use client"`: `<Numerals format>` is a function, and functions cannot
 * cross the RSC boundary (§5.1b).
 */
import type { CSSProperties } from "react"
import {
  Arc,
  Dial,
  type DomainValue,
  Hand,
  Mainplate,
  Numerals,
  type OutlineSpec,
  Place,
  type TickContext,
  Ticks,
} from "../core"
import { type FaceTheme, themeVars } from "./theme"

/**
 * The case: a rounded rectangle at the Tank's proportions. Hoisted to module
 * scope on purpose — `<Mainplate outline>` memoises on identity, so a
 * descriptor written inline would rebuild the outline and invalidate the frame
 * context on every render of the whole face.
 *
 * At `ratio: 0.78` the half-extents are 100 × 128.205 dial units (the minor
 * axis is always 100, §2.3), and at `radius: 12` each corner arc is small
 * enough that a corner carries **two** seams — flank→arc at 34.47°, arc→flank
 * at 40.71°. That is the geometry the perimeter walk below has to get right.
 */
const TANK_CASE = { kind: "rect", ratio: 0.78, radius: 12 } as const satisfies OutlineSpec

/**
 * Cream, ink, and blued steel — the Tank's own palette. `lume` is set to the
 * numerals' ink because a Tank has no lume at all: a theme describes paints,
 * not one face's part list, so the token exists and simply reads as ink here.
 */
export const tankTheme: FaceTheme = {
  dial: "oklch(0.945 0.018 92)",
  chapter: "oklch(0.42 0.035 264)",
  index: "oklch(0.28 0.045 264)",
  lume: "oklch(0.28 0.045 264)",
  hour: "oklch(0.45 0.13 264)",
  minute: "oklch(0.45 0.13 264)",
  second: "oklch(0.45 0.13 264)",
  accent: "oklch(0.55 0.11 42)",
}

/**
 * The twelve Roman numerals, indexed by hour, with the **watchmaker's four**:
 * `IIII` rather than `IV`, the convention on essentially every Roman dial ever
 * printed, because four strokes balance the eight of `VIII` opposite it.
 */
const ROMAN = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"] as const

/**
 * Minutes → the numeral printed there. Module scope, not an inline closure:
 * a `format` written inline is a fresh function on every render, and every
 * function-shaped prop in this library is documented as wanting a stable one.
 *
 * The frame runs 0–60, so the labelled positions are the multiples of five and
 * the index is `value / 5`. `value` is never falsified for the label's sake
 * (the carry-forward's own rule) — the mark at minute 25 really is at 25, and
 * only its text says `V`.
 */
function roman(ctx: TickContext): string {
  return ROMAN[Math.round(ctx.value / 5) % 12] ?? ""
}

/**
 * The accessible reading, §14.1's form: a clock is one `role="img"` with a
 * formatted label, never a `role="meter"`. A meter reports exactly one
 * `aria-valuenow`, and a watch has three hands on three different domains —
 * "37 of 60" is not the time. Core cannot know what these numbers mean (§16),
 * so the phrasing is the example's.
 */
function timeLabel(hour: DomainValue, minute: DomainValue): string {
  const h = Math.floor(hour) % 12
  const m = Math.floor(minute) % 60
  return `${h === 0 ? 12 : h}:${String(m).padStart(2, "0")}`
}

/** Props for {@link Tank}: a controlled time, and the face's dress. */
export type TankProps = {
  /**
   * Hours on a 12-hour dial, fractional — 10.15 is a quarter past ten, and the
   * hour hand creeps between numerals the way a real one does.
   */
  hour: DomainValue
  /** Minutes, 0–60, fractional if you want a creeping minute hand. */
  minute: DomainValue
  /** Rendered width in px. Omitted, the face is fluid. */
  size?: number
  /** The paints. @default tankTheme */
  theme?: FaceTheme
}

/**
 * A rectangular dress watch with a railway minute track — the one demo that
 * cannot be built with a library that thinks a dial is a circle.
 *
 * Controlled, not live: it takes `hour` and `minute` as plain numbers so a
 * page can hold it at the advertising pose, and so the thing under test is the
 * geometry rather than a clock. The diver is the face that ticks.
 */
export function Tank({ hour, minute, size, theme = tankTheme }: TankProps) {
  return (
    <Mainplate
      size={size}
      outline={TANK_CASE}
      min={0}
      max={60}
      label={`Tank watch face, ${timeLabel(hour, minute)}`}
      style={{ color: theme.index, ...themeVars(theme) } as CSSProperties}
    >
      <Dial fill="var(--mp-dial)" />

      {/* The two rails. A full-sweep `<Arc>` on an `inset` anchor *is* the
          outline at that inset — the rounded rectangle itself, corners and
          all. The same two arcs anchored with `r` would be circles inscribed
          in the case, which is §5.8's half of the thesis. */}
      <Arc inset={5} strokeWidth={0.7} stroke="var(--mp-chapter)" />
      <Arc inset={11} strokeWidth={0.7} stroke="var(--mp-chapter)" />

      {/* The chemin de fer: sixty ties spanning rail to rail.
          `placement="perimeter"` divides the case by arc length rather than by
          angle, so the ties are evenly spaced along the flanks and around the
          corners — a radial division of the same rectangle spreads them by a
          factor of two between the short and long sides. `orient="edge"` then
          stands each tie square to the edge it sits on rather than fanning it
          along its ray; on a circle those two would be the same rotation,
          which is exactly why the difference only ever shows up here.
          One paint, so sixty marks cost one `<path>` (§15.4). */}
      <Ticks
        count={60}
        placement="perimeter"
        orient="edge"
        inset={5}
        align="inside"
        length={6}
        width={0.8}
        fill="var(--mp-chapter)"
      />

      {/* Radial, unlike the track above: a numeral marks a value a hand points
          at, so it belongs on that value's ray. Set with `align="inside"`, so
          each label's outer ink lands just inside the inner rail whatever its
          width — `XII` and `I` sit on the same reading line. */}
      <Numerals
        tiers={[{ every: 5 }]}
        format={roman}
        orient="radial"
        inset={14}
        align="inside"
        fontSize={13}
        fill="var(--mp-index)"
      />

      <Place at="12h" inset={40} fill="var(--mp-chapter)">
        <text fontSize={5.5} letterSpacing={1.6} textAnchor="middle" dominantBaseline="central">
          MAINPLATE
        </text>
      </Place>

      {/* Blued sword hands, as artwork rather than the built-in bar: drawn
          pointing up (−y) about the pivot, per §2.2, so a mark at angle θ
          turns by exactly θ and no correction term exists to get wrong. The
          minute hand stops just inside the flanks at 15 and 45 and falls short
          of the track at 12 and 6 — the rectangular-case trait, not a bug. */}
      <Hand value={hour} max={12} fill="var(--mp-hour)">
        <path d="M 0 -58 L 3.6 -40 L 1.5 -4 L 1.5 8 L -1.5 8 L -1.5 -4 L -3.6 -40 Z" />
      </Hand>
      <Hand value={minute} fill="var(--mp-minute)">
        <path d="M 0 -86 L 2.8 -62 L 1.2 -4 L 1.2 8 L -1.2 8 L -1.2 -4 L -2.8 -62 Z" />
      </Hand>
      <circle r={2.6} fill="var(--mp-hour)" />
      <circle r={1} fill="var(--mp-dial)" />
    </Mainplate>
  )
}
