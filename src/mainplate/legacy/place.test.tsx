// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { rectOutline } from "../core/outline"
import { Mainplate } from "./frame"
import { Place } from "./place"

/** The three groups of the §2.9 recipe: position, rotation, local space. */
const position = (c: HTMLElement) => c.querySelector('[data-mp="place"]')
const rotation = (c: HTMLElement) => c.querySelector('[data-mp="place"] > g')
const local = (c: HTMLElement) => c.querySelector('[data-mp="place"] > g > g')

const recipe = (deg: number) => `rotate: ${deg}deg; transform-box: view-box; transform-origin: 0 0;`

const square = rectOutline({ ratio: 1 })

describe("<Place> — position", () => {
  it("renders children inside a group translated to the resolved point", () => {
    const { container } = render(
      <Mainplate>
        <Place at="3h">
          <circle r={4} />
        </Place>
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("transform")).toBe("translate(100 0)")
    expect(container.querySelector('[data-mp="place"] circle')).not.toBeNull()
  })

  it("accepts every `at` form", () => {
    const cases: Array<[Parameters<typeof Place>[0]["at"], string]> = [
      [270, "translate(-100 0)"],
      ["9h", "translate(-100 0)"],
      [[10, -20], "translate(10 -20)"],
    ]
    for (const [at, expected] of cases) {
      const { container } = render(
        <Mainplate>
          <Place at={at} />
        </Mainplate>,
      )
      expect(position(container)?.getAttribute("transform")).toBe(expected)
    }
  })

  it("anchors on r from the centre, or on inset from the outline edge", () => {
    const { container: byRadius } = render(
      <Mainplate outline={square}>
        <Place at="3h" r={60} />
      </Mainplate>,
    )
    expect(position(byRadius)?.getAttribute("transform")).toBe("translate(60 0)")

    const { container: byInset } = render(
      <Mainplate outline={square}>
        <Place at="3h" inset={10} />
      </Mainplate>,
    )
    expect(position(byInset)?.getAttribute("transform")).toBe("translate(90 0)")
  })

  it("defaults to the outline edge, following the shape", () => {
    // The corner of a square, where an r-anchored default would sit at 100.
    const { container } = render(
      <Mainplate outline={square}>
        <Place at={45} />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("transform")).toBe("translate(100 -100)")
  })

  it("quantises the translation through fmt", () => {
    const { container } = render(
      <Mainplate>
        <Place at={37} r={91} />
      </Mainplate>,
    )
    // Angle 37 is irrational in both coordinates; raw floats here differ
    // between the server's engine and the browser's and mismatch on hydration.
    expect(position(container)?.getAttribute("transform")).toMatch(
      /^translate\(-?\d+(\.\d{1,4})? -?\d+(\.\d{1,4})?\)$/,
    )
  })

  it("throws when both r and inset are given", () => {
    expect(() =>
      render(
        <Mainplate>
          {/* @ts-expect-error — r and inset are exactly-one-of */}
          <Place at="3h" r={90} inset={6} />
        </Mainplate>,
      ),
    ).toThrow(/only one of/i)
  })

  it("spreads SVG props onto the positioned group", () => {
    const { container } = render(
      <Mainplate>
        <Place at="3h" className="date" opacity={0.5} />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("class")).toBe("date")
    expect(position(container)?.getAttribute("opacity")).toBe("0.5")
  })

  it("defaults fill to currentColor, so unfilled children theme with color", () => {
    const { container } = render(
      <Mainplate>
        <Place at="3h">
          <circle r={4} />
          <circle r={2} fill="#f00" />
        </Place>
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("fill")).toBe("currentColor")
    // A child's own paint still wins: attributes beat inherited fill in SVG.
    expect(container.querySelector('circle[r="2"]')?.getAttribute("fill")).toBe("#f00")
  })

  it("lets an explicit fill replace the currentColor default", () => {
    const { container } = render(
      <Mainplate>
        <Place at="3h" fill="#0af" />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("fill")).toBe("#0af")
  })

  it("refuses a caller's transform at compile time", () => {
    // The spread lands after the position transform, so a caller's would
    // replace it and drop the artwork at the centre with nothing in the
    // console — the silent-failure class this library is built to avoid.
    const { container } = render(
      <Mainplate>
        {/* @ts-expect-error — the position group's transform is the position */}
        <Place at="3h" transform="scale(2)" />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("transform")).toBe("translate(100 0)")
  })
})

