"use client"

/**
 * The faces lab: tier 1 first — `<Clock/>` and `<Gauge value={n}/>` with no
 * other props, which is the bar the whole library is judged on — then the bare
 * core they are built from. Light ground, near-black ink, one warm-red accent,
 * per the owner's design direction. Dark-ground correctness is a jsdom
 * capability test, never a demo card.
 */

import { useEffect, useState } from "react"
import { createSource } from "@/mainplate/core"
import {
  Arc,
  Cap,
  Clock,
  Complication,
  Dial,
  Gauge,
  Hand,
  Mainplate,
  Numerals,
  Ticks,
} from "@/mainplate/faces"
import { DateWindow } from "@/mainplate/faces/date-window"
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
 * Dual time: two hour hands on one face, a zone each — inside `<Clock>`.
 *
 * A slot claims the FIRST child that fits it: the bare `<Hand type="hour"/>` takes
 * the hour slot and stays wired to the clock's own reading, and the second one is
 * an ordinary free child keeping its own source, its own domain and its own look.
 * The second zone is distinguished by **weight and reach, never by a second colour**
 * — `variant="line"` thins it to a hairline, `long` sends it past the local hour
 * hand's tip. Ink and the one warm red, as everywhere else.
 */
function DualTimeFace() {
  const zurich = useWatchSource({ timezone: "Europe/Zurich" })
  return (
    <Clock numerals="quarters" label="Dual time: local and Zurich" className="w-56">
      <Hand type="hour" />
      <Hand value={zurich.hour} type="hour" variant="line" long />
    </Clock>
  )
}

/**
 * The same idea with a real GMT hand: `hour24`'s own domain is 0–24, so one
 * revolution is a day — and the hand states no `min`/`max` at all, because
 * `source.domain` beats the `type="hour"` preset (§8.10). The open-ring tip is
 * `children` artwork: the box keeps pivot and rotation, the children own the look.
 * Weight alone would not have said "different hand" loudly enough here.
 */
