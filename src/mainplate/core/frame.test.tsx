// @vitest-environment jsdom
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"
import { Mainplate, useFrame } from "./frame"
import { rectOutline } from "./outline"

function Probe({ onFrame }: { onFrame: (v: ReturnType<typeof useFrame>) => void }) {
  onFrame(useFrame())
  return null
}

describe("<Mainplate>", () => {
  it("renders an svg with a padded viewBox", () => {
    const { container } = render(<Mainplate />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("viewBox")).toBe("-110 -110 220 220")
  })

  it("derives a non-square viewBox from a non-square outline", () => {
    const { container } = render(<Mainplate outline={rectOutline({ ratio: 0.5 })} padding={0} />)
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("-100 -200 200 400")
  })

  it("is fluid when size is omitted", () => {
    const { container } = render(<Mainplate />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("width")).toBeNull()
    expect(svg?.style.width).toBe("100%")
  })

  it("sets an explicit width and a proportional height when size is given", () => {
    const { container } = render(<Mainplate size={320} />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("width")).toBe("320")
    expect(svg?.getAttribute("height")).toBe("320")
  })

  it("accepts an outline as a name, a descriptor, or a factory object", () => {
    const viewBoxOf = (ui: ReactElement) =>
      render(ui).container.querySelector("svg")?.getAttribute("viewBox")

    // All three spell the same 0.5-ratio rect, so all three must agree.
    const expected = "-100 -200 200 400"
    expect(viewBoxOf(<Mainplate outline={{ kind: "rect", ratio: 0.5 }} padding={0} />)).toBe(
      expected,
    )
    expect(viewBoxOf(<Mainplate outline={rectOutline({ ratio: 0.5 })} padding={0} />)).toBe(
      expected,
    )

    // The bare names take their factory defaults.
    expect(viewBoxOf(<Mainplate outline="rect" padding={0} />)).toBe("-100 -100 200 200")
    expect(viewBoxOf(<Mainplate outline="circle" padding={0} />)).toBe("-100 -100 200 200")
    expect(viewBoxOf(<Mainplate outline={{ kind: "circle" }} padding={0} />)).toBe(
      "-100 -100 200 200",
    )
  })

  it("carries a part attribute and an img role", () => {
    const { container } = render(<Mainplate />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("data-mp")).toBe("mainplate")
    expect(svg?.getAttribute("role")).toBe("img")
  })

  it("uses a static default label that the caller can override", () => {
    const { container: a } = render(<Mainplate />)
    expect(a.querySelector("svg")?.getAttribute("aria-label")).toBe("Instrument face")
    const { container: b } = render(<Mainplate label="Speedometer" />)
    expect(b.querySelector("svg")?.getAttribute("aria-label")).toBe("Speedometer")
  })
})

describe("useFrame", () => {
  it("exposes the frame and maps values to angles", () => {
    let seen: ReturnType<typeof useFrame> | undefined
    render(
      <Mainplate max={60}>
        <Probe
          onFrame={(v) => {
            seen = v
          }}
        />
      </Mainplate>,
    )
    expect(seen?.frame.max).toBe(60)
    expect(seen?.angleFor(15)).toBeCloseTo(90, 9)
  })

  it("accepts a local scale override without mutating the frame", () => {
    let seen: ReturnType<typeof useFrame> | undefined
    render(
      <Mainplate max={60}>
        <Probe
          onFrame={(v) => {
            seen = v
          }}
        />
      </Mainplate>,
    )
    expect(seen?.angleFor(3, { max: 12 })).toBeCloseTo(90, 9)
    expect(seen?.frame.max).toBe(60)
  })

  it("throws a useful message outside a frame", () => {
    expect(() => render(<Probe onFrame={() => {}} />)).toThrow(/must be used inside <Mainplate>/)
  })
})
