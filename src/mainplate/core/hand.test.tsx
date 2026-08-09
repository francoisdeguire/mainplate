// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { Frame } from "./frame"
import { Mainplate, useFrame } from "./frame"
import { Hand } from "./hand"

/** The three groups of the §2.9 recipe: position, rotation, artwork. */
const position = (c: HTMLElement) => c.querySelector('[data-mp="hand"]')
const rotation = (c: HTMLElement) => c.querySelector('[data-mp="hand"] > g')
const artwork = (c: HTMLElement) => c.querySelector('[data-mp="hand"] > g > g')

/**
 * The rotation node's style, byte for byte. `transform-box` and
 * `transform-origin` are part of the recipe, not decoration, so they are
 * asserted as literally as the angle is.
 */
const recipe = (deg: number) => `rotate: ${deg}deg; transform-box: view-box; transform-origin: 0 0;`

/** Reads the frame a sibling sees, to prove a local override stayed local. */
function FrameProbe({ onRead }: { onRead: (frame: Frame) => void }) {
  onRead(useFrame().frame)
  return null
}

describe("<Hand> — the transform recipe", () => {
  it("nests three groups: position, then rotation, then the artwork's own space", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} />
      </Mainplate>,
    )
    expect(position(container)).not.toBeNull()
    expect(rotation(container)).not.toBeNull()
    expect(artwork(container)).not.toBeNull()
    // Stage 1 is the frame centre, static, as an SVG attribute.
    expect(position(container)?.getAttribute("transform")).toBe("translate(0 0)")
  })

  it("rotates in CSS on the middle group, with transform-box and transform-origin explicit", () => {
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={15} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(90))
    // The animated node must not carry an SVG transform attribute: the CSS
    // form is what the fixture verified and what the compositor can promote.
    expect(rotation(container)?.hasAttribute("transform")).toBe(false)
  })

  it("declares the recipe as parsed CSS, not as free text", () => {
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={15} />
      </Mainplate>,
    )
    const node = rotation(container) as SVGGElement | null
    expect(node?.style.getPropertyValue("rotate")).toBe("90deg")
    expect(node?.style.getPropertyValue("transform-box")).toBe("view-box")
    expect(node?.style.getPropertyValue("transform-origin")).toBe("0 0")

    // The honest limit of this assertion: jsdom parses the declaration but
    // renders nothing, so all it proves is that three well-formed properties
    // reach the DOM. That `view-box` is the *right* value — that `fill-box`
    // would pivot a hand with a tail differently from one without — rests on
    // fixtures/transform.html case D, verified in Chrome, Safari and Firefox.
  })

  it("writes an identical rotation style for artwork with different bounding boxes", () => {
    // The fixture's case D, reduced to what a DOM test can see: the rotation
    // node is a pure function of the value, never of what it contains, so two
    // hands at one angle stay collinear however differently they are drawn.
    const { container } = render(
      <Mainplate min={0} max={8}>
        <Hand value={1} length={90} />
        <Hand value={1} length={90} tail={25} width={12} />
      </Mainplate>,
    )
    const [first, second] = container.querySelectorAll('[data-mp="hand"] > g')
    expect(first?.getAttribute("style")).toBe(recipe(45))
    expect(second?.getAttribute("style")).toBe(first?.getAttribute("style"))
  })
})

describe("<Hand> — value to rotation", () => {
  it("rotates by exactly the value's angle, with no ±90 correction", () => {
    // Artwork points up (−y) at 0, so the rotation *is* the angle. A hand at a
    // quarter of a full sweep points due east at exactly 90 degrees.
    const cases: Array<[number, number]> = [
      [0, 0],
      [15, 90],
      [30, 180],
      [45, 270],
    ]
    for (const [value, deg] of cases) {
      const { container } = render(
        <Mainplate min={0} max={60}>
          <Hand value={value} />
        </Mainplate>,
      )
      expect(rotation(container)?.getAttribute("style")).toBe(recipe(deg))
    }
  })

  it("follows the frame's startAngle and sweepAngle", () => {
    const { container } = render(
      <Mainplate min={0} max={10} startAngle={-135} sweepAngle={270}>
        <Hand value={5} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(0))
  })

  it("quantises the rotation through fmt", () => {
    // A seventh of a turn is 51.428571…: raw, it serializes differently on the
    // server's engine and the browser's, which is a hydration mismatch on the
    // one node the whole library animates.
    const { container } = render(
      <Mainplate min={0} max={7}>
        <Hand value={1} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(51.4286))
  })
})

