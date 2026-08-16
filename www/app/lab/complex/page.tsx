"use client"

/**
 * The complex-face lab: Task 10's chronograph, at two sizes, with the
 * chronograph counters driven by a real elapsed-time loop and the date window
 * rollable on demand. Light ground, ink + one warm red, per the direction.
 */

import { useEffect, useRef, useState } from "react"
import { createSource } from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"
import { ComplexFace } from "./complex-face"

const CARD = "rounded-3xl border border-zinc-200 bg-white p-8 text-zinc-900 shadow-sm"
const NOTE = "mt-4 text-center text-xs text-zinc-600"
const BUTTON =
  "rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"

/**
 * The chronograph's engine, lab edition: one rAF loop feeding both counters
 * from real elapsed time while running. The sources are created once; the
 * face subscribes and writes the DOM itself — this component re-renders only
 * when the RUN STATE changes, never per frame.
 */
function useChronograph() {
  const [elapsedSeconds] = useState(() => createSource(0, { min: 0, max: 60 }))
  const [elapsedMinutes] = useState(() => createSource(0, { min: 0, max: 30 }))
  const [running, setRunning] = useState(true)
  const accrued = useRef(0)

  useEffect(() => {
    if (!running) return
    const started = performance.now()
    let frame = requestAnimationFrame(function loop() {
      const total = accrued.current + (performance.now() - started)
      elapsedSeconds.set((total / 1000) % 60)
      elapsedMinutes.set((total / 60_000) % 30)
      frame = requestAnimationFrame(loop)
    })
    return () => {
      accrued.current += performance.now() - started
      cancelAnimationFrame(frame)
    }
  }, [running, elapsedSeconds, elapsedMinutes])

  const reset = () => {
    accrued.current = 0
    elapsedSeconds.set(0)
    elapsedMinutes.set(0)
    setRunning(false)
  }

  return { elapsedSeconds, elapsedMinutes, running, setRunning, reset }
}

export default function ComplexLab() {
  const chrono = useChronograph()
  // A fixed initial date so server and client agree; the button rolls it.
  const [date, setDate] = useState(15)

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — the complex face
      </h1>
      <LabNav current="/lab/complex" />
      <ScratchNotice />
      <p className="mt-2 text-[10px] tracking-wide uppercase opacity-40">build 1</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" className={BUTTON} onClick={() => chrono.setRunning(!chrono.running)}>
          {chrono.running ? "stop chronograph" : "start chronograph"}
        </button>
        <button type="button" className={BUTTON} onClick={chrono.reset}>
          reset
        </button>
        <button type="button" className={BUTTON} onClick={() => setDate((d) => (d % 31) + 1)}>
          roll the date
        </button>
      </div>

      <h2 className="mt-10 text-xs font-medium tracking-wide uppercase opacity-50">
        everything at once — tachymeter, two registers, date, arcs, five hands
      </h2>
      <div className="mt-4 flex flex-wrap items-start gap-8">
        <div className={CARD}>
          <ComplexFace
            elapsedSeconds={chrono.elapsedSeconds}
            elapsedMinutes={chrono.elapsedMinutes}
            date={date}
            className="w-96"
          />
          <p className={NOTE}>w-96 — the judging size</p>
        </div>
        <div className={CARD}>
          <ComplexFace
            elapsedSeconds={chrono.elapsedSeconds}
            elapsedMinutes={chrono.elapsedMinutes}
            date={date}
            className="w-56"
          />
          <p className={NOTE}>w-56 — where the registers' strokes go sub-pixel</p>
        </div>
      </div>
    </main>
  )
}
