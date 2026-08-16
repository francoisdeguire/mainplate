// @vitest-environment node
import { describe, expect, it } from "vitest"

/**
 * The SSR proof, on the same terms as the time layer's. This file runs in a
 * bare node environment and imports the module dynamically, so a module-scope
 * DOM touch surfaces as a failing test rather than a file-level crash.
 *
 * It matters more here than anywhere else in `faces/`: this module is the one
 * every part asks for its numbers, so it runs on the server for every face on
 * the page. It must be reachable with no `window`, and it must produce the
 * identical strings there that it produces in the browser — the quantisation
 * this module owns is exactly what makes that true.
 */
describe("faces/geometry in a DOM-less runtime", () => {
  it("really has no DOM to lean on", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
    expect(typeof requestAnimationFrame).toBe("undefined")
  })

  it("imports without throwing", async () => {
    const mod = await import("./geometry")
    expect(typeof mod.markTransform).toBe("function")
    expect(typeof mod.spanTransform).toBe("function")
  })

  it("computes a transform server-side, quantised", async () => {
    const { markTransform } = await import("./geometry")
    const { circleOutline } = await import("../core")
    const t = markTransform(
      circleOutline(),
      { angle: 90, inset: 10 },
      { width: 2, length: 8, boxW: 220, boxH: 220 },
    )
    expect(t).toEqual({
      left: "90.9091%",
      top: "50%",
      widthCqw: 0.9091,
      heightCqw: 3.6364,
      rotate: 90,
    })
  })
})
