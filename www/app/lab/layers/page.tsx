import {
  dialPercent,
  type FrameBoxOptions,
  frameBox,
  Hand,
  Mainplate,
  type Point,
  polar,
  quantize,
  rectOutline,
  Ticks,
} from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"

/**
 * The face every layer on this page shares. Plain data, so it crosses the RSC
 * boundary — this page is a server component — and module scope, so its
 * identity is stable across renders.
 *
 * Deliberately a Tank rather than a circle: it is 200 x 256.41 dial units, so
 * a marker's horizontal and vertical percentages are mapped against different
 * extents and an axis mix-up would be visible rather than invisible.
 */
const OUTLINE = { kind: "rect", ratio: 0.78, radius: 16 } as const

/**
 * The three values that decide where the frame's box falls, in one object
 * spread into every `<Mainplate>` and handed to every `dialPercent` call. Two
 * layers and three markers cannot disagree about geometry if there is only one
 * copy of it.
 */
const FACE = { outline: OUTLINE, clip: false, padding: 12 } satisfies FrameBoxOptions

const WIDTH = 320
const BOX = frameBox(FACE)
/** `frameBox` earning its keep: the container has to be the face's aspect ratio. */
const HEIGHT = Math.round((WIDTH * BOX.height) / BOX.width)

const PLATE = "oklch(0.21 0.006 285)"
const EDGE = "oklch(0.34 0.008 285)"
const FAINT = "oklch(0.48 0.01 285)"
const ACCENT = "oklch(0.8 0.13 78)"
const HAND = "oklch(0.92 0.01 95)"

/** The radius of the bright ring in the lower layer, and of the marker on it. */
const RING = 66

/**
 * `polar`, quantised. `dialPercent` quantises its own output, but these
 * coordinates are also printed as text and written to a data attribute, and a
 * raw `Math.sin` differs in the last bit between JS engines — which is a
 * hydration mismatch on a page rendered on the server and hydrated in Safari.
 */
const on = (angle: number, r: number): Point => {
  const p = polar(angle, r)
  return { x: quantize(p.x), y: quantize(p.y) }
}

const MARKERS: readonly { name: string; point: Point; label: string; note: string }[] = [
  {
    name: "crossed",
    point: on(45, RING),
    label: "HTML",
    note: "on the ring, under the hand",
  },
  { name: "top", point: { x: 0, y: -96 }, label: "12", note: "dial point 0, −96" },
  { name: "bottom", point: { x: 0, y: 104 }, label: "SWISS MADE", note: "dial point 0, 104" },
]

