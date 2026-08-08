import {
  circleOutline,
  Mainplate,
  type Orient,
  type OutlineSpec,
  rectOutline,
  Ticks,
} from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"

const ORIENTS = ["radial", "tangential", "edge", "upright"] as const satisfies readonly Orient[]

/** Plain data, so it crosses the RSC boundary. Module scope, so identity is stable. */
const RECT = { kind: "rect", ratio: 1.35, radius: 10 } as const

const ROWS: readonly { name: string; outline: OutlineSpec; path: string }[] = [
  { name: "circle", outline: "circle", path: circleOutline().path() },
  { name: "rect — ratio 1.35, radius 10", outline: RECT, path: rectOutline(RECT).path() },
]

const PLATE = "oklch(0.21 0.006 285)"
const EDGE = "oklch(0.34 0.008 285)"
const STEM = "oklch(0.62 0.01 285)"
const HEAD = "oklch(0.8 0.13 78)"

const NOTES: Record<Orient, string> = {
  radial: "up points outward along the ray through the mark",
  tangential: "up points along travel, a quarter turn clockwise from radial",
  edge: "up points along the outline's outward normal",
  upright: "up is always screen-up, whatever the position",
}

export default function OrientLab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — orient
      </h1>
      <LabNav current="/lab/orient" />
      <ScratchNotice />

      <p className="mt-6 max-w-[68ch] text-sm text-dim">
        Each mark is two <code>&lt;Ticks&gt;</code> layers sharing one anchor: a long grey stem
        drawn <code>align=&quot;inside&quot;</code> and a fat amber head drawn{" "}
        <code>align=&quot;outside&quot;</code>. The asymmetry is deliberate — a symmetric quad looks
        identical after a 180° flip, which is exactly how an orientation bug hides.
      </p>

      {ROWS.map((row) => (
        <section key={row.name} className="mt-10">
          <h2 className="text-xs font-medium tracking-wide text-dim uppercase">{row.name}</h2>
          <div className="mt-3 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {ORIENTS.map((orient) => (
              <figure key={orient}>
                <NailFace outline={row.outline} path={row.path} orient={orient} />
                <figcaption className="mt-2 text-xs">
                  <span className="text-ink">orient=&quot;{orient}&quot;</span>
                  <span className="mt-0.5 block text-dim">{NOTES[orient]}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-10 max-w-[76ch] border-l-2 border-accent pl-4 text-sm">
        <code>edge</code> and <code>radial</code> are pixel-identical on the circle row — the
        outward normal at an angle <em>is</em> the ray through it — and visibly diverge on the rect
        row, where <code>radial</code> fans the marks out with the ray while <code>edge</code> keeps
        every mark square to the side it stands on.
      </p>
    </main>
  )
}

function NailFace({
  outline,
  path,
  orient,
}: {
  outline: OutlineSpec
  path: string
  orient: Orient
}) {
  return (
    <Mainplate outline={outline} padding={24} max={12} label={`Twelve marks, orient ${orient}`}>
      <path d={path} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />
      <Ticks
        count={12}
        inset={18}
        length={20}
        width={1.4}
        align="inside"
        orient={orient}
        fill={STEM}
      />
      <Ticks
        count={12}
        inset={18}
        length={7}
        width={7}
        align="outside"
        orient={orient}
        fill={HEAD}
      />
      <circle r={2} fill={EDGE} />
    </Mainplate>
  )
}
