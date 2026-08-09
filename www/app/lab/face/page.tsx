"use client"

/**
 * The integration face: one chronograph using every primitive the library has —
 * `<Dial>`, `<Ticks>`, `<Numerals>`, `<Hand>` (controlled and Source-driven),
 * `<Arc>` (static, frame-anchored, and Source-driven), `<Subdial>`, `<Place>`.
 * Built as the first consumer-shaped use of everything at once; if two
 * primitives disagree, this page is where it shows.
 *
 * Client, because the running chronograph is a `Source` — an object of
 * closures, which cannot cross the RSC boundary.
 */
import { useEffect } from "react"
import {
  Arc,
  createSource,
  Dial,
  Hand,
  Mainplate,
  Numerals,
  Place,
  Subdial,
  Ticks,
} from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"

/**
 * Elapsed chronograph seconds, 0–60. Module scope, so the server and the first
 * client render both read the same 0 — no hydration mismatch — and the object's
 * identity is stable across renders, so subscriptions never churn.
 */
const elapsed = createSource(0, { min: 0, max: 60 })

const PLATE = "oklch(0.21 0.006 285)"
const EDGE = "oklch(0.34 0.008 285)"
const FAINT = "oklch(0.48 0.01 285)"
const MID = "oklch(0.72 0.01 285)"
const INK = "oklch(0.92 0.01 95)"
const ACCENT = "oklch(0.8 0.13 78)"
const WELL = "oklch(0.13 0.005 285)"

const ROLES: readonly { primitive: string; role: string }[] = [
  { primitive: "<Dial>", role: "the plate, and both subdial wells — fill-only, at the outline" },
  {
    primitive: "<Arc>",
    role: "the elapsed ring (Source-driven `to`), its grey track, and the frame-anchored redline band under the last quarter",
  },
  { primitive: "<Ticks>", role: "the two-tier minute track, and both subdial tracks" },
  {
    primitive: "<Numerals>",
    role: "the chapter ring and the totaliser's 10/20/30, both solved with track + clearance",
  },
  {
    primitive: "<Hand>",
    role: "hour (local max={12} override), minute, Source-driven chrono seconds, one per subdial",
  },
  {
    primitive: "<Subdial>",
    role: "running seconds at 9h, 30-minute totaliser at 3h — every child renders unchanged inside",
  },
  { primitive: "<Place>", role: "the wordmark at 12h and the legend at 6h" },
]

export default function FaceLab() {
  // No animation primitives yet — a bare interval at tick cadence writes the
  // source, and the chrono hand and elapsed arc subscribe. Zero React renders.
  useEffect(() => {
    const id = setInterval(() => {
      elapsed.set((Math.round((elapsed.get() + 0.2) * 10) / 10) % 60)
    }, 200)
    return () => clearInterval(id)
  }, [])

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — face
      </h1>
      <LabNav current="/lab/face" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        One chronograph, every primitive. The main frame is 0–60 seconds; the hour hand overrides it
        locally with <code>max={"{12}"}</code>, the registers re-establish it entirely. The chrono
        seconds hand and the amber elapsed ring share one <code>Source</code> written at tick
        cadence — the hand rotates on the compositor, the arc rewrites its path, and neither
        re-renders the page.
      </p>

      <div className="mt-8 flex flex-wrap items-start gap-12">
        <figure>
          <Mainplate size={360} max={60} label="Chronograph, every primitive on one face">
            <Dial fill={PLATE} />

            {/* Frame-anchored redline band under the last quarter's ticks. */}
            <Arc from={45} to={60} r={91} strokeWidth={10} stroke={ACCENT} strokeOpacity={0.25} />

            <Ticks
              inset={4}
              align="inside"
              tiers={[
                { every: 1, length: 4, width: 0.8, fill: FAINT },
                { every: 5, length: 10, width: 2.2, fill: INK },
              ]}
            />

            {/* Solved numerals: every label's ink holds 3 units from the
                five-tick inner ends at r 86. from={5} keeps the top label 60,
                not 0 — a full-turn population would draw 0 there instead.
                skip={[15, 45]}: the registers sit where those labels would,
                and a subdial paints over anything drawn before it — the labels
                were half-hidden until skipped, exactly as on a real
                chronograph, which omits them there too. */}
            <Numerals
              tiers={[{ every: 5 }]}
              from={5}
              to={60}
              skip={[15, 45]}
              track={{ r: 86, width: 2.2 }}
              clearance={3}
              fontSize={10}
              fill={MID}
            />

            {/* The elapsed ring: a static outline-anchored track, and a live
                fill whose `to` is the source. */}
            <Arc inset={1.5} strokeWidth={1.2} stroke={EDGE} />
            <Arc from={0} to={elapsed} inset={1.5} strokeWidth={1.2} stroke={ACCENT} />

            <Subdial at="9h" inset={50} r={26} min={0} max={60} label="Running seconds">
              <Dial fill={WELL} />
              <Ticks count={12} inset={5} length={9} width={2} align="inside" fill={FAINT} />
              <Hand value={42} length={80} tail={16} width={5} fill={INK} />
              <circle r={4} fill={INK} />
            </Subdial>

            <Subdial at="3h" inset={50} r={26} min={0} max={30} label="30-minute totaliser">
              <Dial fill={WELL} />
              <Ticks
                inset={5}
                align="inside"
                tiers={[
                  { every: 1, length: 5, width: 1.2, fill: FAINT },
                  { every: 5, length: 10, width: 2.6, fill: MID },
                ]}
              />
              <Numerals
                tiers={[{ every: 10 }]}
                from={10}
                to={30}
                track={{ r: 85, width: 2.6 }}
                clearance={5}
                fontSize={20}
                fill={MID}
              />
              <Hand value={8} length={70} tail={14} width={6} fill={ACCENT} />
              <circle r={4} fill={ACCENT} />
            </Subdial>

            <Place at="12h" inset={38} fill={INK}>
              <text fontSize={8.5} letterSpacing={1} textAnchor="middle" dominantBaseline="central">
                mainplate
              </text>
            </Place>
            <Place at="6h" inset={38} fill={MID}>
              <text
                fontSize={4.5}
                letterSpacing={1.5}
                textAnchor="middle"
                dominantBaseline="central"
              >
                CHRONOGRAPH
              </text>
            </Place>

            {/* Hour and minute read 10:51 — the hour hand's local max={12}
                override maps 10.85 onto the same 0–60 frame the minute reads. */}
            <Hand value={10.85} max={12} length={50} tail={10} width={7} fill={INK} />
            <Hand value={51} length={76} tail={12} width={5} fill={INK} />
            <Hand value={elapsed} length={92} tail={22} width={1.8} fill={ACCENT} />
            <circle r={3.5} fill={ACCENT} />
          </Mainplate>
          <figcaption className="mt-3 max-w-[46ch] text-xs text-dim">
            Running seconds at 9, thirty-minute totaliser at 3, chrono seconds and the elapsed ring
            off one shared source.
          </figcaption>
        </figure>

        <div className="max-w-[52ch]">
          <h2 className="text-xs font-medium tracking-wide text-dim uppercase">
            which primitive does what
          </h2>
          <table className="mt-3 text-xs">
            <tbody>
              {ROLES.map((row) => (
                <tr key={row.primitive} className="align-top">
                  <td className="pr-4 pb-2 whitespace-nowrap">
                    <code className="text-ink">{row.primitive}</code>
                  </td>
                  <td className="pb-2 leading-relaxed text-dim">{row.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