export default function LayersLab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — layers
      </h1>
      <LabNav current="/lab/layers" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        Arbitrary HTML on a face, without <code>&lt;foreignObject&gt;</code>. Three siblings in one
        relative container — a <code>&lt;Mainplate&gt;</code>, a plain HTML layer, a second{" "}
        <code>&lt;Mainplate&gt;</code> — all absolutely positioned at the same origin, so paint
        order is DOM order. The HTML layer cannot call <code>useFrame()</code>: it is a sibling of
        the face, not a child, and there is no context out there to read. <code>dialPercent</code>{" "}
        is what closes that gap, taking the same <code>outline</code>, <code>padding</code> and{" "}
        <code>clip</code> the faces are given.
      </p>

      <div className="mt-8 flex flex-wrap items-start gap-12">
        <figure>
          <div
            className="relative"
            data-layer-stack=""
            data-box={[BOX.x, BOX.y, BOX.width, BOX.height].join(" ")}
            style={{ width: WIDTH, height: HEIGHT }}
          >
            {/* Layer 1 — below. The bright ring is the thing the HTML covers. */}
            <Mainplate
              {...FACE}
              size={WIDTH}
              data-layer="lower"
              className="absolute top-0 left-0"
              label="Face, lower layer"
            >
              <path d={rectOutline(OUTLINE).path()} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />
              <circle r={RING} fill="none" stroke={ACCENT} strokeWidth={11} />
              <Ticks count={60} inset={4} length={5} width={0.9} fill={FAINT} />
              <Ticks count={12} inset={4} length={12} width={2.4} fill={ACCENT} />
            </Mainplate>

            {/* Layer 2 — the HTML, between the two faces. Ordinary elements with
                ordinary CSS: a border, a radius, a background, real text. */}
            <div className="absolute inset-0" data-layer="middle">
              {MARKERS.map((marker) => (
                <span
                  key={marker.name}
                  data-marker={marker.name}
                  data-point={`${marker.point.x} ${marker.point.y}`}
                  className="absolute rounded-sm border border-accent bg-surface px-1.5 py-0.5 text-[10px] font-medium tracking-widest text-ink uppercase shadow-sm"
                  style={{
                    // dialPercent returns left/top and nothing else. Positioning
                    // and centring stay the consumer's, and translate(-50%, -50%)
                    // is safe here precisely because this is not a foreignObject.
                    position: "absolute",
                    transform: "translate(-50%, -50%)",
                    ...dialPercent(marker.point, FACE),
                  }}
                >
                  {marker.label}
                </span>
              ))}
            </div>

            {/* Layer 3 — above. The hand sweeps over the HTML marker at 45°. */}
            <Mainplate
              {...FACE}
              size={WIDTH}
              min={0}
              max={360}
              data-layer="upper"
              className="absolute top-0 left-0"
              label="Hand, upper layer"
            >
              <Hand value={45} length={118} tail={26} width={5} fill={HAND} />
              <circle r={6} fill={PLATE} stroke={HAND} strokeWidth={1.4} />
            </Mainplate>
          </div>

          <figcaption className="mt-3 max-w-[46ch] text-xs text-dim">
            Three things overlap at 45°, in order: the amber ring is drawn by the lower face, the
            HTML chip covers it, and the hand from the upper face covers the chip. That chain is the
            whole point — an SVG layer, HTML, and an SVG layer above it.
          </figcaption>
        </figure>

        <div>
          <h2 className="text-xs font-medium tracking-wide text-dim uppercase">what it resolves</h2>
          <p className="mt-2 text-xs text-dim">
            Box <code className="text-ink">{[BOX.x, BOX.y, BOX.width, BOX.height].join(" ")}</code>{" "}
            in dial units, so the container is {WIDTH} × {HEIGHT} px.
          </p>
          <table className="mt-3 text-xs tabular-nums">
            <tbody>
              {MARKERS.map((marker) => {
                const style = dialPercent(marker.point, FACE)
                return (
                  <tr key={marker.name} className="align-top">
                    <td className="pr-4 text-ink">{marker.label}</td>
                    <td className="pr-4 text-dim">
                      {marker.point.x}, {marker.point.y}
                    </td>
                    <td className="pr-4 text-ink">
                      {style.left} / {style.top}
                    </td>
                    <td className="text-dim">{marker.note}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <pre className="mt-6 overflow-x-auto border border-line bg-plate p-4 text-xs leading-relaxed">
            <code>{SNIPPET}</code>
          </pre>

          <p className="mt-4 max-w-[46ch] text-xs text-dim">
            Nothing here is interactive, so the layers keep their default hit-testing and the paint
            order can be read straight off <code>elementFromPoint</code>. A real face would put{" "}
            <code>pointer-events-none</code> on every layer above the one that handles input.
          </p>
        </div>
      </div>
    </main>
  )
}

const SNIPPET = `const FACE = { outline: OUTLINE, clip: false, padding: 12 }

<div className="relative">
  <Mainplate {...FACE} size={320} className="absolute top-0 left-0">…</Mainplate>

  <div className="absolute inset-0">
    <Chip
      style={{
        position: "absolute",
        transform: "translate(-50%, -50%)",
        ...dialPercent(polar(45, 66), FACE),
      }}
    />
  </div>

  <Mainplate {...FACE} size={320} className="absolute top-0 left-0">
    <Hand value={45} />
  </Mainplate>
</div>`
