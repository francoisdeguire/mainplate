// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { createSource } from "../core/source"

/**
 * The face core on a real server: no DOM, no rAF, no observers. Every module
 * is imported dynamically AFTER the environment is proven, so a module-scope
 * DOM touch fails the specific test rather than crashing the whole file.
 *
 * The determinism contract this file pins: **no live value reaches a
 * server-rendered style.** A hand renders translate-only on the server; the
 * rotation is written client-side by the binder. That is what makes two
 * renders byte-identical while real time moves between them — and what makes
 * hydration structurally incapable of flaking on a clock face.
 */
describe("the face core on the server", () => {
  it("runs in a genuinely DOM-less environment", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
    expect(typeof requestAnimationFrame).toBe("undefined")
    expect(typeof IntersectionObserver).toBe("undefined")
  })

  it("imports every faces module without touching the DOM", async () => {
    const geometry = await import("./geometry")
    const palette = await import("./palette")
    const binder = await import("./bind-rotation")
    const mainplate = await import("./mainplate")
    const parts = await import("./parts")
    const barrel = await import("./index")
    expect(typeof geometry.markTransform).toBe("function")
    expect(typeof palette.paletteVars).toBe("function")
    expect(typeof binder.bindRotation).toBe("function")
    expect(typeof mainplate.Mainplate).toBe("function")
    expect(typeof parts.Hand).toBe("function")
    expect(typeof barrel.Mainplate).toBe("function")
  })

  it("renders a static face byte-identically across two calls", async () => {
    const { Mainplate } = await import("./mainplate")
    const { Hand } = await import("./parts")
    const face = (
      <Mainplate label="Static">
        <Hand value={10} />
      </Mainplate>
    )
    const first = renderToString(face)
    // Real time moves on between the two renders; the HTML must not.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = renderToString(face)
    expect(second).toBe(first)
  })

  it("keeps every rotation out of the server HTML — hands are translate-only", async () => {
    const { Mainplate } = await import("./mainplate")
    const { Cap, Dial, Hand } = await import("./parts")
    const src = createSource(30, { min: 0, max: 60 })
    const face = () => (
      <Mainplate label="Live">
        <Dial />
        <Hand value={src} type="second" tick />
        <Hand value={10} />
        <Cap />
      </Mainplate>
    )
    const first = renderToString(face())
    // The binder owns rotation; render never reads the value, so a source
    // write between renders cannot reach the HTML.
    src.set(45)
    const second = renderToString(face())
    expect(second).toBe(first)
    expect(first).not.toContain("rotate(")
    // The translate half of the transform IS there — the pivot is static.
    expect(first).toContain("translate(-50%")
  })

  it("renders the root contract: role, label, container, aspect ratio", async () => {
    const { Mainplate } = await import("./mainplate")
    const html = renderToString(<Mainplate label="Analog clock" />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Analog clock"')
    expect(html).toContain("container-type:inline-size")
    // The circle outline's bbox is 200 wide, grown by 10 padding a side.
    expect(html).toContain("aspect-ratio:220 / 220")
  })
})
