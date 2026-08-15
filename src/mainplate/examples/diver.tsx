"use client"

/**
 * The diver — the first example that actually ticks.
 * May import: core/, time/, theme. It is the counterweight to the speedometer:
 * that face proves a gauge never pays for a clock, this one proves the clock
 * costs the page nothing it did not ask for.
 *
 * What it exists to demonstrate, in order of how hard each was to get right:
 *
 * - **`startAngle` is the rotating bezel** (§4.6). The bezel is not a special
 *   component; it is a second frame over the same centre, and turning it is
 *   turning that frame's start angle. Free, because it was already a prop.
 * - **Applied indices via `renderItem`** (§6.7) — faceted batons with a lume
 *   block let into them, two or three paths each, not the built-in quad.
 * - **A power reserve `<Subdial>`** on its own 0–1 domain and its own partial
 *   sweep, with a hand whose artwork is authored in its own coordinate space
 *   and dropped in via `pivot` (§8.2).
 * - **A counterbalanced seconds hand** — the built-in shape with a `tail`.
 *   `pivot` and `tail` are demonstrated on two different hands rather than on
 *   this one, and that is the API talking: `tail` is a dimension of the
 *   built-in bar, which `children` replaces outright, so the moment artwork
 *   arrives `tail` stops existing — and `pivot` only earns anything once
 *   artwork has. The two props are mutually exclusive in practice.
 * - **Three hands, one hook, zero renders.** `useWatchSource()` hands each
 *   `<Hand>` a `Source`; the hands subscribe and write `style.rotate` through
 *   a ref, so this component renders once and never again while the clock runs
 *   (§9.1, §15.2). `ref={clock.observe}` on the root is the other half of the
 *   bargain: scrolled out of view, this face releases the shared engine
 *   entirely (§9.11).
 *
 * **Accessibility, and the hydration ruling behind it.** The root is
 * `role="img"` with a static label — no `role="meter"`. §14.1 is explicit that
 * a clock is an image with a name, and §14.2's meter is for gauge-shaped
 * frames where one number *is* the reading. Opting a live clock into the meter
 * would put a watch field into `aria-valuenow` at render time, and a watch
 * field reads 10:09:36 on the server and the real time in the browser (§9.5) —
 * a guaranteed hydration mismatch on the root element, silenceable only by
 * putting `suppressHydrationWarning` on the node that carries the viewBox, the
 * theme custom properties and every class a consumer sets. §14.2 already
 * ranks the alternatives: an accessible value frozen at first render is worse
 * than none, and this face has none rather than a stale one.
 */
import type { CSSProperties } from "react"
import {
  Arc,
  Dial,
  type DomainValue,
  Hand,
  Mainplate,
  type MarkGeometry,
  Numerals,
  Place,
  Subdial,
  Ticks,
} from "../core"
import { useWatchSource } from "../time"
import { type FaceTheme, themeVars } from "./theme"

/** Deep blue plate, steel indices, aqua lume, an orange seconds hand. */
export const diverTheme: FaceTheme = {
  dial: "oklch(0.26 0.045 252)",
  chapter: "oklch(0.62 0.025 252)",
  index: "oklch(0.87 0.012 252)",
  lume: "oklch(0.91 0.055 176)",
  hour: "oklch(0.87 0.012 252)",
  minute: "oklch(0.87 0.012 252)",
  second: "oklch(0.72 0.16 42)",
  accent: "oklch(0.38 0.075 252)",
}

/** Which artwork an applied index wears. `kind` is passthrough data — none of
 * the six evaluable names (`length`, `width`, `offset`, `inset`, `r`, `fill`),
 * so it rides through the pipeline untouched and arrives typed in `renderItem`. */
type IndexKind = "twelve" | "baton"

/**
 * The twelve applied indices as a `ticks` array — §6.1's "the array is the
 * real API". Written as data rather than as a `count`, because the mark at
 * twelve is a different object from the other eleven, and `renderItem` needs
 * to be told so by the item rather than by re-deriving it from the value.
 */
const INDICES: readonly { value: DomainValue; kind: IndexKind }[] = Array.from(
  { length: 12 },
  (_, i) => ({ value: i * 5, kind: i === 0 ? "twelve" : "baton" }),
)

/** The bezel's zero pip, as a one-element population so it rides the frame's
 * `startAngle` with everything else on the bezel. A `<Place at={0}>` would not:
 * `at` is an angle, and an angle does not rotate when the frame does. */
const BEZEL_PIP: readonly { value: DomainValue }[] = [{ value: 0 }]

