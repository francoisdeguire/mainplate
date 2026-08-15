"use client"

/**
 * Scratch verification route for the packaged chronograph example — the
 * library face, not the hand-rolled one on /lab/face. A module-scope elapsed
 * source runs the stopwatch; wall time comes from the example's own clock.
 */
import { useEffect, useState } from "react"
import { createSource } from "@/mainplate/core"
import { Chronograph } from "@/mainplate/examples/chronograph"
import { LabNav, ScratchNotice } from "../nav"

/**
 * Elapsed stopwatch seconds. Module scope: the server and the first client
 * render both read 0 (no hydration mismatch), and the identity is stable so
 * the hands' subscriptions never churn.
 */
const elapsed = createSource(0)

export default function ChronoLab() {
  const [running, setRunning] = useState(true)

  // Recomputed from an absolute start, never accumulated — the same §9.9
  // discipline the library's own ticker follows.
  useEffect(() => {
    if (!running) return
    const t0 = Date.now() - elapsed.get() * 1000
    const id = setInterval(() => elapsed.set((Date.now() - t0) / 1000), 50)
    return () => clearInterval(id)
  }, [running])

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — chrono
      </h1>
      <LabNav current="/lab/chrono" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        The packaged chronograph example: three registers with three domains (60 s, 30 min, 12 h), a
        tachymeter from the explicit <code>ticks</code> array labelled <code>3600 / t</code>, and an
        elapsed <code>Source</code> moving the chrono hands at zero React renders. Wall time runs on
        the example&apos;s own <code>useWatchSource</code>.
      </p>

      <div className="mt-8 flex flex-wrap items-start gap-12">
        <figure className="max-w-[420px]">
          <Chronograph size={420} elapsed={elapsed} />
          <figcaption className="mt-3 max-w-[46ch] text-xs text-dim">
            Running seconds at 9 (wall time), 30-minute counter at 3 and 12-hour counter at 6
            (stopwatch), tachymeter on the chapter ring.
          </figcaption>
        </figure>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="w-fit border border-line px-3 py-1 text-xs tracking-wide uppercase text-dim transition-colors hover:text-ink"
          >
            {running ? "stop" : "start"}
          </button>
          <button
            type="button"
            onClick={() => elapsed.set(0)}
            className="w-fit border border-line px-3 py-1 text-xs tracking-wide uppercase text-dim transition-colors hover:text-ink"
          >
            reset
          </button>
        </div>
      </div>
    </main>
  )
}
