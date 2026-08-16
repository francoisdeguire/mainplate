"use client"

/**
 * The faces lab: tier 1 first — `<Clock/>` and `<Gauge value={n}/>` with no
 * other props, which is the bar the whole library is judged on — then the bare
 * core they are built from. Light ground, near-black ink, one warm-red accent,
 * per the owner's design direction. Dark-ground correctness is a jsdom
 * capability test, never a demo card.
 */

import { useState } from "react"
import { Cap, Clock, Dial, Gauge, Hand, Mainplate, Numerals, Ticks } from "@/mainplate/faces"
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

/** The controlled path, driven by hand: the needle glides to each new value. */
function SliderGauge() {
  const [value, setValue] = useState(72)
  return (
    <div className="flex flex-col items-center gap-4">
      <Gauge value={value} max={220} redline={[180, 220]} label="Speed" className="w-56" />
      <input
        type="range"
        min={0}
        max={220}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        className="w-56 accent-red-600"
        aria-label="Speed input"
      />
    </div>
  )
}

/**
 * Dual time: two hour hands on one face, a zone each.
 *
 * Two `useWatchSource` calls give two independent sets of sources; each `<Hand>`
 * carries its own domain, so nothing on the face restates a `max`. The second
 * zone's hand is distinguished by **weight and reach, never by a second colour**
 * — `variant="line"` thins it to a hairline and `long` sends it past the local
 * hour hand's tip. Ink and the one warm red, as everywhere else.
 */
function DualTimeFace() {
  const local = useWatchSource()
  const zurich = useWatchSource({ timezone: "Europe/Zurich" })
  return (
    <Mainplate label="Dual time: local and Zurich" className="w-56">
      <Dial />
      <Ticks />
      <Numerals variant="quarters" />
      {/* Under the local hands: DOM order is z-order. */}
      <Hand value={zurich.hour} type="hour" variant="line" long />
      <Hand value={local.hour} type="hour" />
      <Hand value={local.minute} type="minute" />
      <Hand value={local.second} type="second" />
      <Cap />
    </Mainplate>
  )
}

/**
 * The same idea with a real GMT hand: `hour24`'s own domain is 0–24, so one
 * revolution is a day — and the hand states no `min`/`max` at all, because
 * `source.domain` beats the `type="hour"` preset (§8.10). The open-ring tip is
 * `children` artwork: the box keeps pivot and rotation, the children own the look.
 */
function GmtFace() {
  const local = useWatchSource()
  const tokyo = useWatchSource({ timezone: "Asia/Tokyo" })
  return (
    <Mainplate label="GMT: local, with Tokyo on a 24-hour hand" className="w-56">
      <Dial />
      <Ticks />
      <Numerals variant="quarters" />
      <Hand value={tokyo.hour24} type="hour" long>
        <div className="absolute inset-0 flex flex-col items-center">
          <div
            className="rounded-full"
            style={{
              width: "2.9cqw",
              height: "2.9cqw",
              border: "0.55cqw solid var(--mp-ink)",
              boxSizing: "border-box",
              flex: "none",
            }}
          />
          <div
            style={{
              width: "0.7cqw",
              flex: 1,
              marginTop: "-0.3cqw",
              background: "var(--mp-ink)",
            }}
          />
        </div>
      </Hand>
      <Hand value={local.hour} type="hour" />
      <Hand value={local.minute} type="minute" />
      <Hand value={local.second} type="second" />
      <Cap />
    </Mainplate>
  )
}

/** One reading, three domains — the whole claim of this section, held still. */
function DomainTrio() {
  return (
    <Mainplate label="One reading through three domains" className="w-56">
      <Dial />
      <Ticks variant="quarters" />
      <Hand value={5} max={60} />
      <Hand value={5} max={30} variant="line" long />
      <Hand value={5} type="hour" />
      <Cap />
    </Mainplate>
  )
}

/** The frozen 10:09:36 pose — the numeral row is judged on shape, not on time. */
const POSE = new Date("2026-01-15T10:09:36Z")

const CARD = "rounded-3xl border border-zinc-200 bg-white p-8 text-zinc-900 shadow-sm"
const NOTE = "mt-4 text-center text-xs text-zinc-600"
const SECTION = "mt-10 text-xs font-medium tracking-wide uppercase opacity-50"

