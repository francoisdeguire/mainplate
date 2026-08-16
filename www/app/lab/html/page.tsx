"use client"

/**
 * HTML renderer prototype — the same clock, no SVG anywhere.
 *
 * The bet under test: mainplate's value is the math (frame: value → angle,
 * outline: angle → point/normal) and the Source scheduling, not the SVG
 * elements. Here ticks and numerals are absolutely-positioned divs placed by
 * `polar()` from core, and the hands are divs whose `transform` is written
 * through a ref by the same `useWatchSource` sources the diver uses — zero
 * React renders per frame, same as the SVG `<Hand>`.
 *
 * What HTML buys, on display below: box-shadows straight from Tailwind on the
 * hands, an inset shadow recessing the dial (inexpressible in SVG without
 * filter primitives), real text numerals, and the whole face restyled by
 * swapping class strings — the second clock is the same component wearing
 * different utilities.
 *
 * What HTML costs, also on display: ~75 DOM nodes per face where the SVG tank
 * spends 2 merged paths on its 60 ticks.
 *
 * Scratch. Plan 4 deletes `www/app/lab` entirely.
 */

import { type RefObject, useEffect, useRef } from "react"
import { dialPercent, polar, type Source } from "@/mainplate/core"
import { useWatchSource } from "@/mainplate/time"
import { LabNav, ScratchNotice } from "../nav"

/** px per dial unit at a given css size — mainplate's own 220-unit lattice. */
const unitsOf = (size: number) => size / 220

/**
 * Quantise a px value before it enters an inline style. Same rule as core's
 * `fmt`: a raw float serialises differently on the server and in the browser,
 * and that difference is a hydration mismatch.
 */
const px = (n: number) => Math.round(n * 100) / 100

/**
 * Subscribe a hand element to a source and write its rotation through the
 * ref — the HTML twin of `<Hand>`'s live path. The translate half of the
 * transform is constant per hand (it parks the pivot on the dial centre), so
 * the whole string is rewritten each update.
 */
function useHandRotation(
  source: Source<number>,
  ref: RefObject<HTMLDivElement | null>,
  translate: string,
) {
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const min = source.domain?.min ?? 0
    const max = source.domain?.max ?? 60
    const write = () => {
      const angle = ((source.get() - min) / (max - min)) * 360
      el.style.transform = `${translate} rotate(${Math.round(angle * 1000) / 1000}deg)`
    }
    write()
    return source.subscribe(write)
  }, [source, ref, translate])
}

/**
 * A hand as a rounded div. `length`/`tail`/`width` are dial units, exactly
 * the built-in `<Hand>`'s vocabulary; the pivot lands on the centre via a
 * percentage translate, the trick every HTML clock uses.
 */
function HtmlHand({
  source,
  length,
  tail,
  width,
  u,
  className,
}: {
  source: Source<number>
  length: number
  tail: number
  width: number
  u: number
  className: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pivotPct = Math.round((length / (length + tail)) * 10000) / 100
  const translate = `translate(-50%, -${pivotPct}%)`
  useHandRotation(source, ref, translate)
  return (
    <div
      ref={ref}
      className={`absolute top-1/2 left-1/2 rounded-full ${className}`}
      style={{
        width: px(width * u),
        height: px((length + tail) * u),
        transformOrigin: `50% ${pivotPct}%`,
        transform: translate,
      }}
    />
  )
}

/** Class strings per part — the entire theming mechanism. That's the point. */
type Tone = {
  dial: string
  tickMinor: string
  tickMajor: string
  numeral: string
  hand: string
  second: string
  cap: string
}

const DAY: Tone = {
  dial: "bg-zinc-100 shadow-[inset_0_2px_16px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.12)]",
  tickMinor: "bg-zinc-400/80",
  tickMajor: "bg-zinc-500",
  numeral: "text-zinc-600",
  hand: "bg-zinc-900 shadow-[0_3px_8px_rgba(0,0,0,0.28)]",
  second: "bg-[#d9432f] shadow-[0_2px_6px_rgba(217,67,47,0.4)]",
  cap: "bg-[#d9432f] shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
}

const MIDNIGHT: Tone = {
  dial: "bg-zinc-900 shadow-[inset_0_2px_20px_rgba(0,0,0,0.6),0_8px_28px_rgba(0,0,0,0.5)]",
  tickMinor: "bg-zinc-600",
  tickMajor: "bg-zinc-400",
  numeral: "text-zinc-300",
  hand: "bg-zinc-100 shadow-[0_3px_10px_rgba(0,0,0,0.55)]",
  second: "bg-red-500 shadow-[0_2px_8px_rgba(239,68,68,0.5)]",
  cap: "bg-red-500 shadow-[0_1px_4px_rgba(0,0,0,0.6)]",
}

/** Every minute mark, keyed by its domain value rather than a list index. */
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

/** The reference face: 60 ticks, 12 upright numerals, three hands, red cap. */
function HtmlClock({ size, tone }: { size: number; tone: Tone }) {
  const clock = useWatchSource()
  const u = unitsOf(size)

  return (
    <div
      ref={clock.observe}
      className={`relative rounded-full ${tone.dial}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Analog clock, HTML renderer prototype"
    >
      {MINUTES.map((m) => {
        const major = m % 5 === 0
        const len = major ? 9 : 5
        return (
          <div
            key={m}
            className={`absolute top-1/2 left-1/2 rounded-full ${major ? tone.tickMajor : tone.tickMinor}`}
            style={{
              width: px((major ? 1.8 : 1) * u),
              height: px(len * u),
              transform: `translate(-50%, -50%) rotate(${m * 6}deg) translateY(${px(-(100 - len / 2) * u)}px)`,
            }}
          />
        )
      })}

      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1
        return (
          <div
            key={n}
            className={`absolute font-semibold ${tone.numeral}`}
            style={{
              ...dialPercent(polar(n * 30, 77)),
              position: "absolute",
              transform: "translate(-50%, -50%)",
              fontSize: px(18 * u),
            }}
          >
            {n}
          </div>
        )
      })}

      <HtmlHand source={clock.hour} length={52} tail={12} width={6.5} u={u} className={tone.hand} />
      <HtmlHand source={clock.minute} length={76} tail={12} width={5} u={u} className={tone.hand} />
      <HtmlHand
        source={clock.second}
        length={80}
        tail={24}
        width={1.5}
        u={u}
        className={tone.second}
      />

      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${tone.cap}`}
        style={{ width: px(9 * u), height: px(9 * u) }}
      />
    </div>
  )
}

export default function HtmlRendererLab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — html renderer
      </h1>
      <LabNav current="/lab/html" />
      <ScratchNotice />

      <p className="mt-6 max-w-2xl text-sm leading-relaxed opacity-80">
        No SVG on this page. Ticks and numerals are divs placed by <code>polar()</code> from core;
        the hands subscribe to <code>useWatchSource()</code> and write <code>transform</code>{" "}
        through a ref — zero renders per frame, same engine as the SVG faces. Both clocks are one
        component: the theme is nothing but Tailwind class strings, and the shadows (including the
        dial&apos;s inset recess) are plain CSS that SVG cannot reuse.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-16">
        <HtmlClock size={380} tone={DAY} />
        <HtmlClock size={380} tone={MIDNIGHT} />
      </div>
    </main>
  )
}
