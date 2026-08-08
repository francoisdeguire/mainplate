import { Mainplate, rectOutline, Ticks } from "@/mainplate/core"
import { ClientFace } from "./client-face"
import { LabNav } from "./nav"

/** A Tank-proportioned face, as plain data so it can cross the RSC boundary. */
const TANK = { kind: "rect", ratio: 0.78, radius: 12 } as const

export default function Lab() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">mainplate lab</h1>
      <p className="mt-2 text-sm opacity-60">Dev harness. Faces render here as primitives land.</p>
      <LabNav current="/lab" />
      <div className="mt-8 flex flex-wrap gap-10">
        {/* This face renders straight from this server component — this file
            carries no client directive and no wrapper. The outline crosses the
            RSC boundary as plain data; calling .path() here is fine because it
            returns a string, and strings serialize. Only the Outline *object*
            cannot cross. */}
        <figure>
          <Mainplate size={260} max={60} padding={14} outline={TANK}>
            <path d={rectOutline(TANK).path()} fill="oklch(0.96 0.012 95)" />
            <path
              d={rectOutline(TANK).path(9)}
              fill="none"
              stroke="oklch(0.2 0.005 285)"
              strokeWidth={0.6}
            />
            <path
              d={rectOutline(TANK).path(15)}
              fill="none"
              stroke="oklch(0.2 0.005 285)"
              strokeWidth={0.6}
            />
            <Ticks
              count={60}
              inset={9}
              length={6}
              width={0.6}
              orient="edge"
              align="inside"
              fill="oklch(0.2 0.005 285)"
            />
          </Mainplate>
          <figcaption className="mt-2 text-xs opacity-60">
            Tank — chemin de fer, radial placement, edge orientation
          </figcaption>
        </figure>

        <figure>
          <Mainplate size={260} max={60}>
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
