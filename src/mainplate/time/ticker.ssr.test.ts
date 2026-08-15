// @vitest-environment node
import { describe, expect, it } from "vitest"

/**
 * The SSR proof. This file runs in a bare node environment — no `window`, no
 * `document`, no `requestAnimationFrame` — and imports the ticker dynamically
 * so a module-scope DOM touch surfaces as this test's failure rather than a
 * file-level crash. A careless `const raf = window.requestAnimationFrame` at
 * the top of ticker.ts is exactly what this catches.
 */
describe("ticker in a DOM-less runtime", () => {
  it("really has no DOM to lean on", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
    expect(typeof requestAnimationFrame).toBe("undefined")
  })

  it("imports without throwing", async () => {
    const mod = await import("./ticker")
    expect(typeof mod.createTicker).toBe("function")
    expect(typeof mod.getTicker).toBe("function")
  })

  it("creates the singleton lazily and reads the clock without a DOM", async () => {
    const { getTicker } = await import("./ticker")
    const t = getTicker()
    expect(getTicker()).toBe(t)
    expect(typeof t.now()).toBe("number")
    t.stop() // teardown is safe without a document too
  })
})