export default function FacesLab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — the face core
      </h1>
      <LabNav current="/lab/faces" />
      <ScratchNotice />
      <p className="mt-2 text-[10px] tracking-wide uppercase opacity-40">build 2</p>

      <h2 className={SECTION}>tier 1 — the zero-props bar</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <Clock className="w-56" />
          <p className={NOTE}>{"<Clock />"}</p>
        </div>
        <div className={CARD}>
          <Clock second="tick" className="w-56" />
          <p className={NOTE}>{'<Clock second="tick" /> — watch :59 → :00'}</p>
        </div>
        <div className={CARD}>
          <Gauge value={72} className="w-56" />
          <p className={NOTE}>{"<Gauge value={72} />"}</p>
        </div>
      </div>

      <h2 className={SECTION}>tier 1 — the gauge's own props</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <Gauge value={72} max={220} redline={[180, 220]} label="Speed" className="w-56" />
          <p className={NOTE}>redline 180–220</p>
        </div>
        <div className={CARD}>
          <Gauge value={64} indicator="sweep" label="Battery" className="w-56" />
          <p className={NOTE}>{'indicator="sweep"'}</p>
        </div>
        <div className={CARD}>
          <SliderGauge />
          <p className={NOTE}>controlled — every change glides</p>
        </div>
      </div>

      <h2 className={SECTION}>clock props</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <Clock timezone="Asia/Tokyo" ticks="quarters" second="none" className="w-56" />
          <p className={NOTE}>Tokyo, quarters, no seconds</p>
        </div>
        <div className={CARD}>
          <Clock numerals="none" className="w-56" />
          <p className={NOTE}>{'numerals="none" — hands reach further'}</p>
        </div>
        <div className={CARD}>
          <Clock time={new Date("2026-01-15T10:09:36Z")} timezone="UTC" className="w-56" />
          <p className={NOTE}>{"time — the frozen 10:09:36 pose"}</p>
        </div>
        <div className={CARD}>
          <Clock className="w-56">
            <Hand type="second" variant="line" className="opacity-70" />
          </Clock>
          <p className={NOTE}>slot: the seconds hand, restyled</p>
        </div>
      </div>

      <h2 className={SECTION}>numerals — one word turns the track</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <Clock time={POSE} timezone="UTC" ticks="quarters" className="w-56" />
          <p className={NOTE}>{'orient="upright" — the default'}</p>
        </div>
        <div className={CARD}>
          <Clock time={POSE} timezone="UTC" ticks="quarters" className="w-56">
            <Numerals orient="tangential" />
          </Clock>
          <p className={NOTE}>{'orient="tangential" — the axis on the tangent'}</p>
        </div>
        <div className={CARD}>
          <Clock time={POSE} timezone="UTC" numerals="roman" ticks="quarters" className="w-56">
            <Numerals variant="roman" orient="radial" />
          </Clock>
          <p className={NOTE}>{'roman, orient="radial" — IIII, wrapped'}</p>
        </div>
        <div className={CARD}>
          <Clock time={POSE} timezone="UTC" numerals="quarters" className="w-56" />
          <p className={NOTE}>{'numerals="quarters" — 12/3/6/9'}</p>
        </div>
      </div>

      <h2 className={SECTION}>multiple hands — a domain each</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <DualTimeFace />
          <p className={NOTE}>two hour hands, two zones — the hairline is Zurich</p>
        </div>
        <div className={CARD}>
          <GmtFace />
          <p className={NOTE}>{"Tokyo on a 24-hour hand: hour24's own domain, zero props"}</p>
        </div>
        <div className={CARD}>
          <DomainTrio />
          <p className={NOTE}>{"value 5 through 0-60, 0-30 and 0-12 → 30°, 60°, 150°"}</p>
        </div>
      </div>

      <h2 className={SECTION}>the bare core</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <SweepFace />
          <p className={NOTE}>Mainplate + parts, sweep</p>
        </div>
        <div className={CARD}>
          <QuartersFace />
          <p className={NOTE}>Mainplate + parts, quarters</p>
        </div>
      </div>
    </main>
  )
}
