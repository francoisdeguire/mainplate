// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { useSourceValue } from "../core/use-source-value"

/**
 * §9.5 on a real server: no DOM, real timers. `get()` must serve 10:09:36 —
 * the horological marketing time — so the HTML is deterministic across
 * requests and hydration never flakes. The barrel is imported dynamically,
 * after the environment is proven, so a module-scope DOM touch fails the
 * specific test rather than crashing the whole file.
 */
describe("useWatchSource on the server", () => {
  it("runs in a genuinely DOM-less environment", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
    expect(typeof requestAnimationFrame).toBe("undefined")
    // The §9.6/§9.11 observers are browser-only — importing must not touch them.
    expect(typeof matchMedia).toBe("undefined")
    expect(typeof IntersectionObserver).toBe("undefined")
  })

  it("serves 10:09:36 from every field, stable across renders", async () => {
    const { useWatchSource } = await import("./index")
    function Probe() {
      const clock = useWatchSource()
      const line = [
        clock.hour.get(),
        clock.hour24.get(),
        clock.minute.get(),
        clock.second.get(),
        clock.ms.get(),
      ].join("|")
      return <output>{line}</output>
    }

    const first = renderToString(<Probe />)
    // Real time moves on between the two renders; the HTML must not.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = renderToString(<Probe />)
    expect(second).toBe(first)

    const values = first
      .replace(/<[^>]+>/g, "")
      .split("|")
      .map(Number)
    // 10:09:36 → hour 10 + 9.6/60, minute 9 + 36/60, second 36, ms 0.
    expect(values[0]).toBeCloseTo(10.16, 10)
    expect(values[1]).toBeCloseTo(10.16, 10)
    expect(values[2]).toBeCloseTo(9.6, 10)
    expect(values[3]).toBe(36)
    expect(values[4]).toBe(0)
  })

  it("serves the observe ref without touching IntersectionObserver on the server", async () => {
    const { useWatchSource } = await import("./index")
    let observeType = ""
    function Face() {
      const clock = useWatchSource()
      observeType = typeof clock.observe
      // renderToString never invokes callback refs, so a face wired for §9.11
      // renders on the server without an IntersectionObserver existing at all.
      return <div ref={clock.observe}>{clock.second.get()}</div>
    }
    expect(renderToString(<Face />)).toContain(">36<")
    expect(observeType).toBe("function")
  })

  it("feeds useSourceValue's server snapshot the same marketing time", async () => {
    const { useWatchSource } = await import("./index")
    function Readout() {
      const clock = useWatchSource({ second: "tick" })
      return <output>{useSourceValue(clock.second)}</output>
    }
    expect(renderToString(<Readout />)).toContain(">36<")
  })
})
