"use client"

/**
 * The Tank, and the control it is a control for. Two faces run the same
 * component on the same case: one with `placement="perimeter"` (the shipped
 * Tank), one radial, so the difference the thesis rests on is a thing you look
 * at rather than a paragraph you read.
 *
 * Scratch. Plan 4 deletes `www/app/lab` entirely.
 */
import { useState } from "react"
import { Mainplate, Ticks } from "@/mainplate/core"
import { Tank, tankTheme } from "@/mainplate/examples/tank"
import { LabNav, ScratchNotice } from "../nav"

const CASE = { kind: "rect", ratio: 0.78, radius: 12 } as const

export default function TankLab() {
  const [hour, setHour] = useState(10.15)
  const [minute, setMinute] = useState(9)

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — tank
      </h1>
      <LabNav current="/lab/tank" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        A railway minute track on a rectangle — the one demo that is not expressible in a library
        that thinks a dial is a circle. The frame answers <em>given a value, what angle</em>; the
        outline answers <em>given an angle, where is the edge</em>. The ties below divide the case
        by arc length, the numerals by angle, and both come out of the same population code.
      </p>

      <label className="mt-6 flex max-w-sm items-center gap-3 text-xs text-dim">
        <span className="w-20 whitespace-nowrap tabular-nums">
          {Math.floor(hour) === 0 ? 12 : Math.floor(hour) % 12}:
          {String(Math.floor(minute)).padStart(2, "0")}
        </span>
        <input
          type="range"
          min={0}
          max={720}
          value={Math.round(hour * 60)}
          onChange={(e) => {
            const minutes = Number(e.target.value)
            setHour(minutes / 60)
            setMinute(minutes % 60)
          }}
          className="w-full"
        />
      </label>

      <div className="mt-8 flex flex-wrap items-start gap-12">
        <figure>
          <Tank hour={hour} minute={minute} size={300} />
          <figcaption className="mt-3 max-w-[42ch] text-xs text-dim">
            The face itself. Sixty ties between two rails, both rails being the outline at an inset
            rather than an inscribed circle; Roman numerals set radially off the same outline.
          </figcaption>
        </figure>

        <figure>
          <Mainplate
            size={300}
            outline={CASE}
            min={0}
            max={60}
            label="Perimeter placement, isolated"
            style={{ color: tankTheme.chapter, background: tankTheme.dial }}
          >
            <Ticks
              count={60}
              placement="perimeter"
              orient="edge"
              inset={5}
              align="inside"
              length={6}
              width={0.8}
            />
          </Mainplate>
          <figcaption className="mt-3 max-w-[42ch] text-xs text-dim">
            <code>placement=&quot;perimeter&quot;</code> — evenly divided by arc length. The widest
            gap is exactly one sixtieth of the perimeter, corners included.
          </figcaption>
        </figure>

        <figure>
          <Mainplate
            size={300}
            outline={CASE}
            min={0}
            max={60}
            label="Radial placement, isolated"
            style={{ color: tankTheme.chapter, background: tankTheme.dial }}
          >
            <Ticks count={60} orient="edge" inset={5} align="inside" length={6} width={0.8} />
          </Mainplate>
          <figcaption className="mt-3 max-w-[42ch] text-xs text-dim">
            The default, <code>placement=&quot;radial&quot;</code>, on the same case with the same
            sixty values. Equal angular steps bunch at the perpendicular feet and stretch away from
            them — two to one across this rectangle.
          </figcaption>
        </figure>
      </div>
    </main>
  )
}
