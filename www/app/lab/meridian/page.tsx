"use client"

/**
 * The Meridian lab: the shape task's acceptance demo. The Apple Watch
 * Meridian face, recreated on the frozen faces API — a rounded rect
 * (`ratio 0.82, radius 30`), the perimeter minute ring with angular hour
 * bars (the bare rect `<Ticks/>` default), four complications on the quarter
 * anchors, and the hairline seconds hand. Light ground, ink + one warm red,
 * per the direction. Judged side by side against the reference image.
 */

import { useState } from "react"
import { Clock, Complication, Hand } from "@/mainplate/faces"
import { DateWindow } from "@/mainplate/faces/date-window"
import { LabNav, ScratchNotice } from "../nav"

const CARD = "rounded-3xl border border-zinc-200 bg-white p-8 text-zinc-900 shadow-sm"
const NOTE = "mt-4 text-center text-xs text-zinc-600"
const SECTION = "mt-10 text-xs font-medium tracking-wide uppercase opacity-50"

/** The Meridian proportions, straight from the spec's worked example. */
const MERIDIAN = { ratio: 0.82, radius: 30 }

/** Ink-only readout: the 3 o'clock temperature block. */
function TempComp() {
  return (
    <div className="flex flex-col items-center" style={{ color: "var(--mp-ink)" }}>
      <span className="text-[6cqw] leading-none font-medium tracking-tight tabular-nums">21°</span>
      <span className="mt-[0.8cqw] text-[2.4cqw] font-medium tracking-[0.18em] uppercase opacity-60">
        Sunny
      </span>
    </div>
  )
}

/** The 6 o'clock rings — concentric, one red, the rest ink ramps. */
function RingsComp() {
  return (
    <div
      className="grid place-items-center rounded-full"
      style={{ width: "13cqw", height: "13cqw", border: "1.2cqw solid var(--mp-accent)" }}
    >
      <div
        className="grid place-items-center rounded-full"
        style={{
          width: "8.6cqw",
          height: "8.6cqw",
          border: "1.2cqw solid var(--mp-ink)",
          opacity: 0.75,
        }}
      >
        <div
          className="rounded-full"
          style={{
            width: "4.2cqw",
            height: "4.2cqw",
            border: "1.2cqw solid var(--mp-ink)",
            opacity: 0.45,
          }}
        />
      </div>
    </div>
  )
}

/** The 9 o'clock timer glyph: an ink ring wearing one red index. */
function TimerComp() {
  return (
    <div
      className="relative rounded-full"
      style={{ width: "12cqw", height: "12cqw", border: "1cqw solid var(--mp-ink)", opacity: 0.9 }}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          top: "-0.4cqw",
          width: "1.8cqw",
          height: "3.2cqw",
          background: "var(--mp-accent)",
        }}
      />
    </div>
  )
}

/** The face itself: one Clock, four Complications, the hairline seconds. */
function MeridianFace({ day }: { day: number }) {
  return (
    <Clock
      shape={MERIDIAN}
      numerals="none"
      label="Meridian: analog clock with date, temperature, rings and timer complications"
      className="w-72"
    >
      {/* The slot keeps the clock's own reading; the word thins the hand. */}
      <Hand type="second" variant="line" />
      <Complication at="12h" inset={36}>
        <DateWindow value={day} />
      </Complication>
      <Complication at="3h" inset={36}>
        <TempComp />
      </Complication>
      <Complication at="6h" inset={36}>
        <RingsComp />
      </Complication>
      <Complication at="9h" inset={36}>
        <TimerComp />
      </Complication>
    </Clock>
  )
}

export default function MeridianLab() {
  const [day, setDay] = useState(15)
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — meridian
      </h1>
      <LabNav current="/lab/meridian" />
      <ScratchNotice />

      <h2 className={SECTION}>the recreation — shape, span ticks, complications</h2>
      <div className="mt-4 flex flex-wrap items-start gap-8">
        <div className={CARD}>
          <MeridianFace day={day} />
          <p className={NOTE}>
            {'<Clock shape={{ ratio: 0.82, radius: 30 }} numerals="none"> + four complications'}
          </p>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setDay((d) => (d % 31) + 1)}
              className="rounded-full border border-zinc-300 px-4 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              advance the date
            </button>
          </div>
        </div>
        <div className={CARD}>
          <Clock shape={MERIDIAN} numerals="none" className="w-72" />
          <p className={NOTE}>
            the bare rect defaults: perimeter minute ring, angular hour bars, corner-radius dial
          </p>
        </div>
      </div>

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-zinc-500">
        What to judge against the reference: the minute ticks form ONE uniform ring following the
        rounded rect (even gaps along the perimeter, inner ends on a parallel inset); the twelve
        hour bars stand on the frame rays so the hands point at them, the oblique ones visibly
        longer and none of them thinner; the dial&apos;s corner radius matches the shape; the
        seconds hand is the one red hairline.
      </p>
    </main>
  )
}
