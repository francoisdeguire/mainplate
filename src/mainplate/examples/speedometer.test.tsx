// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Speedometer } from "./speedometer"

/** The rotation node: `<Hand>`'s stage-2 group, the only thing that turns. */
function rotationOf(container: HTMLElement): string {
  const node = container.querySelector<SVGGElement>('[data-mp="hand"] > g')
  if (node === null) throw new Error("no hand rotation node")
  return node.style.rotate
}

describe("<Speedometer>", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("is an accessible meter over 0–220", () => {
    const { getByRole } = render(<Speedometer value={60} />)
    const meter = getByRole("meter")
    expect(meter.getAttribute("aria-valuemin")).toBe("0")
    expect(meter.getAttribute("aria-valuemax")).toBe("220")
    expect(meter.getAttribute("aria-valuenow")).toBe("60")
    expect(meter.getAttribute("aria-valuetext")).toBe("60 km/h")
  })

  it("points the hand where the controlled value says, on the partial sweep", () => {
    // startAngle -135, sweepAngle 270: 0 is -135°, mid-scale 110 is dead top,
    // full scale 220 is +135°. The hand is a pure function of the prop.
    const { container, rerender } = render(<Speedometer value={110} />)
    expect(rotationOf(container)).toBe("0deg")
    rerender(<Speedometer value={0} />)
    expect(rotationOf(container)).toBe("-135deg")
    rerender(<Speedometer value={220} />)
    expect(rotationOf(container)).toBe("135deg")
    rerender(<Speedometer value={60} />)
    // -135 + (60/220) * 270, quantised to the library's 4dp.
    expect(rotationOf(container)).toBe("-61.3636deg")
  })

  it("is not a clock: nothing moves it but the prop", () => {
    // The reason this example exists (§18): a dashboard gauge never pays for
    // a ticker. No interval, no rAF, no Source — time passing changes nothing.
    vi.useFakeTimers()
    const { container } = render(<Speedometer value={88} />)
    const before = rotationOf(container)
    vi.advanceTimersByTime(60_000)
    expect(rotationOf(container)).toBe(before)
  })

  it("draws a two-tier track: minors every 4, majors every 20", () => {
    const { container } = render(<Speedometer value={0} />)
    const paths = container.querySelectorAll('[data-mp="ticks"] > path')
    expect(paths).toHaveLength(2)
    const byFill = new Map(
      [...paths].map((p) => [p.getAttribute("fill"), p.getAttribute("d") ?? ""]),
    )
    const minors = byFill.get("var(--mp-chapter)")
    const majors = byFill.get("var(--mp-index)")
    if (minors === undefined || majors === undefined) throw new Error("missing tick tier paths")
    // 56 positions at every-4 across 0–220; the 12 multiples of 20 merge into
    // the major tier, leaving 44 minors. One `M` per mark.
    expect(minors.match(/M/g)).toHaveLength(44)
    expect(majors.match(/M/g)).toHaveLength(12)
  })

  it("labels the majors 0–220 through the clearance solver", () => {
    const { container } = render(<Speedometer value={0} />)
    const texts = [...container.querySelectorAll('[data-mp="numerals"] text')]
    expect(texts.map((t) => t.textContent)).toEqual([
      "0",
      "20",
      "40",
      "60",
      "80",
      "100",
      "120",
      "140",
      "160",
      "180",
      "200",
      "220",
    ])
  })

  it("solves the anchoring: wider labels sit deeper at the same diagonal", () => {
    // The clearance solver's signature, distinguishable from any fixed-radius
    // anchor: "0" and "220" both land on 45° diagonals, where a three-glyph
    // box protrudes toward its tick far more than one glyph does — so the
    // solver pulls "220" measurably further in to hold the same 3.5-unit gap.
    const { container } = render(<Speedometer value={0} />)
    const texts = [...container.querySelectorAll('[data-mp="numerals"] text')]
    const radius = (label: string): number => {
      const t = texts.find((el) => el.textContent === label)
      if (t === undefined) throw new Error(`no numeral ${label}`)
      return Math.hypot(Number(t.getAttribute("x")), Number(t.getAttribute("y")))
    }
    expect(radius("0") - radius("220")).toBeGreaterThan(1)
  })

  it("draws the redline as a stroked arc in the accent paint", () => {
    const { container } = render(<Speedometer value={0} />)
    const redline = container.querySelector('[data-mp="arc"]')
    if (redline === null) throw new Error("no redline arc")
    expect(redline.getAttribute("stroke")).toBe("var(--mp-accent)")
    expect(redline.getAttribute("d") ?? "").toMatch(/^M /)
  })

  it("shades the dial through seven pre-computed OKLCH gradient stops", () => {
    // Two endpoint stops would hand interpolation back to SVG's sRGB engine —
    // the exact mud §2.11's helper exists to avoid.
    const { container } = render(<Speedometer value={0} />)
    expect(container.querySelectorAll("stop")).toHaveLength(7)
  })

  it("themes through --mp-* custom properties on the root", () => {
    const { getByRole } = render(
      <Speedometer
        value={0}
        theme={{
          dial: "a",
          chapter: "b",
          index: "c",
          lume: "d",
          hour: "e",
          minute: "f",
          second: "g",
          accent: "h",
        }}
      />,
    )
    const root = getByRole("meter")
    expect(root.style.getPropertyValue("--mp-accent")).toBe("h")
    expect(root.style.getPropertyValue("--mp-lume")).toBe("d")
  })
})
