"use client"

/**
 * The face core, bare: `<Mainplate>` + parts, no wrappers yet. Judged on the
 * owner's design direction — light ground, near-black ink, the warm-red
 * accent and nothing else. Dark-ground correctness is a jsdom capability
 * test, never a demo card.
 */

import { Cap, Dial, Hand, Mainplate, Ticks } from "@/mainplate/faces"
import { useWatchSource } from "@/mainplate/time"
import { LabNav, ScratchNotice } from "../nav"

/** The zero-composition target: dial, ticks, three hands, cap — all live. */
function SweepFace() {
  const clock = useWatchSource()
  return (
    <Mainplate label="Analog clock, gliding seconds" className="w-56">
      <Dial />
      <Ticks />
      <Hand value={clock.hour} type="hour" />
      <Hand value={clock.minute} type="minute" />
      <Hand value={clock.second} type="second" />
      <Cap />
    </Mainplate>
  )
}

/** The stepping quartz hand — the transition + unwrap path, live at :59 → :00. */
function TickFace() {
  const clock = useWatchSource({ second: "tick" })
  return (
    <Mainplate label="Analog clock, stepping seconds" className="w-56">
      <Dial />
      <Ticks />
      <Hand value={clock.hour} type="hour" />
      <Hand value={clock.minute} type="minute" />
      <Hand value={clock.second} type="second" tick />
      <Cap />
    </Mainplate>
  )
}

/** Quarters variant, no seconds — the quiet face. */
function QuartersFace() {
  const clock = useWatchSource()
  return (
    <Mainplate label="Analog clock, quarter marks" className="w-56">
      <Dial />
      <Ticks variant="quarters" />
      <Hand value={clock.hour} type="hour" />
      <Hand value={clock.minute} type="minute" />
      <Cap />
    </Mainplate>
  )
}

/** A controlled needle over a custom domain — the gauge posture, statically. */
function NeedleFace() {
  return (
    <Mainplate label="Reading: 68 of 100" className="w-56">
      <Dial />
      <Ticks variant="quarters" />
      <Hand value={68} min={0} max={100} startAngle={-135} sweepAngle={270} variant="taper" />
      <Cap />
    </Mainplate>
  )
}

const CARD = "rounded-3xl border border-zinc-200 bg-white p-8 text-zinc-900 shadow-sm"

export default function FacesLab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — the face core
      </h1>
      <LabNav current="/lab/faces" />
      <ScratchNotice />
      <p className="mt-2 text-[10px] tracking-wide uppercase opacity-40">build 1</p>

      <h2 className="mt-10 text-xs font-medium tracking-wide uppercase opacity-50">
        bare mainplate + parts
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <SweepFace />
          <p className="mt-4 text-center text-xs text-zinc-600">sweep</p>
        </div>
        <div className={CARD}>
          <TickFace />
          <p className="mt-4 text-center text-xs text-zinc-600">tick — watch :59 → :00</p>
        </div>
        <div className={CARD}>
          <QuartersFace />
          <p className="mt-4 text-center text-xs text-zinc-600">quarters</p>
        </div>
        <div className={CARD}>
          <NeedleFace />
          <p className="mt-4 text-center text-xs text-zinc-600">controlled, 270° sweep</p>
        </div>
      </div>
    </main>
  )
}
