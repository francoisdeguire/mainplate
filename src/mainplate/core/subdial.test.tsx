// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Dial } from "./dial"
import { Mainplate, useFrame } from "./frame"
import { DIAL_RADIUS } from "./geometry"
import { circleOutline, rectOutline } from "./outline"
import { Place } from "./place"
import { Subdial } from "./subdial"
import { Ticks } from "./ticks"

function Probe({ onFrame }: { onFrame: (v: ReturnType<typeof useFrame>) => void }) {
  onFrame(useFrame())
  return null
}

const subdial = (c: HTMLElement) => c.querySelector('[data-mp="subdial"]')

/**
 * Apply the subdial's own `translate(...) scale(...)` to a point in its local
 * dial units, giving the point in parent dial units — the arithmetic the SVG
 * renderer performs. This is how the composition tests prove that children
 * land where the parent face expects them.
 */
function composed(c: HTMLElement, local: [number, number]): [number, number] {
  const t = subdial(c)?.getAttribute("transform") ?? ""
  const m = t.match(/^translate\((-?[\d.]+) (-?[\d.]+)\) scale\((-?[\d.]+)\)$/)
  if (!m) throw new Error(`unexpected subdial transform: ${t}`)
  const tx = Number(m[1])
  const ty = Number(m[2])
  const s = Number(m[3])
  return [tx + s * local[0], ty + s * local[1]]
}

// r=40 on purpose, not 50: with DIAL_RADIUS 100 a wrong scale — dropped (1),
// inverted (2.5), halved again (0.2) — all produce numbers that cannot be
// mistaken for 0.4 or for the 40-parent-unit landings asserted below.
describe("<Subdial> — the scaled origin", () => {
  it("translates to the resolved centre and scales by r / DIAL_RADIUS", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={40} at={[30, 20]} />
      </Mainplate>,
    )
    expect(subdial(container)?.getAttribute("transform")).toBe("translate(30 20) scale(0.4)")
  })

  it("defaults to the parent's centre", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={40} />
      </Mainplate>,
    )
    expect(subdial(container)?.getAttribute("transform")).toBe("translate(0 0) scale(0.4)")
  })

  it("accepts every `at` form, plus the outline-anchored inset", () => {
    const cases: Array<[Parameters<typeof Subdial>[0]["at"], number | undefined, string]> = [
      [270, undefined, "translate(-100 0) scale(0.4)"],
      ["9h", undefined, "translate(-100 0) scale(0.4)"],
      [[30, 20], undefined, "translate(30 20) scale(0.4)"],
      ["3h", 70, "translate(30 0) scale(0.4)"],
    ]
    for (const [at, inset, expected] of cases) {
      const { container } = render(
        <Mainplate>
          <Subdial r={40} at={at} inset={inset} />
        </Mainplate>,
      )
      expect(subdial(container)?.getAttribute("transform")).toBe(expected)
    }
  })

  it("quantises the transform it writes", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={91} at={37} />
      </Mainplate>,
    )
    // Angle 37 is irrational in both coordinates; raw floats here differ
    // between the server's engine and the browser's and mismatch on hydration.
    expect(subdial(container)?.getAttribute("transform")).toMatch(
      /^translate\(-?\d+(\.\d{1,4})? -?\d+(\.\d{1,4})?\) scale\(0\.91\)$/,
    )
  })

  it("requires r at compile time", () => {
    render(
      <Mainplate>
        {/* @ts-expect-error — r is required: without it there is no scale */}
        <Subdial at={[0, 0]} />
      </Mainplate>,
    )
  })

  it("refuses a caller's transform at compile time", () => {
    // The spread lands after the transform, so a caller's would replace the
    // position and the scale both — the whole component, silently undone.
    const { container } = render(
      <Mainplate>
        {/* @ts-expect-error — the group's transform is the subdial */}
        <Subdial r={40} transform="scale(2)" />
      </Mainplate>,
    )
    expect(subdial(container)?.getAttribute("transform")).toBe("translate(0 0) scale(0.4)")
  })

  it("spreads SVG props onto the group", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={40} className="seconds" opacity={0.5} />
      </Mainplate>,
    )
    expect(subdial(container)?.getAttribute("class")).toBe("seconds")
    expect(subdial(container)?.getAttribute("opacity")).toBe("0.5")
  })

  it("names the group when label is given, and stays anonymous otherwise", () => {
    const { container: named } = render(
      <Mainplate>
        <Subdial r={40} label="Running seconds" />
      </Mainplate>,
    )
    expect(subdial(named)?.getAttribute("aria-label")).toBe("Running seconds")
    expect(subdial(named)?.getAttribute("role")).toBe("group")

    const { container: bare } = render(
      <Mainplate>
        <Subdial r={40} />
      </Mainplate>,
    )
    expect(subdial(bare)?.getAttribute("aria-label")).toBeNull()
    expect(subdial(bare)?.getAttribute("role")).toBeNull()
  })
})

