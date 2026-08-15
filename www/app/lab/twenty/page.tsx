"use client"

/**
 * The twenty-face check — the load §9.7–9.11 were designed for, rendered for
 * real. Twenty live divers on one page, each running its own `useWatchSource`
 * with `observe` attached, so the page is the measurement rig for the plan's
 * central claims: one rAF loop total, offscreen faces releasing the engine,
 * hands moving through the ref path while nothing re-renders.
 *
 * The numbers are read from the console, not from this page: wrap
 * `requestAnimationFrame` in a counter, read `style.rotate` twice, watch the
 * grid's `data-renders` stay flat. The face-count buttons exist so one face
 * and twenty faces can be measured on the same rig.
 *
 * Scratch. Plan 4 deletes `www/app/lab` entirely.
 */
import { useEffect, useRef, useState } from "react"
import { Diver } from "@/mainplate/examples/diver"
import { LabNav, ScratchNotice } from "../nav"

const COUNTS = [1, 20] as const

/** Stable identities for the grid — the faces are interchangeable, but React
 * keys must not be born from a map index, so they are named up front. */
const FACE_IDS = Array.from({ length: 20 }, (_, i) => `face-${i + 1}`)

export default function TwentyLab() {
  const [count, setCount] = useState<number>(20)
  // Commit census for the live-ref-path check: written from an effect after
  // every commit — never during render, so it cannot enter server markup and
  // cannot hydration-mismatch. If anything above the faces re-rendered while
  // the clocks run, `data-renders` would climb; the whole point is that it
  // stays wherever user interaction last left it.
  const grid = useRef<HTMLDivElement>(null)
  const commits = useRef(0)
  useEffect(() => {
    commits.current += 1
    grid.current?.setAttribute("data-renders", String(commits.current))
  })

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — twenty
      </h1>
      <LabNav current="/lab/twenty" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        Twenty live faces, twenty <code>useWatchSource()</code> clocks, one shared ticker — the docs
        page §9.7–9.11 were built for, as a measurement rig. Every face attaches{" "}
        <code>ref={"{clock.observe}"}</code> internally, so scrolling the grid away should release
        the engine entirely.
      </p>

      <div className="mt-6 flex items-center gap-3 text-xs text-dim">
        <span>faces</span>
        {COUNTS.map((n) => (
          <button
            key={`count-${n}`}
            type="button"
            onClick={() => setCount(n)}
            className={`border border-line px-3 py-1 tracking-wide uppercase transition-colors hover:text-ink ${
              count === n ? "text-ink underline underline-offset-4" : ""
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div ref={grid} className="mt-8 grid grid-cols-5 gap-6">
        {FACE_IDS.slice(0, count).map((id) => (
          <Diver key={id} size={180} />
        ))}
      </div>

      <div className="mt-16 h-[160vh]" aria-hidden>
        <p className="text-xs text-dim">
          Deliberate empty space: scroll every face off the top and the shared engine should go
          quiet — zero rAF arms per second, not merely fewer.
        </p>
      </div>
    </main>
  )
}
