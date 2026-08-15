// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Mainplate, type MainplateProps } from "./frame"
import { fmt, polar } from "./geometry"
import { dialPercent, frameBox } from "./layer"
import { type Rect, rectOutline } from "./outline"

/**
 * The four numbers `<Mainplate>` actually put in the DOM, as the source of
 * truth. Missing parts fall back to NaN rather than to a plausible number, so a
 * viewBox that failed to render fails the comparison instead of passing it.
 */
function renderedBox(props: MainplateProps): Rect {
  const { container } = render(<Mainplate {...props} />)
  const viewBox = container.querySelector("svg")?.getAttribute("viewBox")
  const [x = NaN, y = NaN, width = NaN, height = NaN] = String(viewBox).split(" ").map(Number)
  return { x, y, width, height }
}

describe("frameBox", () => {
  it("defaults to the clipped circle <Mainplate /> renders bare", () => {
    expect(frameBox()).toEqual({ x: -100, y: -100, width: 200, height: 200 })
  })

  it("takes its padding default from clip, exactly as <Mainplate> does", () => {
    expect(frameBox({ clip: false })).toEqual({ x: -110, y: -110, width: 220, height: 220 })
    expect(frameBox({ clip: false, padding: 0 })).toEqual({
      x: -100,
      y: -100,
      width: 200,
      height: 200,
    })
  })

  it("resolves every OutlineSpec form to the same box", () => {
    const expected = { x: -100, y: -200, width: 200, height: 400 }
    expect(frameBox({ outline: { kind: "rect", ratio: 0.5 } })).toEqual(expected)
    expect(frameBox({ outline: rectOutline({ ratio: 0.5 }) })).toEqual(expected)
  })
})

// The load-bearing test. Both sides of the comparison have to come from
// different code paths or it proves nothing: the right-hand side is parsed out
// of the viewBox attribute a real <Mainplate> rendered, never recomputed here.
describe("agreement with the viewBox <Mainplate> renders", () => {
  // Rendering a clipped face with an explicit padding warns by design. Silenced
  // so this suite's output stays pristine; the warning is frame's test to make.
  afterEach(() => vi.restoreAllMocks())

  const CASES: readonly { name: string; props: MainplateProps }[] = [
    { name: "bare circle", props: {} },
    { name: "circle, unclipped", props: { clip: false } },
    { name: "circle, explicit padding while clipping", props: { padding: 24 } },
    { name: "circle, unclipped with an explicit zero", props: { clip: false, padding: 0 } },
    { name: "tank rect", props: { outline: { kind: "rect", ratio: 0.78 } } },
    {
      name: "tank rect, unclipped",
      props: { outline: { kind: "rect", ratio: 0.78 }, clip: false },
    },
    {
      name: "tall rect, explicit padding",
      props: { outline: { kind: "rect", ratio: 0.5 }, padding: 15 },
    },
    { name: "wide rect, unclipped", props: { outline: { kind: "rect", ratio: 2.5 }, clip: false } },
    {
      name: "rounded rect from a factory",
      props: { outline: rectOutline({ ratio: 0.78, radius: 12 }), clip: false, padding: 30 },
    },
  ]

  // None of them centred, so a mapping that lost an axis or dropped a padding
  // cannot slip through by landing on 50% either way.
  const POINTS = [{ x: 0, y: 0 }, { x: 0, y: -100 }, { x: 62, y: 41 }, polar(200, 73)]

  for (const { name, props } of CASES) {
    it(`agrees on ${name}`, () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const dom = renderedBox(props)

      expect(frameBox(props)).toEqual(dom)

      for (const point of POINTS) {
        expect(dialPercent(point, props)).toEqual({
          left: `${fmt(((point.x - dom.x) / dom.width) * 100)}%`,
          top: `${fmt(((point.y - dom.y) / dom.height) * 100)}%`,
        })
      }
    })
  }
})

describe("dialPercent", () => {
  it("puts the dial centre at the centre of a centred box", () => {
    expect(dialPercent({ x: 0, y: 0 })).toEqual({ left: "50%", top: "50%" })
  })

  it("maps a dial point onto the box it sits in", () => {
    // Clipped circle: the box is -100 -100 200 200, so x 30 is 65% across and
    // y -70 is 15% down.
    expect(dialPercent({ x: 30, y: -70 })).toEqual({ left: "65%", top: "15%" })
  })

  it("shifts with padding, because the box it maps into grew", () => {
    // Twelve o'clock is the top edge at padding 0, and moves inside it once
    // padding reserves room above: 10 units of 220, then 20 of 240.
    expect(dialPercent({ x: 0, y: -100 })).toEqual({ left: "50%", top: "0%" })
    expect(dialPercent({ x: 0, y: -100 }, { clip: false, padding: 10 }).top).toBe("4.5455%")
    expect(dialPercent({ x: 0, y: -100 }, { clip: false, padding: 20 }).top).toBe("8.3333%")
  })

  it("follows clip's padding default, so the same point moves when clip does", () => {
    const clipped = dialPercent({ x: 0, y: -100 }, { outline: "circle" })
    const unclipped = dialPercent({ x: 0, y: -100 }, { outline: "circle", clip: false })
    expect(clipped.top).toBe("0%")
    expect(unclipped.top).toBe("4.5455%")
  })

  it("maps x and y against different extents on a non-square outline", () => {
    // A 0.5-ratio rect is 200 x 400 dial units, so the same 50 is three
    // quarters across but only 62.5% down. Reusing the width gives 125%.
    const outline = { kind: "rect", ratio: 0.5 } as const
    expect(dialPercent({ x: 50, y: 50 }, { outline })).toEqual({ left: "75%", top: "62.5%" })
  })

  it("quantises like every other coordinate handed to a consumer", () => {
    // Raw, this is 15.358983848622455 — enough digits to differ between JS
    // engines, which in a style prop is a hydration mismatch.
    expect(dialPercent(polar(30, 80)).top).toBe("15.359%")
  })

  it("accepts an outline as a name, a descriptor, or a factory object", () => {
    const expected = dialPercent({ x: 50, y: 50 }, { outline: { kind: "rect", ratio: 0.5 } })
    expect(dialPercent({ x: 50, y: 50 }, { outline: rectOutline({ ratio: 0.5 }) })).toEqual(
      expected,
    )
  })

  it("returns a style object, not a string", () => {
    const style = { position: "absolute" as const, ...dialPercent({ x: 0, y: 0 }) }
    expect(style).toEqual({ position: "absolute", left: "50%", top: "50%" })
  })
})