/**
 * The shaded half of an applied index. Derived from the theme's own steel
 * rather than named as a ninth token: a facet is the same paint seen at a
 * different angle, and `color-mix` in OKLCH is the house way to say that
 * (§2.11) without adding a token every face would then have to set.
 */
const FACET_SHADE = "color-mix(in oklch, var(--mp-index) 52%, var(--mp-dial))"

/**
 * One applied index: two facets meeting on a lengthwise ridge, chamfered at
 * both ends, with a lume block let into the middle. Three `<path>`s per mark
 * rather than the built-in quad — which is exactly what `renderItem` is for,
 * and what it costs (§6.7: N nodes, opted into).
 *
 * The artwork is written as literal coordinates in the mark's **own** space,
 * where the origin is the mark's anchor and local −y runs outward, and it is
 * carried into place by `translate` + `rotate`. That is deliberate: the only
 * computed numbers in the output are `point` and `rotation`, both of which
 * `useTicks` has already quantised to the library's 4dp. Building the artwork
 * by adding the point into every coordinate would put raw trig output into
 * path data, which is the exact shape of the hydration mismatch the whole
 * quantisation rule exists to prevent.
 */
function appliedIndex(mark: MarkGeometry<{ value: DomainValue; kind: IndexKind }>) {
  const placed = `translate(${mark.point.x} ${mark.point.y}) rotate(${mark.rotation})`
  if (mark.item.kind === "twelve") {
    return (
      <g transform={placed}>
        <path d="M 0 -1.6 L 7 17 L -7 17 Z" fill="var(--mp-index)" />
        <path d="M 0 4.4 L 4.2 14.6 L -4.2 14.6 Z" fill="var(--mp-lume)" />
      </g>
    )
  }
  return (
    <g transform={placed}>
      <path d="M -3 2 L 0 0 L 0 17 L -3 15 Z" fill="var(--mp-index)" />
      <path d="M 0 0 L 3 2 L 3 15 L 0 17 Z" fill={FACET_SHADE} />
      <path d="M -1.55 4.6 L 1.55 4.6 L 1.55 13.2 L -1.55 13.2 Z" fill="var(--mp-lume)" />
    </g>
  )
}

/**
 * The bezel's zero pip: a lume triangle standing outward from its anchor. Same
 * local-space rule as {@link appliedIndex} — literal artwork, placed by a
 * transform built from two already-quantised numbers.
 */
function bezelPip(mark: MarkGeometry<{ value: DomainValue }>) {
  return (
    <g transform={`translate(${mark.point.x} ${mark.point.y}) rotate(${mark.rotation})`}>
      <path d="M 0 -11.5 L 5 -1 L -5 -1 Z" fill="var(--mp-lume)" />
    </g>
  )
}

/** Props for {@link Diver}: the two things a wearer sets, and the dress. */
export type DiverProps = {
  /**
   * Where the elapsed-time bezel's zero pip sits, in minutes — the position a
   * diver turns it to at the start of a dive. Reaches the face as the bezel
   * frame's `startAngle`, six degrees to the minute, which is all a rotating
   * bezel ever was (§4.6). @default 0
   */
  bezel?: DomainValue
  /** Power reserve remaining, 0 (wound down) to 1 (full). @default 0.72 */
  reserve?: DomainValue
  /** Rendered width in px. Omitted, the face is fluid. */
  size?: number
  /** The paints. @default diverTheme */
  theme?: FaceTheme
}

/**
 * A live dive watch: rotating bezel, power reserve, applied indices, and a
 * gliding seconds hand off the shared clock.
 *
 * The seconds source is left at its default `"glide"` cadence — the sweep a
 * spring drive is known for — which under `prefers-reduced-motion` degrades to
 * one step per second at the shared ticker rather than freezing (§9.6). This
 * component renders once; everything that moves afterwards moves outside
 * React.
 */