describe("<Subdial> — the re-established frame", () => {
  it("gives useFrame() the subdial's frame, at the nominal radius again", () => {
    let seen: ReturnType<typeof useFrame> | undefined
    render(
      <Mainplate max={220} startAngle={90} sweepAngle={180}>
        <Subdial r={40}>
          <Probe
            onFrame={(v) => {
              seen = v
            }}
          />
        </Subdial>
      </Mainplate>,
    )
    // The invariant every primitive depends on: inside, dial-unit 100 is the
    // subdial's own radius, and the frame is indistinguishable from a root one.
    expect(seen?.frame.r).toBe(DIAL_RADIUS)
    expect(seen?.frame.cx).toBe(0)
    expect(seen?.frame.cy).toBe(0)
  })

  it("does not inherit the parent's domain", () => {
    let seen: ReturnType<typeof useFrame> | undefined
    render(
      <Mainplate min={20} max={220} startAngle={90} sweepAngle={180}>
        <Subdial r={40}>
          <Probe
            onFrame={(v) => {
              seen = v
            }}
          />
        </Subdial>
      </Mainplate>,
    )
    // A speedometer's 220 must not leak into a power reserve: the subdial
    // scale resets to the root defaults unless it says otherwise.
    expect(seen?.frame.min).toBe(0)
    expect(seen?.frame.max).toBe(1)
    expect(seen?.frame.startAngle).toBe(0)
    expect(seen?.frame.sweepAngle).toBe(360)
    expect(seen?.angleFor(0.5)).toBeCloseTo(180, 9)
  })

  it("takes its own scale props when given", () => {
    let seen: ReturnType<typeof useFrame> | undefined
    render(
      <Mainplate max={220}>
        <Subdial r={40} min={0} max={60} startAngle={30} sweepAngle={300}>
          <Probe
            onFrame={(v) => {
              seen = v
            }}
          />
        </Subdial>
      </Mainplate>,
    )
    expect(seen?.frame.max).toBe(60)
    expect(seen?.frame.startAngle).toBe(30)
    expect(seen?.frame.sweepAngle).toBe(300)
  })

  it("does not inherit the parent's outline, defaulting to a circle", () => {
    // A Tank's rectangular case holds round subdials: the parent's shape must
    // not leak. <Dial> inside reads the outline, so its path is the evidence.
    const { container } = render(
      <Mainplate outline="rect">
        <Subdial r={40}>
          <Dial />
        </Subdial>
      </Mainplate>,
    )
    expect(container.querySelector('[data-mp="dial"]')?.getAttribute("d")).toBe(
      circleOutline().path(),
    )
  })

  it("takes its own outline when given", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={40} outline={{ kind: "rect", ratio: 1 }}>
          <Dial />
        </Subdial>
      </Mainplate>,
    )
    expect(container.querySelector('[data-mp="dial"]')?.getAttribute("d")).toBe(
      rectOutline({ ratio: 1 }).path(),
    )
  })
})

