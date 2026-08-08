import { Mainplate } from "@/mainplate/core/frame"
import { rectOutline } from "@/mainplate/core/outline"
import { ClientFace } from "./client-face"

/** A Tank-proportioned face, as plain data so it can cross the RSC boundary. */
const TANK = { kind: "rect", ratio: 0.78, radius: 12 } as const

export default function Lab() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">mainplate lab</h1>
      <p className="mt-2 text-sm opacity-60">Dev harness. Faces render here as primitives land.</p>
      <div className="mt-8 flex flex-wrap gap-8">
        {/* Both of these render straight from this server component — this file
            carries no client directive and no wrapper. That is the proof that
            an outline can be described with plain data across the RSC
            boundary. */}
        <Mainplate size={280}>
          <circle r={100} fill="none" stroke="oklch(0.4 0.01 285)" />
          <circle r={4} fill="oklch(0.92 0.01 95)" />
        </Mainplate>
        <Mainplate size={240} outline={TANK}>
          {/* Calling .path() here is fine: it returns a string, and strings
              serialize. Only the Outline *object* cannot cross. */}
          <path d={rectOutline(TANK).path()} fill="none" stroke="oklch(0.4 0.01 285)" />
          <circle r={4} fill="oklch(0.92 0.01 95)" />
        </Mainplate>
        <ClientFace />
      </div>
    </main>
  )
}
