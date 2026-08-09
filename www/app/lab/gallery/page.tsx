"use client"

/**
 * Client, and not by choice: three of these faces pass functions to `<Ticks>`
 * — a `skip` predicate, a function-valued `length`, and `renderItem`. Functions
 * cannot cross the RSC boundary, so any page that uses the per-mark function
 * forms has to sit inside the client boundary, exactly like a factory-built
 * `Outline`. Nothing here is interactive.
 */
import type { ReactNode } from "react"
import {
  clearanceRadius,
  type DialUnits,
  estimateInk,
  Mainplate,
  type Point,
  polar,
  quantize,
  type TickFace,
  Ticks,
} from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"

const PLATE = "oklch(0.21 0.006 285)"
const EDGE = "oklch(0.34 0.008 285)"
const FAINT = "oklch(0.48 0.01 285)"
const MID = "oklch(0.72 0.01 285)"
const INK = "oklch(0.92 0.01 95)"
const ACCENT = "oklch(0.8 0.13 78)"
const WELL = "oklch(0.13 0.005 285)"

/* --- numeral clearance ---------------------------------------------------
 * The real mechanism now lives in core: `clearanceRadius` holds the shortest
 * ink-to-tick distance constant. The superseded ray/box prototype below is
 * kept, with its original constants, so the second gauge can show what it
 * got wrong.
 */

/** Centre a label so its optical ink clears the tick's inner end by `clearance`. */
function opticalCentre(
  angle: number,
  rotation: number,
  label: string,
  fontSize: number,
  tick: TickFace,
  clearance: DialUnits,
): Point {
  const r = clearanceRadius({ ink: estimateInk(label, fontSize), angle, rotation, tick, clearance })
  const p = polar(angle, r)
  return { x: quantize(p.x), y: quantize(p.y) }
}

/**
 * The superseded prototype: pull the centre in from the anchor by the ray/box
 * intersection `min(hw/|ux|, hh/|uy|)`, holding the gap *measured along the
 * ray* constant. Wrong, instructively: a rectangle's corners protrude toward
 * the tick without lying on the ray, so wide labels crowd their ticks at the
 * diagonals. Kept verbatim — original metrics included — for the comparison.
 */
const OLD_CHAR_EM: Record<string, number> = { "1": 0.45, I: 0.25, W: 0.9, M: 0.9 }
const OLD_CAP_EM = 0.72

function rayBoxCentre(point: Point, r: DialUnits, label: string, fontSize: number): Point {
  const em = [...label].reduce((w, ch) => w + (OLD_CHAR_EM[ch] ?? 0.6), 0)
  const hw = (em * fontSize) / 2
  const hh = (OLD_CAP_EM * fontSize) / 2
  const ux = Math.abs(point.x) / r
  const uy = Math.abs(point.y) / r
  const extent = Math.min(
    ux > 1e-9 ? hw / ux : Number.POSITIVE_INFINITY,
    uy > 1e-9 ? hh / uy : Number.POSITIVE_INFINITY,
  )
  const f = (r - extent) / r
  return { x: quantize(point.x * f), y: quantize(point.y * f) }
}

export default function Gallery() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — gallery
      </h1>
      <LabNav current="/lab/gallery" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        Six faces built from the primitives that exist today: <code>&lt;Mainplate&gt;</code>,{" "}
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
          title="Gauge, optical clearance"
          caption="Every numeral's ink holds the same shortest distance — 3 dial units — from its tick's inner end (r 78, width 2.2), solved by core's clearanceRadius from an estimated optical box: flat cap band, measured advances, corner recession on round glyphs. The 0 and the 220 land on different radii precisely so their gaps read equal."
        >
          <Mainplate
            size={280}
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
              orient="upright"
              tiers={[{ every: 20 }]}
              renderItem={(mark) => {
                const p = opticalCentre(
                  mark.angle,
                  mark.rotation,
                  String(mark.value),
                  11,
                  { r: 78, width: 2.2 },
                  3,
                )
                return (
                  <text
                    x={p.x}
                    y={p.y}
                    fontSize={11}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={MID}
                  >
                    {mark.value}
                  </text>
                )
              }}
            />
            <circle r={4} fill={ACCENT} />
          </Mainplate>
        </Figure>

        <Figure
          title="Same gauge, ray/box prototype"
          caption="What shipped before: each centre pulled in by the ray/box intersection, holding the gap measured along the ray at 3. A text box is a rectangle, and at the diagonals its corners protrude toward the tick without lying on the ray — the 220's true shortest distance collapses to ~1.4 units while the near-square 0 keeps ~3.3, so the 0 reads further out than the 220. The on-ray gap was constant; the gap the eye measures was not."
        >
          <Mainplate
            size={280}
            min={0}
            max={220}
            startAngle={-135}
            sweepAngle={270}
            label="Speed gauge with the superseded ray/box numeral shift"
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
              r={75}
              tiers={[{ every: 20 }]}
              renderItem={(mark) => {
                const p = rayBoxCentre(mark.point, 75, String(mark.value), 11)
                return (
                  <text
                    x={p.x}
                    y={p.y}
                    fontSize={11}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={MID}
                  >
                    {mark.value}
                  </text>
                )
              }}
            />
            <circle r={4} fill={ACCENT} />
          </Mainplate>
        </Figure>

        <Figure
          title="Chapter ring, three tiers"
          caption="every 1, every 5, every 15 over a 0–60 domain. Later tier wins at a shared position, so 0/15/30/45 draw once in amber rather than three times stacked — count the colours at the quarters."
        >
          <Mainplate size={280} max={60} label="Chapter ring, three tiers">
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
          <Mainplate size={280} max={60} label="Dial with a date aperture">
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
          caption='Degree marks as merged quads; the cardinals are a second <Ticks> using an explicit ticks array whose items carry a label, placed by renderItem with the same optical clearance as the gauge — 4 units of ink-to-tick distance from the cardinal tick ends at r 83. mark.rotation carries what orient resolves to — 0 here, because orient="upright" — for the consumer to apply.'
        >
          <Mainplate size={280} max={360} label="Compass rose">
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
              orient="upright"
              ticks={[
                { value: 0, label: "N" },
                { value: 90, label: "E" },
                { value: 180, label: "S" },
                { value: 270, label: "W" },
              ]}
              renderItem={(mark) => {
                const label = String(mark.props.label)
                const p = opticalCentre(
                  mark.angle,
                  mark.rotation,
                  label,
                  17,
                  { r: 83, width: 2 },
                  4,
                )
                return (
                  <text
                    x={p.x}
                    y={p.y}
                    fontSize={17}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={mark.value === 0 ? ACCENT : INK}
                  >
                    {label}
                  </text>
                )
              }}
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