export function Diver({ bezel = 0, reserve = 0.72, size, theme = diverTheme }: DiverProps) {
  const clock = useWatchSource()

  return (
    <Mainplate
      // §9.11, and opt-in: the clock releases the shared engine while this
      // element is out of the viewport and resyncs to elapsed real time when
      // it comes back. Nothing in `time/` renders a node, so only a consumer
      // can say which element's visibility governs the clock.
      ref={clock.observe}
      size={size}
      min={0}
      max={60}
      label="Diver watch face"
      style={{ color: theme.index, ...themeVars(theme) } as CSSProperties}
    >
      {/* The bezel plate: the whole disc, with the dial dropped on top of it
          below, so what survives is a ring. */}
      <Dial fill="var(--mp-accent)" />

      {/* The rotating bezel, as a full-size second frame. Everything inside
          reads `startAngle` through the ordinary frame context, so turning the
          bezel is one number and no new component (§4.6). The pip is skipped
          from the graduations because the pip *is* the zero mark. */}
      <Subdial r={100} min={0} max={60} startAngle={bezel * 6} label="Elapsed-time bezel">
        <Ticks
          inset={2}
          align="inside"
          skip={[0]}
          tiers={[
            { every: 1, length: 3, width: 0.8, fill: "var(--mp-chapter)" },
            { every: 5, length: 4.5, width: 1.8, fill: "var(--mp-index)" },
          ]}
        />
        {/* Frame-anchored (`r`), not outline-anchored: the bezel is a ring and
            these labels belong on a circle inside its graduations, with room
            left on both sides of them. */}
        <Numerals
          tiers={[{ every: 10 }]}
          from={10}
          to={50}
          r={91}
          fontSize={7.5}
          fill="var(--mp-index)"
        />
        <Ticks ticks={BEZEL_PIP} inset={15} renderItem={bezelPip} />
      </Subdial>

      <Dial inset={16} fill="var(--mp-dial)" />

      {/* The minute track, on the dial's own frame — radial, because these are
          the marks the hands point at. */}
      <Ticks
        inset={17}
        align="inside"
        tiers={[
          { every: 1, length: 2.5, width: 0.7, fill: "var(--mp-chapter)" },
          { every: 5, length: 4, width: 1.5, fill: "var(--mp-index)" },
        ]}
      />

      <Ticks ticks={INDICES} inset={23} renderItem={appliedIndex} />

      <Place at="12h" inset={42} fill="var(--mp-chapter)">
        <text fontSize={5} letterSpacing={1.4} textAnchor="middle" dominantBaseline="central">
          MAINPLATE
        </text>
      </Place>

      {/* Its own domain and its own sweep, inheriting neither: 0–1 over 116°,
          on a face whose frame runs 0–60 over a full turn (§4.8). */}
      <Subdial
        at="8h"
        inset={62}
        r={20}
        min={0}
        max={1}
        startAngle={-58}
        sweepAngle={116}
        label="Power reserve"
      >
        <Arc inset={6} strokeWidth={1.2} stroke="var(--mp-chapter)" />
        <Ticks count={5} inset={6} align="inside" length={12} width={3.5} fill="var(--mp-index)" />
        {/* `pivot` earning its keep: the artwork below is authored in its own
            coordinate space — origin somewhere off to the side, the way a
            drawing tool exports it — and `pivot` slides its rotation point
            onto the frame's centre without anyone editing the path (§8.2). */}
        <Hand value={reserve} pivot={[10, 70]} fill="var(--mp-index)">
          <path d="M 6.5 70 L 10 5 L 13.5 70 L 10 79 Z" />
        </Hand>
      </Subdial>

      {/* Lumed handset. Two paths each: the steel body and the lume let into
          it. No `min`/`max` on the hour hand — `clock.hour` carries its own
          0–12 domain, and §8.10 has a source's domain beat the frame's. */}
      <Hand value={clock.hour} fill="var(--mp-hour)">
        <path d="M 0 -54 L 4.4 -41 L 4.4 6 L 2.8 10 L -2.8 10 L -4.4 6 L -4.4 -41 Z" />
        <path d="M 0 -47.5 L 2.9 -38.5 L 2.9 4 L -2.9 4 L -2.9 -38.5 Z" fill="var(--mp-lume)" />
      </Hand>
      <Hand value={clock.minute} fill="var(--mp-minute)">
        <path d="M 0 -80 L 3.2 -65 L 3.2 6 L 2 10 L -2 10 L -3.2 6 L -3.2 -65 Z" />
        <path d="M 0 -73.5 L 1.9 -62 L 1.9 4 L -1.9 4 L -1.9 -62 Z" fill="var(--mp-lume)" />
      </Hand>

      {/* The counterbalance is `tail`, on the built-in shape: one path, no
          artwork, and the weight that keeps a real seconds hand from loading
          its own pivot. */}
      <Hand value={clock.second} length={81} tail={26} width={1.4} fill="var(--mp-second)" />
      <circle r={3.4} fill="var(--mp-second)" />
      <circle r={1.2} fill="var(--mp-dial)" />
    </Mainplate>
  )
}
