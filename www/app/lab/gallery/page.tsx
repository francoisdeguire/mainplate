"use client"

/**
 * Client, and not by choice: three of these faces pass functions to `<Ticks>`
 * — a `skip` predicate, a function-valued `length`, and `renderItem`. Functions
 * cannot cross the RSC boundary, so any page that uses the per-mark function
 * forms has to sit inside the client boundary, exactly like a factory-built
 * `Outline`. Nothing here is interactive.
 */
import type { ReactNode } from "react"
import { Mainplate, Ticks } from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"

const PLATE = "oklch(0.21 0.006 285)"
const EDGE = "oklch(0.34 0.008 285)"
const FAINT = "oklch(0.48 0.01 285)"
const MID = "oklch(0.72 0.01 285)"
const INK = "oklch(0.92 0.01 95)"
const ACCENT = "oklch(0.8 0.13 78)"
const WELL = "oklch(0.13 0.005 285)"

export default function Gallery() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — gallery
      </h1>
      <LabNav current="/lab/gallery" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        Five faces built from the primitives that exist today: <code>&lt;Mainplate&gt;</code>,{" "}
        <code>&lt;Ticks&gt;</code>, and raw SVG. There is no hand, numeral, arc or subdial component
        yet — every numeral below is a <code>&lt;text&gt;</code> placed by <code>renderItem</code>,
        and every aperture is a <code>&lt;rect&gt;</code> drawn in the frame&rsquo;s own
        coordinates.
      </p>
      <p className="mt-3 max-w-[68ch] text-sm text-dim">
        Every <code>renderItem</code> coordinate below is used raw — <code>mark.point</code>,{" "}
        <code>mark.normal</code> and <code>mark.rotation</code> come pre-quantized to the same 4dp
        as the library&rsquo;s own path data, so the server&rsquo;s <code>Math.sin</code> ULPs and
        the browser&rsquo;s serialize identically. These pages used to wrap everything in{" "}
        <code>fmt()</code> to dodge a hydration mismatch; that workaround is gone.
      </p>

      <div className="mt-8 grid gap-10 sm:grid-cols-2 xl:grid-cols-3">
        <Figure
          title="Partial sweep gauge"
          caption="startAngle -135, sweepAngle 270, min/max in real units (0–220 km/h). Two tiers: every 5 hairline, every 20 heavy. Numerals are a second <Ticks> anchored with r, not inset, so they sit on a fixed radius rather than following the outline."
        >
          <Mainplate
            size={280}
            padding={12}
            min={0}
            max={220}
            startAngle={-135}
            sweepAngle={270}
            label="Speed gauge, 0 to 220"
          >
            <circle r={100} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />
            <Ticks
              inset={8}
              align="inside"
              tiers={[
                { every: 5, length: 5, width: 0.8, fill: FAINT },
                { every: 20, length: 14, width: 2.2, fill: INK },
              ]}
            />
            <Ticks
              r={70}
              tiers={[{ every: 20 }]}
              renderItem={(mark) => (
                <text
                  x={mark.point.x}
                  y={mark.point.y}
                  fontSize={11}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={MID}
                >
                  {mark.value}
                </text>
              )}
            />
            <circle r={4} fill={ACCENT} />
          </Mainplate>
        </Figure>

        <Figure
          title="Chapter ring, three tiers"
          caption="every 1, every 5, every 15 over a 0–60 domain. Later tier wins at a shared position, so 0/15/30/45 draw once in amber rather than three times stacked — count the colours at the quarters."
        >
          <Mainplate size={280} padding={12} max={60} label="Chapter ring, three tiers">
            <circle r={100} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />
            <Ticks
              inset={7}
              align="inside"
              tiers={[
                { every: 1, length: 4, width: 0.9, fill: FAINT },
                { every: 5, length: 10, width: 2.2, fill: INK },
                { every: 15, length: 16, width: 4, fill: ACCENT },
              ]}
            />
            <circle r={3} fill={EDGE} />
          </Mainplate>
        </Figure>

        <Figure
          title="Date window"
          caption="A top-level skip predicate clears every mark whose angle falls in the aperture — after the tier merge, so the position is cleared outright rather than letting the tier below show through. The window itself is a raw <rect> at 3 o'clock."
        >
          <Mainplate size={280} padding={12} max={60} label="Dial with a date aperture">
            <circle r={100} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />
            <Ticks
              inset={7}
              align="inside"
              skip={({ angle }) => angle > 74 && angle < 106}
              tiers={[
                { every: 1, length: 4, width: 0.9, fill: FAINT },
                { every: 5, length: 11, width: 2.2, fill: INK },
              ]}
            />
            <rect
              x={54}
              y={-11}
              width={32}
              height={22}
              rx={2.5}
              fill={WELL}
              stroke={EDGE}
              strokeWidth={0.8}
            />
            <text
              x={70}
              y={0}
              fontSize={14}
              textAnchor="middle"
              dominantBaseline="central"
              fill={INK}
            >
              08
            </text>
            <circle r={3} fill={EDGE} />
          </Mainplate>
        </Figure>

        <Figure
          title="Progressive scale"
          caption="length is a function of the tick context: 3 + t * 22, so the marks grow along the 240° sweep. Forty-one marks, one fill, one merged <path>."
        >
          <Mainplate
            size={280}
            padding={12}
            min={0}
            max={100}
            startAngle={-120}
            sweepAngle={240}
            label="Progressive scale"
          >
            <circle r={100} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />
            <Ticks
              count={41}
              inset={8}
              align="inside"
              width={1.8}
              length={({ t }) => 3 + t * 22}
              fill={ACCENT}
            />
            <circle r={3} fill={EDGE} />
          </Mainplate>
        </Figure>

        <Figure
          title="Compass rose"
          caption='Degree marks as merged quads; the cardinals are a second <Ticks> using an explicit ticks array whose items carry a label, placed by renderItem. renderItem opts out of the built-in quad, but not of orientation: mark.rotation carries what orient resolves to — 0 for every mark here, because orient="upright" — for the consumer to apply.'
        >
          <Mainplate size={280} padding={14} max={360} label="Compass rose">
            <circle r={100} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />
            <Ticks
              inset={6}
              align="inside"
              tiers={[
                { every: 15, length: 5, width: 0.9, fill: FAINT },
                { every: 45, length: 11, width: 2, fill: MID },
              ]}
            />
            <Ticks
              r={72}
              orient="upright"
              ticks={[
                { value: 0, label: "N" },
                { value: 90, label: "E" },
                { value: 180, label: "S" },
                { value: 270, label: "W" },
              ]}
              renderItem={(mark) => (
                <text
                  x={mark.point.x}
                  y={mark.point.y}
                  fontSize={17}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={mark.value === 0 ? ACCENT : INK}
                >
                  {String(mark.props.label)}
                </text>
              )}
            />
            <circle r={3} fill={EDGE} />
          </Mainplate>
        </Figure>
      </div>
    </main>
  )
}

function Figure({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: ReactNode
}) {
  return (
    <figure className="max-w-[300px]">
      {children}
      <figcaption className="mt-3">
        <span className="text-xs font-medium tracking-wide uppercase">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-dim">{caption}</span>
      </figcaption>
    </figure>
  )
}
