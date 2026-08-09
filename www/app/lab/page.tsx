import { Mainplate, type Orient, type Placement, rectOutline, Ticks } from "@/mainplate/core"
import { ClientFace } from "./client-face"
import { LabNav } from "./nav"

/** A Tank-proportioned face, as plain data so it can cross the RSC boundary. */
const TANK = { kind: "rect", ratio: 0.78, radius: 12 } as const

/**
 * The three faces below share every one of these. Only `placement` and
 * `orient` vary, and a comparison whose chrome drifts between panels is not a
 * comparison — so the geometry lives here once rather than three times.
 */
const RAIL_OUTER = 9
const RAIL_INNER = 19
const MARK_LENGTH = RAIL_INNER - RAIL_OUTER

const PLATE = "oklch(0.96 0.012 95)"
const INK = "oklch(0.2 0.005 285)"

const VARIANTS: readonly {
  placement: Placement
  orient: Orient
  note: string
}[] = [
  {
    placement: "perimeter",
    orient: "edge",
    note: "What a Cartier Tank actually does. The chemin de fer divides the outline evenly by arc length, corners included, and every mark stands square to the side it sits on. The price is the famous one: a hand no longer points exactly at the in-between minutes.",
  },
  {
    placement: "radial",
    orient: "edge",
    note: "One prop away from the first, and only placement moved. Every mark now sits where its own hand's ray crosses the edge, so the spacing that was uniform stretches to roughly double at the corners. Orientation is untouched — still square to the side.",
  },
  {
    placement: "radial",
    orient: "radial",
    note: "One prop away from the second, and only orientation moved. Same positions, but each mark now lies along its own ray, so the marks fan toward the centre around the corners — 48° off square at minute 7, the mark just past the top-right one. This is what radial looks like.",
  },
]

export default function Lab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">mainplate lab</h1>
      <p className="mt-2 text-sm opacity-60">Dev harness. Faces render here as primitives land.</p>
      <LabNav current="/lab" />

      <section className="mt-8">
        <h2 className="text-xs font-medium tracking-wide uppercase opacity-60">
          placement × orient
        </h2>
        <p className="mt-3 max-w-[76ch] text-sm opacity-70">
          <code>placement</code> and <code>orient</code> are independent axes:{" "}
          <code>placement</code> decides <em>where</em> a mark sits on the outline,{" "}
          <code>orient</code> decides <em>which way it faces</em> once it is there. Neither implies
          the other, which is why it takes three faces rather than two to tell them apart — and why
          the middle one, radial placement with edge orientation, is a real combination and not a
          mistake. Every other prop below is identical across the three.
        </p>

        {/* These faces render straight from this server component — this file
            carries no client directive and no wrapper. The outline crosses the
            RSC boundary as plain data; calling .path() here is fine because it
            returns a string, and strings serialize. Only the Outline *object*
            cannot cross. */}
        <div className="mt-6 flex flex-wrap gap-8">
          {VARIANTS.map((variant) => (
            <figure key={`${variant.placement}-${variant.orient}`} className="max-w-[250px]">
              <TankFace placement={variant.placement} orient={variant.orient} />
              <figcaption className="mt-3 text-xs">
                <span className="font-medium">
                  {variant.placement} placement, {variant.orient} orientation
                </span>
                <span className="mt-1 block leading-relaxed opacity-60">{variant.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className="mt-12 flex flex-wrap items-start gap-10">
        <figure>
          <Mainplate size={250} max={60}>
            <circle r={100} fill="oklch(0.17 0.005 285)" />
            <Ticks
              inset={6}
              width={1}
              tiers={[
                { every: 1, length: 4, fill: "oklch(0.45 0.01 285)" },
                { every: 5, length: 10, width: 2.5, fill: "oklch(0.92 0.01 95)" },
              ]}
            />
          </Mainplate>
          <figcaption className="mt-2 text-xs opacity-60">
            Circle — two tiers, merged, no double-draw at the fives
          </figcaption>
        </figure>

        <ClientFace />
      </div>
    </main>
  )
}

/**
 * One Tank, identical in every respect but the two props under comparison.
 *
 * `align="inside"` hangs each mark from the outer rail, so at `orient="edge"`
 * the marks bracket exactly between the two rails and any departure from that
 * — the fan at the corners under `orient="radial"` — is visible against them.
 */
function TankFace({ placement, orient }: { placement: Placement; orient: Orient }) {
  return (
    <Mainplate
      size={250}
      max={60}
      outline={TANK}
      label={`Tank, ${placement} placement, ${orient} orientation`}
    >
      <path d={rectOutline(TANK).path()} fill={PLATE} />
      <path d={rectOutline(TANK).path(RAIL_OUTER)} fill="none" stroke={INK} strokeWidth={0.6} />
      <path d={rectOutline(TANK).path(RAIL_INNER)} fill="none" stroke={INK} strokeWidth={0.6} />
      <Ticks
        count={60}
        inset={RAIL_OUTER}
        placement={placement}
        orient={orient}
        length={MARK_LENGTH}
        width={0.8}
        align="inside"
        fill={INK}
      />
    </Mainplate>
  )
}
