import { Dial, Hand, Mainplate, Ticks } from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"

const PLATE = "oklch(0.21 0.006 285)"
const TRACK = "oklch(0.45 0.008 285)"
const INK = "oklch(0.8 0.13 78)"

/**
 * Scratch page for `<Hand>`, built to answer one question in a real browser:
 * at a quarter of a full sweep the hand must point due east, measured through
 * `getScreenCTM()` rather than by eye. The second face is the fixture's case D
 * — two hands at one value with deliberately different bounding boxes, which
 * must stay collinear — and the third exercises `pivot` and `scale` on artwork
 * authored well outside dial units.
 */
export default function HandLab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — hand
      </h1>
      <LabNav current="/lab/hand" />
      <ScratchNotice />

      <div className="mt-8 flex flex-wrap gap-10">
        <figure data-case="east">
          <Mainplate min={0} max={60} clip={false} size={280} label="Hand at 90 degrees">
            <Dial fill={PLATE} />
            <Ticks count={12} inset={4} length={8} width={1.5} fill={TRACK} />
            <Hand value={15} length={90} width={4} fill={INK} />
            <circle r={3} fill={TRACK} />
          </Mainplate>
          <figcaption className="mt-2 text-xs opacity-60">
            value 15 of 60 — 90°, due east
          </figcaption>
        </figure>

        <figure data-case="collinear">
          <Mainplate min={0} max={8} clip={false} size={280} label="Two hands at 45 degrees">
            <Dial fill={PLATE} />
            <Hand value={1} length={90} width={2} fill={INK} />
            <Hand value={1} length={60} tail={28} width={14} fill={TRACK} opacity={0.5} />
          </Mainplate>
          <figcaption className="mt-2 text-xs opacity-60">
            case D — different bounding boxes, one axis
          </figcaption>
        </figure>

        <figure data-case="pivot">
          <Mainplate min={0} max={4} clip={false} size={280} label="Hand with pivot and scale">
            <Dial fill={PLATE} />
            {/* Artwork drawn 400 units tall around (200, 340), as it would
                arrive from a drawing tool. `scale` brings it into dial units;
                `pivot` names the point it turns about. */}
            <Hand value={1} pivot={[200, 340]} scale={0.25} fill={INK}>
              <path d="M 194 340 L 194 -20 L 200 -40 L 206 -20 L 206 340 Z" />
              <circle cx={200} cy={340} r={16} />
            </Hand>
          </Mainplate>
          <figcaption className="mt-2 text-xs opacity-60">pivot [200, 340], scale 0.25</figcaption>
        </figure>
      </div>
    </main>
  )
}