describe("<Hand> — the local scale override", () => {
  it("reads its own domain without mutating the frame", () => {
    // A clock is three hands with three different maxima on one frame. If the
    // override leaked into the frame, every sibling would read the hour scale.
    let seen: Frame | undefined
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={3} max={12} />
        <Hand value={3} />
        <FrameProbe onRead={(f) => (seen = f)} />
      </Mainplate>,
    )
    const [overridden, plain] = container.querySelectorAll('[data-mp="hand"] > g')
    expect(overridden?.getAttribute("style")).toBe(recipe(90))
    expect(plain?.getAttribute("style")).toBe(recipe(18))
    expect(seen?.max).toBe(60)
    expect(seen?.min).toBe(0)
  })

  it("overrides min, startAngle and sweepAngle locally too", () => {
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={0} min={-30} max={30} startAngle={-135} sweepAngle={270} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(0))
  })
})

describe("<Hand> — artwork", () => {
  it("draws a built-in shape honouring length, tail and width", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} length={90} tail={20} width={6} />
      </Mainplate>,
    )
    // Up is −y, so the tip is at −90 and the counterweight at +20.
    expect(container.querySelector('[data-mp="hand"] path')?.getAttribute("d")).toBe(
      "M -3 20 L -3 -90 L 3 -90 L 3 20 Z",
    )
  })

  it("renders arbitrary SVG children instead of the built-in shape", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0}>
          <polygon points="0,0 1,1 2,2" />
        </Hand>
      </Mainplate>,
    )
    // Queried from the root rather than through `artwork()`, whose optional
    // chain would make this pass against a component that rendered nothing.
    expect(container.querySelector('[data-mp="hand"] > g > g > polygon')).not.toBeNull()
    expect(container.querySelector('[data-mp="hand"] path')).toBeNull()
  })

  it("moves the rotation point with pivot, in the artwork's own space", () => {
    // Artwork drawn around (40, 260) in Figma pivots there once told to: the
    // correction group slides that point onto the rotation group's origin.
    const { container } = render(
      <Mainplate>
        <Hand value={0} pivot={[40, 260]}>
          <circle cx={40} cy={260} r={4} />
        </Hand>
      </Mainplate>,
    )
    expect(artwork(container)?.getAttribute("transform")).toBe(
      "translate(0 0) scale(1) translate(-40 -260)",
    )
  })

  it("defaults pivot to the artwork origin", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} />
      </Mainplate>,
    )
    expect(artwork(container)?.getAttribute("transform")).toBe(
      "translate(0 0) scale(1) translate(0 0)",
    )
  })

  it("scales artwork not authored in dial units", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} scale={0.25} pivot={[12, 400]} />
      </Mainplate>,
    )
    // Pivot is subtracted first, in the artwork's own units, then the whole
    // thing is scaled — the other order would scale the pivot as well.
    expect(artwork(container)?.getAttribute("transform")).toBe(
      "translate(0 0) scale(0.25) translate(-12 -400)",
    )
  })

  it("applies nudge after the scale, in dial units", () => {
    // An optical correction is on the face, so it must not change size when
    // the artwork is rescaled.
    const { container } = render(
      <Mainplate>
        <Hand value={0} scale={2} nudge={[0, -1.5]} />
      </Mainplate>,
    )
    expect(artwork(container)?.getAttribute("transform")).toBe(
      "translate(0 -1.5) scale(2) translate(0 0)",
    )
  })
})

describe("<Hand> — the DOM contract", () => {
  it("emits a static data-mp, the consumer's transition hook", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("data-mp")).toBe("hand")
  })

  it("defaults fill to currentColor, and lets an explicit fill replace it", () => {
    const { container: themed } = render(
      <Mainplate>
        <Hand value={0} />
      </Mainplate>,
    )
    expect(position(themed)?.getAttribute("fill")).toBe("currentColor")

    const { container: painted } = render(
      <Mainplate>
        <Hand value={0} fill="#0af" />
      </Mainplate>,
    )
    expect(position(painted)?.getAttribute("fill")).toBe("#0af")
  })

  it("spreads SVG props onto the position group", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} className="seconds" opacity={0.5} />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("class")).toBe("seconds")
    expect(position(container)?.getAttribute("opacity")).toBe("0.5")
  })

  it("refuses a caller's transform at compile time", () => {
    const { container } = render(
      <Mainplate>
        {/* @ts-expect-error — the position group's transform is the position */}
        <Hand value={0} transform="scale(2)" />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("transform")).toBe("translate(0 0)")
  })

  it("hands the root element to render, still carrying data-mp", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} render={(props) => <g {...props} data-wrapped="yes" />} />
      </Mainplate>,
    )
    const root = position(container)
    expect(root?.getAttribute("data-wrapped")).toBe("yes")
    expect(root?.getAttribute("transform")).toBe("translate(0 0)")
    expect(rotation(container)).not.toBeNull()
  })
})
