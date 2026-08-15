// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

/**
 * The diver on a real server — where the hydration ruling is decided.
 *
 * A watch field reads 10:09:36 on the server and the real time in the browser
 * (§9.5), so **every place a clock value reaches the DOM during render is a
 * hydration boundary.** Task 4 put `suppressHydrationWarning` on exactly one
 * node, `<Hand>`'s rotation group, and left the question of the meter root
 * open. This face answers it by not creating the boundary: no `role="meter"`,
 * no `aria-valuenow`, no formatted time in the accessible name. What is left
 * over is the three rotations — the nodes already scoped — and nothing else.
 *
 * The module is imported dynamically, after the environment is proven, so a
 * module-scope DOM touch fails the specific test rather than the whole file.
 */
describe("<Diver> on the server", () => {
  it("renders in a genuinely DOM-less environment", async () => {
    expect(typeof document).toBe("undefined")
    expect(typeof requestAnimationFrame).toBe("undefined")
    expect(typeof IntersectionObserver).toBe("undefined")
    const { Diver } = await import("./diver")
    expect(renderToString(<Diver />)).toContain('data-mp="mainplate"')
  })

  it("emits identical HTML on every request", async () => {
    const { Diver } = await import("./diver")
    const first = renderToString(<Diver />)
    // Real time moves between the two renders; the markup must not, or every
    // request would ship a different page and hydration would flake at random.
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(renderToString(<Diver />)).toBe(first)
  })

  it("puts no clock value into ARIA — the whole hydration ruling, in one assertion", async () => {
    const { Diver } = await import("./diver")
    const html = renderToString(<Diver />)
    expect(html).not.toContain("aria-valuenow")
    expect(html).not.toContain("aria-valuetext")
    expect(html).not.toContain('role="meter"')
    expect(html).toContain('aria-label="Diver watch face"')
  })

  it("confines the divergence to the three rotation nodes React already scopes", async () => {
    const { Diver } = await import("./diver")
    const html = renderToString(<Diver />)
    const rotations = [...html.matchAll(/rotate:\s*(-?[\d.]+)deg/g)].map((m) => Number(m[1]))
    // Five rotating groups, and the whole list is asserted so a sixth cannot
    // appear unnoticed: the wordmark's (upright, so zero), the power reserve
    // hand's, then hour, minute and seconds. The first two are pure functions
    // of props and read the same in every environment; the last three are the
    // marketing pose, 10:09:36, and they are the *only* numbers on this page
    // that will read differently once the browser takes over.
    expect(rotations).toHaveLength(5)
    expect(rotations[0]).toBe(0) // <Place>, orient="upright"
    expect(rotations[1]).toBeCloseTo(-58 + 0.72 * 116, 4) // power reserve
    expect(rotations[2]).toBeCloseTo((10.16 / 12) * 360, 3) // 10:09:36 → 304.8°
    expect(rotations[3]).toBeCloseTo((9.6 / 60) * 360, 3) // → 57.6°
    expect(rotations[4]).toBeCloseTo((36 / 60) * 360, 3) // → 216°
  })
})