function GmtFace() {
  const tokyo = useWatchSource({ timezone: "Asia/Tokyo" })
  return (
    <Clock numerals="quarters" label="GMT: local, with Tokyo on a 24-hour hand" className="w-56">
      <Hand type="hour" />
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
    </Clock>
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

/** The one line a track writes to reach the prominent ramp. */
const MAJOR_INK = { background: "var(--mp-tick-major)" }

/**
 * The classic minute+hour layout, written out: a 60-mark track with a hole
 * every fifth minute, and a 12-mark track standing in the holes. This is what
 * replaced `tiers` — two elements, no merge rule.
 */
function StackedTracks() {
  const clock = useWatchSource()
  return (
    <Mainplate label="Stacked tick tracks: minutes and hours" className="w-56">
      <Dial />
      <Ticks count={60} skip={(v) => v % 5 === 0} />
      <Ticks count={12} length={9} width={2.4} style={MAJOR_INK} />
      <Hand value={clock.hour} type="hour" />
      <Hand value={clock.minute} type="minute" />
      <Cap />
    </Mainplate>
  )
}

/** Three tracks, two skips: minutes, hours-minus-quarters, and the quarters. */
function ThreeTracks() {
  return (
    <Mainplate label="Three tick tracks" className="w-56">
      <Dial />
      <Ticks count={60} skip={(v) => v % 5 === 0} />
      <Ticks count={12} skip={(v) => v % 3 === 0} length={8} width={2} style={MAJOR_INK} />
      <Ticks count={4} length={13} width={3} style={MAJOR_INK} />
      <Cap />
    </Mainplate>
  )
}

/** `render` per mark: the box keeps its place, the child is the mark. */
function DiamondTrack() {
  return (
    <Mainplate label="Diamond indices" className="w-56">
      <Dial />
      <Ticks count={60} skip={(v) => v % 5 === 0} />
      <Ticks
        count={12}
        length={5.5}
        width={5.5}
        render={() => (
          <div
            className="size-full rotate-45"
            style={{ background: "var(--mp-tick-major)", borderRadius: "0.4cqw" }}
          />
        )}
      />
      <Cap />
    </Mainplate>
  )
}

/**
 * `values` — the non-uniform scale. A log-ish instrument: the marks are stated
 * outright, so they cluster where the domain does. No `count` or `every` can
 * say this, and populating 1–100 to skip 93 of it is a workaround.
 */
function ValuesTrack() {
  return (
    <Mainplate label="A non-uniform scale" className="w-56">
      <Dial />
      <Ticks
        values={[1, 2, 5, 10, 20, 50, 100]}
        from={1}
        to={100}
        startAngle={-135}
        sweepAngle={270}
        length={9}
        width={2.4}
        style={MAJOR_INK}
      />
      <Hand value={20} min={1} max={100} startAngle={-135} sweepAngle={270} long />
      <Cap />
    </Mainplate>
  )
}

/**
 * Content mode: a wordmark under 12. The complication positions the text on
 * the outer face — no nested context, no new concepts, one element.
 */
function BrandFace() {
  return (
    <Clock ticks="quarters" numerals="none" label="Clock with a wordmark" className="w-56">
      <Complication at="12h" inset={34}>
        <div
          style={{
            fontSize: "4.2cqw",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            color: "var(--mp-numeral)",
          }}
        >
          mainplate
        </div>
      </Complication>
    </Clock>
  )
}

/**
 * The animated date window at 3 o'clock — content mode holding lab's rolling
 * number. The button drives it: old digit out the top, new in from below,
 * one 200ms translateY transition (instant under reduced motion).
 */
function DateWindowClock() {
  const [day, setDay] = useState(14)
  return (
    <div className="flex flex-col items-center gap-4">
      <Clock numerals="none" label="Clock with a date window" className="w-56">
        <Complication at="3h" inset={26}>
          <DateWindow value={day} />
        </Complication>
      </Clock>
      <button
        type="button"
        onClick={() => setDay((d) => (d % 31) + 1)}
        className="rounded-full border border-zinc-300 px-4 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
      >
        advance the date
      </button>
    </div>
  )
}

/**
 * Context mode: a running-seconds register at 6 — the chronograph layout,
 * zero additional API. `size={52}` (the register dial's diameter, in parent
 * units) re-establishes the face inside, so the register's ticks, hairline
 * hand and cap are the SAME parts, reading a fresh centre where the nominal
 * 200-unit dial spans 52 parent units.
 */
function RegisterClock() {
  const clock = useWatchSource()
  return (
    <Clock second="none" numerals="none" label="Clock with a seconds register" className="w-56">
      <Complication at="6h" inset={36} size={52}>
        {/* Chunkier than a root face's marks: the register is 52 parent units
            across, so dial-unit strokes come out proportionally finer (the
            Subdial contract) — at w-56 a default mark is sub-pixel. */}
        <Ticks count={12} length={9} width={3.5} style={MAJOR_INK} />
        <Hand value={clock.second} variant="line" long style={{ background: "var(--mp-accent)" }} />
        <Cap />
      </Complication>
    </Clock>
  )
}

/**
 * The arc part, bare: a static track and a live elapsed ring on the SAME
 * embedded `<svg>` — two `<Arc>`s, one layer, and the ring sweeps a full
 * minute at zero React commits because `to` is a `Source`.
 *
 * The whole minute is ink; the elapsed part is the face's one red.
 */
function ElapsedRing() {
  const [elapsed] = useState(() => createSource(0, { min: 0, max: 60 }))
  useEffect(() => {
    const start = performance.now()
    let frame = requestAnimationFrame(function loop() {
      elapsed.set(((performance.now() - start) / 1000) % 60)
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [elapsed])
  return (
    <Mainplate label="One minute elapsed" className="w-56">
      <Arc from={0} to={100} width={4} />
      <Arc from={0} to={elapsed} width={4} stroke="var(--mp-accent)" />
      <Ticks count={12} inset={18} length={5} width={1.4} />
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
      <p className="mt-2 text-[10px] tracking-wide uppercase opacity-40">build 5</p>

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
          <p className={NOTE}>{"inside <Clock> — the hairline is Zurich"}</p>
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

      <h2 className={SECTION}>tick tracks — stacked, with skip carving the holes</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <StackedTracks />
          <p className={NOTE}>{"count={60} skip={(v) => v % 5 === 0} + count={12}"}</p>
        </div>
        <div className={CARD}>
          <ThreeTracks />
          <p className={NOTE}>three tracks, two skips — minutes, hours, quarters</p>
        </div>
        <div className={CARD}>
          <DiamondTrack />
          <p className={NOTE}>{"render — the box keeps its place, the child is the mark"}</p>
        </div>
        <div className={CARD}>
          <Gauge value={72} max={220} label="Speed" className="w-56">
            <Ticks count={12} length={6} width={1.4} />
          </Gauge>
          <p className={NOTE}>a Ticks child replaces the graduations, keeping the sweep</p>
        </div>
        <div className={CARD}>
          <ValuesTrack />
          <p className={NOTE}>{"values={[1, 2, 5, 10, 20, 50, 100]} — stated outright"}</p>
        </div>
      </div>

      <h2 className={SECTION}>arcs — one shared svg layer per face</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <ElapsedRing />
          <p className={NOTE}>{"two <Arc>s, one <svg> — the ring's `to` is a Source"}</p>
        </div>
        <div className={CARD}>
          <Gauge value={72} max={220} redline={[180, 220]} label="Speed" className="w-56">
            <Arc
              from={140}
              to={150}
              max={220}
              startAngle={-135}
              sweepAngle={270}
              inset={3}
              width={2.5}
              stroke="var(--mp-ink)"
            />
          </Gauge>
          <p className={NOTE}>an added arc joins the gauge's own three on that layer</p>
        </div>
      </div>

      <h2 className={SECTION}>complications — positioned content and the nested face</h2>
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className={CARD}>
          <BrandFace />
          <p className={NOTE}>
            {'content mode: <Complication at="12h" inset={34}> — a text block'}
          </p>
        </div>
        <div className={CARD}>
          <DateWindowClock />
          <p className={NOTE}>{"the date window — a rolling number in an overflow-hidden frame"}</p>
        </div>
        <div className={CARD}>
          <RegisterClock />
          <p className={NOTE}>{'context mode: size={52} at "6h" — the same parts, re-based'}</p>
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
