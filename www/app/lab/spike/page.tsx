"use client"

/**
 * Tier-1 spike acceptance page — three targets from the direction doc:
 * 1. the zero-props default (must be screenshot-good bare),
 * 2. the Meridian recreation (shape + complications + line hand),
 * 3. the gauges (needle, progress ring, fuel wedge).
 *
 * Scratch. Plan 4 deletes `www/app/lab` entirely.
 */

import { useEffect, useState } from "react"
import { createSource } from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"
import { SpikeClock, SpikeComplication, SpikeGauge, SpikeInscription } from "./face"

const speed = createSource(148, { min: 0, max: 220 })

/** Faux Meridian complications — placeholders shaped like the reference. */
function DateComp() {
  return (
    <div className="flex size-[15cqw] flex-col items-center justify-center rounded-full bg-zinc-900 text-white ring-[0.8cqw] ring-amber-950/60">
      <span className="text-[5cqw] leading-none font-semibold">24</span>
      <span className="text-[2.6cqw] font-semibold tracking-wide text-red-400">THU</span>
    </div>
  )
}

function AqiComp() {
  return (
    <div
      className="flex size-[15cqw] items-center justify-center rounded-full bg-zinc-900 text-white"
      style={{
        backgroundImage:
          "conic-gradient(from 220deg, #22c55e, #eab308, #f97316, #a855f7, #22c55e 78%, transparent 78%)",
      }}
    >
      <div className="flex size-[11.5cqw] flex-col items-center justify-center rounded-full bg-zinc-900">
        <span className="text-[4.6cqw] leading-none font-semibold">35</span>
        <span className="text-[2.4cqw] font-semibold text-green-400">AQI</span>
      </div>
    </div>
  )
}

function RingsComp() {
  return (
    <div className="flex size-[15cqw] items-center justify-center rounded-full bg-zinc-900">
      <div className="grid size-[11cqw] place-items-center rounded-full border-[1.1cqw] border-red-500">
        <div className="grid size-[7.2cqw] place-items-center rounded-full border-[1.1cqw] border-lime-400">
          <div className="size-[3.4cqw] rounded-full border-[1.1cqw] border-cyan-400" />
        </div>
      </div>
    </div>
  )
}

function IconComp() {
  return (
    <div className="grid size-[15cqw] place-items-center rounded-full bg-zinc-950 text-white/90 ring-[0.6cqw] ring-white/15">
      <div className="size-[6cqw] rounded-[1.4cqw] border-[0.9cqw] border-current" />
    </div>
  )
}

export default function SpikeLab() {
  const [progress, setProgress] = useState(68)
  const [fuel, setFuel] = useState(62)

  useEffect(() => {
    const id = setInterval(() => {
      speed.set(148 + Math.sin(Date.now() / 1700) * 46)
    }, 90)
    return () => clearInterval(id)
  }, [])

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — tier-1 spike
      </h1>
      <LabNav current="/lab/spike" />
      <ScratchNotice />

      <h2 className="mt-10 text-xs font-medium tracking-wide uppercase opacity-50">
        1 — the zero-props bar
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-10">
        <div className="rounded-3xl bg-zinc-100 p-8 text-zinc-900 shadow-xl">
          <SpikeClock className="w-56" />
        </div>
        <div className="rounded-3xl bg-zinc-900 p-8 text-zinc-100 shadow-xl">
          <SpikeClock className="w-56" second="tick" />
        </div>
        <div className="rounded-3xl bg-zinc-100 p-8 shadow-xl">
          <SpikeClock className="w-56" color="oklch(0.45 0.16 264)" numerals="roman">
            <SpikeInscription at="12h" inset={36} fontSize={5.5}>
              AUTOMATIC
            </SpikeInscription>
            <SpikeInscription at="6h" inset={12} fontSize={4.5}>
              SWISS MADE
            </SpikeInscription>
          </SpikeClock>
        </div>
      </div>

      <h2 className="mt-14 text-xs font-medium tracking-wide uppercase opacity-50">
        2 — meridian (shape + complications)
      </h2>
      <div className="mt-4 flex flex-wrap items-end gap-10">
        <div className="rounded-[3rem] bg-zinc-200 p-6 shadow-xl">
          <SpikeClock
            className="w-72 text-zinc-900"
            shape={{ ratio: 0.82, radius: 30 }}
            numerals="none"
          >
            <SpikeComplication at="12h" inset={36}>
              <DateComp />
            </SpikeComplication>
            <SpikeComplication at="3h" inset={36}>
              <AqiComp />
            </SpikeComplication>
            <SpikeComplication at="6h" inset={36}>
              <RingsComp />
            </SpikeComplication>
            <SpikeComplication at="9h" inset={36}>
              <IconComp />
            </SpikeComplication>
          </SpikeClock>
        </div>
      </div>

      <h2 className="mt-14 text-xs font-medium tracking-wide uppercase opacity-50">
        3 — gauges: needle, ring, wedge
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-10">
        <div className="rounded-3xl bg-zinc-900 p-8 text-zinc-100 shadow-xl">
          <SpikeGauge
            className="w-52"
            value={speed}
            max={220}
            redline={[180, 220]}
            unit="km/h"
            label="Speed"
          />
        </div>
        <div className="rounded-3xl bg-zinc-100 p-8 text-zinc-900 shadow-xl">
          <SpikeGauge
            className="w-52"
            value={progress}
            indicator="sweep"
            color="oklch(0.55 0.2 155)"
            format={(v) => `${Math.round(v)}%`}
            label="Progress"
          />
        </div>
        <div className="rounded-3xl bg-zinc-100 p-8 text-zinc-900 shadow-xl">
          <SpikeGauge
            className="w-52"
            value={fuel}
            indicator="sweep"
            sweepVariant="wedge"
            sweep={180}
            color="oklch(0.6 0.15 60)"
            format={(v) => `${Math.round(v)}%`}
            unit="fuel"
            label="Fuel"
          />
        </div>
      </div>
      <div className="mt-6 flex gap-6 text-xs opacity-70">
        <label className="flex items-center gap-2">
          progress
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-2">
          fuel
          <input
            type="range"
            min={0}
            max={100}
            value={fuel}
            onChange={(e) => setFuel(Number(e.target.value))}
          />
        </label>
      </div>
    </main>
  )
}
