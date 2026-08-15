"use client"

/**
 * The diver — the first face on any of these pages that tells the time.
 *
 * Nothing here writes a source or holds a value: the clock lives inside the
 * component, and the only state on this page is the bezel position, which is a
 * number a wearer sets. Two faces run so the shared-engine claim is visible in
 * the profiler — one rAF loop for both.
 *
 * Scratch. Plan 4 deletes `www/app/lab` entirely.
 */
import { useState } from "react"
import { Diver } from "@/mainplate/examples/diver"
import type { FaceTheme } from "@/mainplate/examples/theme"
import { LabNav, ScratchNotice } from "../nav"

/** A steel-and-black variant, to prove the paints are dress and not structure. */
const midnight: FaceTheme = {
  dial: "oklch(0.19 0.008 275)",
  chapter: "oklch(0.58 0.01 275)",
  index: "oklch(0.9 0.006 275)",
  lume: "oklch(0.93 0.05 92)",
  hour: "oklch(0.9 0.006 275)",
  minute: "oklch(0.9 0.006 275)",
  second: "oklch(0.7 0.17 25)",
  accent: "oklch(0.3 0.012 275)",
}

export default function DiverLab() {
  const [bezel, setBezel] = useState(0)
  const [reserve, setReserve] = useState(0.72)

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — diver
      </h1>
      <LabNav current="/lab/diver" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        Live off <code>useWatchSource()</code>. Three hands subscribe to three <code>Source</code>s
        and write <code>style.rotate</code> through a ref, so these components render once and never
        again while the clock runs — and both faces share one rAF loop. Scroll them out of view and
        the engine is released; scroll back and the hands are where real time left them, not where
        the backlog would have put them.
      </p>

      <div className="mt-6 flex max-w-lg flex-col gap-3 text-xs text-dim">
        <label className="flex items-center gap-3">
          <span className="w-28 whitespace-nowrap">bezel {bezel} min</span>
          <input
            type="range"
            min={0}
            max={59}
            value={bezel}
            onChange={(e) => setBezel(Number(e.target.value))}
            className="w-full"
          />
        </label>
        <label className="flex items-center gap-3">
          <span className="w-28 whitespace-nowrap tabular-nums">
            reserve {Math.round(reserve * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(reserve * 100)}
            onChange={(e) => setReserve(Number(e.target.value) / 100)}
            className="w-full"
          />
        </label>
      </div>

      <div className="mt-8 flex flex-wrap items-start gap-12">
        <figure>
          <Diver bezel={bezel} reserve={reserve} size={340} />
          <figcaption className="mt-3 max-w-[44ch] text-xs text-dim">
            <code>diverTheme</code>. The bezel is a full-size second frame whose{" "}
            <code>startAngle</code> is the only thing the slider touches — no bezel component
            exists. The indices are <code>renderItem</code> artwork, three paths each.
          </figcaption>
        </figure>

        <figure>
          <Diver bezel={bezel} reserve={reserve} size={340} theme={midnight} />
          <figcaption className="mt-3 max-w-[44ch] text-xs text-dim">
            The same component under a second <code>FaceTheme</code>. The applied indices&apos;
            shaded facet is <code>color-mix</code> over the theme&apos;s own steel, so it follows
            the palette without a ninth token.
          </figcaption>
        </figure>
      </div>

      <div className="mt-16 h-[120vh]" aria-hidden>
        <p className="text-xs text-dim">
          Deliberate empty space: scroll the faces off the top and the shared engine goes quiet.
        </p>
      </div>
    </main>
  )
}