describe("<Subdial> — composition in parent coordinates", () => {
  // The actual deliverable: <Ticks>, <Dial> and <Place> inside a subdial,
  // knowing nothing about it, land exactly where the parent face expects.

  it("puts a <Ticks inset={0}> mark at r parent units from the subdial centre", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={40} at={[30, 20]}>
          <Ticks ticks={[{ value: 0 }]} inset={0} length={10} width={2} />
        </Subdial>
      </Mainplate>,
    )
    // In the subdial's units the mark anchors at (0, -100) — value 0, inset 0
    // on the default circle. Composed through the subdial's transform that is
    // 40 parent units above the centre at (30, 20): parent radius r, not 100.
    expect(container.querySelector('[data-mp="ticks"] path')?.getAttribute("d")).toBe(
      "M -1 -95 L -1 -105 L 1 -105 L 1 -95 Z",
    )
    expect(composed(container, [0, -100])).toEqual([30, -20])
  })

  it("keeps dial-unit 100 equal to r parent units — the renormalisation invariant", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={40}>
          <Place at="3h" />
        </Subdial>
      </Mainplate>,
    )
    // <Place at="3h"> sits at local (100, 0), the subdial's own edge. From the
    // parent's centre that must be exactly r=40 units out — not 100 (scale
    // dropped), not 16 (scale applied twice).
    expect(container.querySelector('[data-mp="place"]')?.getAttribute("transform")).toBe(
      "translate(100 0)",
    )
    expect(composed(container, [100, 0])).toEqual([40, 0])
  })

  it("fills a <Dial> that spans exactly the subdial's r in parent units", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={40} at={[30, 20]}>
          <Dial />
        </Subdial>
      </Mainplate>,
    )
    // The surface is drawn at local radius 100; its topmost point composes to
    // 40 parent units above the subdial centre.
    expect(container.querySelector('[data-mp="dial"]')?.getAttribute("d")).toBe(
      circleOutline().path(),
    )
    expect(composed(container, [0, -100])).toEqual([30, -20])
    expect(composed(container, [100, 0])).toEqual([70, 20])
  })
})

describe("<Subdial> — the nesting cap", () => {
  it("allows a register inside a register", () => {
    const { container } = render(
      <Mainplate>
        <Subdial r={50}>
          <Subdial r={40} />
        </Subdial>
      </Mainplate>,
    )
    expect(container.querySelectorAll('[data-mp="subdial"]')).toHaveLength(2)
  })

  it("throws in development at the third level, naming the depth", () => {
    // React logs the render error it rethrows; keep the test output clean.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(() =>
        render(
          <Mainplate>
            <Subdial r={60}>
              <Subdial r={60}>
                <Subdial r={60} />
              </Subdial>
            </Subdial>
          </Mainplate>,
        ),
      ).toThrow(/mainplate: .*3 levels deep/)
    } finally {
      spy.mockRestore()
    }
  })

  it("renders anyway in production, logging once per offending depth", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const face = (
        <Mainplate>
          <Subdial r={60}>
            <Subdial r={60}>
              <Subdial r={60}>
                <Subdial r={60} />
              </Subdial>
            </Subdial>
          </Subdial>
        </Mainplate>
      )
      const { container } = render(face)
      // Degraded, not destroyed: all four registers are in the DOM.
      expect(container.querySelectorAll('[data-mp="subdial"]')).toHaveLength(4)

      // Rendering the same face again must not repeat the messages — but the
      // three-deep and the four-deep offence each get a line of their own,
      // because the depth is interpolated into the dedup key.
      render(face)
      const messages = spy.mock.calls.map(([first]) => String(first))
      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatch(/^mainplate: /)
      expect(messages[0]).toContain("3 levels deep")
      expect(messages[1]).toContain("4 levels deep")
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
