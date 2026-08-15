"use client"

/**
 * The speedometer example, driven the only way it can be: a controlled number
 * from a slider. No clock, no interval, no `Source` — the needle moves because
 * React re-renders with a new prop, which is the §18 proof made visible. The
 * second face runs the same component under a different `FaceTheme` to show
 * the theme is dress, not structure.
 */
import { useState } from "react"
import { Speedometer } from "@/mainplate/examples/speedometer"
import type { FaceTheme } from "@/mainplate/examples/theme"
import { LabNav, ScratchNotice } from "../nav"

/** A pale daylight cluster, to prove the paints swap without touching geometry. */
const daylight: FaceTheme = {
  dial: "oklch(0.96 0.005 95)",
  chapter: "oklch(0.6 0.01 265)",
  index: "oklch(0.25 0.02 265)",
  lume: "oklch(0.32 0.02 265)",
  hour: "oklch(0.25 0.02 265)",
  minute: "oklch(0.25 0.02 265)",
  second: "oklch(0.55 0.22 27)",
  accent: "oklch(0.6 0.21 27)",
}

export default function Speedo() {
  const [speed, setSpeed] = useState(72)

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — speedo
      </h1>
      <LabNav current="/lab/speedo" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        The first example face, and the proof of the split: everything on it is <code>core/</code>{" "}
        plus the copyable theme, and <code>check:boundaries</code> fails CI if this component ever
        imports <code>time/</code>. The needle is a controlled number — drag the slider; nothing on
        this page ticks.
      </p>

      <label className="mt-6 flex max-w-sm items-center gap-3 text-xs text-dim">
        <span className="w-24 whitespace-nowrap tabular-nums">{speed} km/h</span>
        <input
          type="range"
          min={0}
          max={220}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="w-full"
        />
      </label>

      <div className="mt-8 flex flex-wrap items-start gap-12">
        <figure>
          <Speedometer value={speed} size={340} />
          <figcaption className="mt-3 max-w-[46ch] text-xs text-dim">
            <code>dashboardTheme</code>. 270° sweep from −135°, minors every 4, majors every 20,
            numerals solved with <code>track</code> + <code>clearance</code>, redline 180–220. The
            dial vignette is the §2.11 helper: seven OKLCH-interpolated stops, because SVG gradients
            only speak sRGB.
          </figcaption>
        </figure>

        <figure>
          <Speedometer
            value={speed}
            size={340}
            theme={daylight}
            vignette={[
              { l: 0.99, c: 0.003, h: 95 },
              { l: 0.91, c: 0.008, h: 95 },
            ]}
          />
          <figcaption className="mt-3 max-w-[46ch] text-xs text-dim">
            The same component under a daylight <code>FaceTheme</code> — eight <code>--mp-*</code>{" "}
            custom properties swap the paints, the geometry never hears about it.
          </figcaption>
        </figure>
      </div>
    </main>
  )
}
