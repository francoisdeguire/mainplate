"use client"

import { useEffect } from "react"
import { createSource, fmt, Mainplate, Ticks, useSourceValue, valueToAngle } from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"

const MIN = 0
const MAX = 220
const START = -135
const SWEEP = 270

/**
 * Module scope, so the source outlives any single render and the server and the
 * first client render both read the same 0 — no hydration mismatch.
 */
const speed = createSource(MIN, { min: MIN, max: MAX })

const PLATE = "oklch(0.21 0.006 285)"
const EDGE = "oklch(0.34 0.008 285)"
const FAINT = "oklch(0.48 0.01 285)"
const MID = "oklch(0.72 0.01 285)"
const ACCENT = "oklch(0.8 0.13 78)"

export default function Live() {
  useEffect(() => {
    let step = 0
    const id = setInterval(() => {
      step += 1
      speed.set(Math.round(110 + 105 * Math.sin(step / 22)))
    }, 90)
    return () => clearInterval(id)
  }, [])

  const value = useSourceValue(speed)
  const angle = valueToAngle(value, { min: MIN, max: MAX, startAngle: START, sweepAngle: SWEEP })

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — live
      </h1>
      <LabNav current="/lab/live" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        No animation primitives exist yet, and none are used here. A <code>createSource</code> at
        module scope, a <code>setInterval</code> in an effect writing to it, and{" "}
        <code>useSourceValue</code> reading it back. Everything below is downstream of that one
        number.
      </p>

      <div className="mt-8 flex flex-wrap items-start gap-12">
        <figure className="max-w-[320px]">
          <Mainplate
            size={300}
            padding={14}
            min={MIN}
            max={MAX}
            startAngle={START}
            sweepAngle={SWEEP}
            label={`Live speed, ${value} km/h`}
          >
            <circle r={100} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />

            {/* Function-valued fill: the mark nearest the current value lights up.
                Paint splits the merged path, so this face costs two <path> nodes
                rather than one — the cost model made visible. */}
            <Ticks
              inset={8}
              align="inside"
              fill={({ value: markValue }) => (Math.abs(markValue - value) <= 2.5 ? ACCENT : FAINT)}
              tiers={[
                { every: 5, length: 6, width: 1 },
                { every: 20, length: 14, width: 2.4 },
              ]}
            />

            <Ticks
              r={68}
              tiers={[{ every: 40 }]}
              renderItem={(mark) => (
                <text
                  x={fmt(mark.point.x)}
                  y={fmt(mark.point.y)}
                  fontSize={11}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={MID}
                >
                  {mark.value}
                </text>
              )}
            />

            {/* A hand, drawn by hand. Rotation via the CSS `rotate` property with
                transformBox: view-box, so the origin is the frame centre and the
                transform composes independently of any SVG `transform`. */}
            <g transform="translate(0 0)">
              <g
                style={{
                  rotate: `${angle}deg`,
                  transformBox: "view-box",
                  transformOrigin: "0 0",
                }}
              >
                <rect x={-1.7} y={-82} width={3.4} height={92} rx={1.7} fill={ACCENT} />
              </g>
            </g>
            <circle r={5} fill={PLATE} stroke={ACCENT} strokeWidth={1.2} />
          </Mainplate>
          <figcaption className="mt-3 text-xs text-dim">
            One source, three consumers: the highlighted tick, the hand&rsquo;s angle, and the
            readout.
          </figcaption>
        </figure>

        <div>
          <h2 className="text-xs font-medium tracking-wide text-dim uppercase">readout</h2>
          <p className="mt-2 text-6xl tabular-nums">
            {value}
            <span className="ml-2 text-sm text-dim">km/h</span>
          </p>
          <p className="mt-1 text-xs text-dim tabular-nums">
            angle {angle.toFixed(1)}° · t {((value - MIN) / (MAX - MIN)).toFixed(3)}
          </p>
          <pre className="mt-6 overflow-x-auto border border-line bg-plate p-4 text-xs leading-relaxed">
            <code>{SNIPPET}</code>
          </pre>
        </div>
      </div>
    </main>
  )
}

const SNIPPET = `const speed = createSource(0, { min: 0, max: 220 })

useEffect(() => {
  const id = setInterval(() => speed.set(next()), 90)
  return () => clearInterval(id)
}, [])

const value = useSourceValue(speed)`