describe("<Place> — orientation", () => {
  it("leaves children upright by default", () => {
    // The escape hatch carries arbitrary artwork — a logo, a date window, a
    // line of text. Rotating that by default puts "SWISS MADE" upside down at 6h.
    const { container } = render(
      <Mainplate>
        <Place at="6h" />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(0))
  })

  it("rotates by the same rule <Ticks> uses, on the same enum", () => {
    // Angle 60 lands on the right edge of a square: `edge` resolves to 90 —
    // the outward normal points along +x — while `radial` stays on the ray.
    const seen: Record<string, string | null | undefined> = {}
    for (const orient of ["radial", "tangential", "edge", "upright"] as const) {
      const { container } = render(
        <Mainplate outline={square}>
          <Place at={60} orient={orient} />
        </Mainplate>,
      )
      seen[orient] = rotation(container)?.getAttribute("style")
    }
    expect(seen).toEqual({
      radial: recipe(60),
      tangential: recipe(150),
      edge: recipe(90),
      upright: recipe(0),
    })
  })

  it("orients a tuple position from its own angle", () => {
    const { container } = render(
      <Mainplate>
        <Place at={[100, 0]} orient="radial" />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(90))
  })
})

describe("<Place> — offset and nudge", () => {
  it("shifts tangentially for offset, in the frame's own space", () => {
    // Tangential at 12h is +x; at 3h it is +y. Independent of `orient`, so a
    // scalar tangential shift stays tangential however the artwork is turned.
    const { container: twelve } = render(
      <Mainplate>
        <Place at="12h" offset={5} />
      </Mainplate>,
    )
    expect(position(twelve)?.getAttribute("transform")).toBe("translate(5 -100)")

    const { container: three } = render(
      <Mainplate>
        <Place at="3h" offset={5} />
      </Mainplate>,
    )
    expect(position(three)?.getAttribute("transform")).toBe("translate(100 5)")
  })

  it("applies nudge in local space, after the rotation", () => {
    // At 3h with orient="radial" the local frame is turned a quarter turn, so
    // a local [0, -10] is 10 units further out along +x on screen. Applying it
    // before the rotation would fold it into the position group instead and
    // move the artwork 10 units *up* the face.
    const { container } = render(
      <Mainplate>
        <Place at="3h" orient="radial" nudge={[0, -10]} />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("transform")).toBe("translate(100 0)")
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(90))
    expect(local(container)?.getAttribute("transform")).toBe("translate(0 -10)")
  })

  it("keeps offset and nudge on separate groups, so both compose", () => {
    const { container } = render(
      <Mainplate>
        <Place at="12h" offset={5} nudge={[2, -3]} />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("transform")).toBe("translate(5 -100)")
    expect(local(container)?.getAttribute("transform")).toBe("translate(2 -3)")
  })

  it("keeps the recipe's three groups even when nothing shifts", () => {
    // One shape, always: <Hand> follows the same recipe, and a group that
    // appears only sometimes is a second shape to reason about and to style.
    const { container } = render(
      <Mainplate>
        <Place at="12h">
          <circle r={4} />
        </Place>
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("transform")).toBe("translate(0 -100)")
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(0))
    expect(local(container)?.getAttribute("transform")).toBe("translate(0 0)")
    expect(local(container)?.querySelector("circle")).not.toBeNull()
  })
})
