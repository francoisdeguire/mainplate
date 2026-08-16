// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { createSource } from "../core/source"

/**
 * `<Clock>` and `<Gauge>` on a real server. Modules are imported dynamically
 * after the environment is proven, so a module-scope DOM touch fails the
 * specific test rather than crashing the file.
 *
 * The contract both tier-1 faces inherit from the core: **no live value
 * reaches server HTML.** A hand renders translate-only, a gauge's sweep fill
 * renders empty, and a meter fed by a `Source` renders no `aria-valuenow` at
 * all — the client writes each of them through a ref after mount. That is
 * what makes two server renders byte-identical while real time moves between
 * them, and what makes hydration structurally incapable of flaking.
 */
/**
 * The inline styles of the hands in a rendered document. Ticks legitimately
 * carry a `rotate()` — they are static marks and their angle is not a reading
 * — so the no-live-value claim has to be made about the hands specifically.
 */
function handStyles(html: string): string[] {
  return [...html.matchAll(/style="([^"]*)"[^>]*data-mp="hand"/g)].map((m) => m[1] ?? "")
}

describe("<Clock> on the server", () => {
  it("runs in a genuinely DOM-less environment", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
    expect(typeof requestAnimationFrame).toBe("undefined")
    expect(typeof IntersectionObserver).toBe("undefined")
    expect(typeof matchMedia).toBe("undefined")
  })

  it("imports both wrappers without touching the DOM", async () => {
    const clock = await import("./clock")
    const gauge = await import("./gauge")
    const barrel = await import("./index")
    expect(typeof clock.Clock).toBe("function")
    expect(typeof gauge.Gauge).toBe("function")
    expect(typeof barrel.Clock).toBe("function")
    expect(typeof barrel.Gauge).toBe("function")
  })

  it("renders byte-identically across two calls while real time moves", async () => {
    const { Clock } = await import("./clock")
    const first = renderToString(<Clock timezone="UTC" />)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = renderToString(<Clock timezone="UTC" />)
    expect(second).toBe(first)
    const hands = handStyles(first)
    expect(hands).toHaveLength(3)
    for (const style of hands) {
      // Translate-only: the pivot is static, the reading is the client's.
      expect(style).toContain("translate(-50%")
      expect(style).not.toContain("rotate(")
    }
  })

  it("serves the 10:09:36 pose: a live clock's HTML is the frozen pose's HTML", async () => {
    const { Clock } = await import("./clock")
    // §9.5 — every field reads the marketing time on the server, so the live
    // face and the face frozen at that instant are the same document. Real
    // time is nowhere near 10:09:36, which is what gives this teeth: emit any
    // live value into the markup and the two diverge.
    const live = renderToString(<Clock timezone="UTC" />)
    const posed = renderToString(<Clock timezone="UTC" time={new Date("2026-01-15T10:09:36Z")} />)
    expect(live).toBe(posed)
  })

  it("keeps the root contract: role, label, container, aspect ratio", async () => {
    const { Clock } = await import("./clock")
    const html = renderToString(<Clock label="Wall clock" />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Wall clock"')
    expect(html).toContain("container-type:inline-size")
    expect(html).toContain("aspect-ratio:220 / 220")
  })
})

describe("<Gauge> on the server", () => {
  it("renders a controlled meter completely: role, bounds, value, readout", async () => {
    const { Gauge } = await import("./gauge")
    const html = renderToString(<Gauge value={72.4} max={220} label="Speed" />)
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-label="Speed"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="220"')
    expect(html).toContain('aria-valuenow="72"')
    expect(html).toContain(">72<")
  })

  it("omits aria-valuenow entirely when the value is a Source", async () => {
    const { Gauge } = await import("./gauge")
    const src = createSource(50, { min: 0, max: 100 })
    const html = renderToString(<Gauge value={src} label="Speed" />)
    // The bounds are static and safe to serve; the reading is not. A server
    // rendering it would either bake a stale number into the accessibility
    // tree or fight hydration — the deferred frame.tsx item, settled here.
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="100"')
    expect(html).not.toContain("aria-valuenow")
  })

  it("keeps a live gauge's whole reading out of the markup", async () => {
    const { Gauge } = await import("./gauge")
    const src = createSource(50, { min: 0, max: 100 })
    const face = () => <Gauge value={src} indicator="sweep" />
    const first = renderToString(face())
    src.set(90)
    expect(renderToString(face())).toBe(first)
    expect(handStyles(first)).toHaveLength(0)
    // The sweep fill is the gauge's own live path: rendered empty, written on
    // mount. The readout beside it is empty for the same reason.
    expect(first).toContain('d=""')
  })
})
