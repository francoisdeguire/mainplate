// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Dial } from "./dial"
import { Mainplate } from "./frame"
import { circleOutline, rectOutline } from "./outline"

const dials = (c: HTMLElement) => [...c.querySelectorAll('[data-mp="dial"]')]
const dial = (c: HTMLElement) => c.querySelector('[data-mp="dial"]')

describe("<Dial>", () => {
  it("emits exactly one path, carrying the part attribute", () => {
    const { container } = render(
      <Mainplate>
        <Dial fill="#111" />
      </Mainplate>,
    )
    expect(dials(container)).toHaveLength(1)
    expect(dial(container)?.tagName).toBe("path")
  })

  it("draws the outline at inset 0 by default", () => {
    const { container } = render(
      <Mainplate>
        <Dial fill="#111" />
      </Mainplate>,
    )
    expect(dial(container)?.getAttribute("d")).toBe(circleOutline().path())
  })

  it("honours inset", () => {
    const { container } = render(
      <Mainplate>
        <Dial inset={12} fill="#111" />
      </Mainplate>,
    )
    expect(dial(container)?.getAttribute("d")).toBe(circleOutline().path(12))
    // And the inset is doing something: the default is a different shape.
    expect(dial(container)?.getAttribute("d")).not.toBe(circleOutline().path())
  })

  it("insets in the outline's own shape, not a circle's", () => {
    const outline = rectOutline({ ratio: 0.78, radius: 14 })
    const { container } = render(
      <Mainplate outline={outline}>
        <Dial inset={6} fill="#111" />
      </Mainplate>,
    )
    expect(dial(container)?.getAttribute("d")).toBe(outline.path(6))
  })

  it("defaults fill to currentColor, so an ancestor's color themes the surface", () => {
    const { container } = render(
      <Mainplate>
        <Dial />
      </Mainplate>,
    )
    expect(dial(container)?.getAttribute("fill")).toBe("currentColor")
  })

  it("lets an explicit fill replace the currentColor default", () => {
    const { container } = render(
      <Mainplate>
        <Dial fill="#111" />
      </Mainplate>,
    )
    expect(dial(container)?.getAttribute("fill")).toBe("#111")
  })

  it("spreads SVG props onto the path", () => {
    const { container } = render(
      <Mainplate>
        <Dial inset={4} fill="url(#grad)" fillOpacity={0.5} className="surface" id="face" />
      </Mainplate>,
    )
    const path = dial(container)
    expect(path?.getAttribute("fill")).toBe("url(#grad)")
    expect(path?.getAttribute("fill-opacity")).toBe("0.5")
    expect(path?.getAttribute("class")).toBe("surface")
    expect(path?.getAttribute("id")).toBe("face")
  })

  it("refuses stroking at compile time — every stroked ring is an <Arc>", () => {
    const { container } = render(
      <Mainplate>
        {/* @ts-expect-error — <Dial> is fill-only per §11.1 */}
        <Dial stroke="#fff" />
        {/* @ts-expect-error — <Dial> is fill-only per §11.1 */}
        <Dial strokeWidth={2} />
        {/* @ts-expect-error — the path data is the outline's, not the caller's */}
        <Dial d="M 0 0 L 1 1" />
      </Mainplate>,
    )
    // The type is the whole guard: at runtime these still render a surface.
    expect(dials(container)).toHaveLength(3)
  })
})
