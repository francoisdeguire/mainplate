// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { rectOutline } from "../core/outline"
import type { TickContext } from "../core/tick-scale"
import { Mainplate } from "./frame"
import { Ticks } from "./ticks"

const paths = (c: HTMLElement) => [...c.querySelectorAll('[data-mp="ticks"] path')]

describe("<Ticks>", () => {
  it("merges same-paint marks into a single path", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Ticks count={60} inset={6} length={4} width={1} fill="#fff" />
      </Mainplate>,
    )
    expect(paths(container)).toHaveLength(1)
  })

  it("splits into one path per distinct paint", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Ticks
          tiers={[
            { every: 1, length: 4, fill: "#555" },
            { every: 5, length: 10, fill: "#eee" },
          ]}
          inset={6}
          width={1}
        />
      </Mainplate>,
    )
    expect(paths(container)).toHaveLength(2)
  })

  it("keeps one path when only geometry varies", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Ticks
          count={40}
          inset={8}
          width={1}
          fill="#fff"
          length={({ t }: TickContext) => 3 + t * 9}
        />
      </Mainplate>,
    )
    expect(paths(container)).toHaveLength(1)
  })

  it("grows inward from the anchor when align is inside", () => {
    // One mark at 12 o'clock on the circle edge: anchor (0, -100), up is
    // screen-up. `inside` puts the outer edge on the anchor, so the quad must
    // span y in [-100, -90] — growing outward instead would put it at -110.
    const { container } = render(
      <Mainplate max={60}>
        <Ticks ticks={[{ value: 0 }]} inset={0} align="inside" length={10} width={2} fill="#fff" />
      </Mainplate>,
    )
    expect(paths(container)[0]?.getAttribute("d")).toBe("M -1 -90 L -1 -100 L 1 -100 L 1 -90 Z")
  })

  it("orients edge marks perpendicular to the outline edge, not the radius", () => {
    // Value 10 of 60 is angle 60, which lands on the *right edge* of a square.
    // The edge normal there is horizontal, so the mark must grow along -x from
    // the anchor (100, -57.735) — a radial mark would grow along the 60-degree
    // radius instead and produce a tilted quad.
    const { container } = render(
      <Mainplate max={60} outline={rectOutline({ ratio: 1 })}>
        <Ticks
          ticks={[{ value: 10 }]}
          inset={0}
          align="inside"
          orient="edge"
          length={10}
          width={2}
          fill="#fff"
        />
      </Mainplate>,
    )
    expect(paths(container)[0]?.getAttribute("d")).toBe(
      "M 90 -58.735 L 100 -58.735 L 100 -56.735 L 90 -56.735 Z",
    )
  })

  it("carries the part attribute", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Ticks count={12} inset={6} length={4} width={1} fill="#fff" />
      </Mainplate>,
    )
    expect(container.querySelector('[data-mp="ticks"]')).not.toBeNull()
  })

  it("emits one node per mark when renderItem is used", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Ticks
          count={12}
          inset={6}
          renderItem={({ point, index }) => <circle key={index} cx={point.x} cy={point.y} r={2} />}
        />
      </Mainplate>,
    )
    expect(container.querySelectorAll('[data-mp="ticks"] circle')).toHaveLength(12)
  })

  it("gives renderItem the outline normal, which differs per edge on a rect", () => {
    const normals: string[] = []
    render(
      <Mainplate max={60} outline={rectOutline({ ratio: 1 })}>
        <Ticks
          ticks={[{ value: 0 }, { value: 15 }]}
          renderItem={({ normal, index }) => {
            normals.push(`${Math.round(normal.x)},${Math.round(normal.y)}`)
            return <circle key={index} r={1} />
          }}
        />
      </Mainplate>,
    )
    expect(normals).toEqual(["0,1", "-1,0"])
  })

  it("hands renderItem the rotation that orient resolves to", () => {
    // Value 10 of 60 is angle 60, which lands on the right edge of a square.
    // `edge` must resolve to 90 — the outward normal points along +x — while
    // `radial` stays at the ray's own 60. Without a rotation on the mark,
    // `orient` is a silent no-op for custom artwork: the built-in quad turns
    // and a renderItem mark does not, and the consumer cannot even reimplement
    // the recipe from what they are handed.
    const seen: Record<string, number | undefined> = {}
    for (const orient of ["radial", "tangential", "edge", "upright"] as const) {
      render(
        <Mainplate max={60} outline={rectOutline({ ratio: 1 })}>
          <Ticks
            ticks={[{ value: 10 }]}
            orient={orient}
            renderItem={(mark) => {
              seen[orient] = mark.rotation
              return <circle key={mark.index} r={1} />
            }}
          />
        </Mainplate>,
      )
    }
    expect(seen).toEqual({ radial: 60, tangential: 150, edge: 90, upright: 0 })
  })

  it("quantizes the geometry handed to renderItem", () => {
    // `fmt` protects the library's own path strings from engine float drift,
    // but renderItem coordinates went out raw: Math.cos differs in the last
    // ULP between the server's JSC and the browser's V8, so a consumer's
    // <text x={mark.point.x}> hydration-mismatched on real pages. The mark's
    // numbers go through the same 4dp quantisation fmt applies to path data,
    // so both sides serialize the same string.
    const seen: number[] = []
    render(
      <Mainplate max={60}>
        <Ticks
          ticks={[{ value: 7 }]}
          inset={9}
          orient="edge"
          renderItem={({ point, normal, rotation, index }) => {
            seen.push(point.x, point.y, normal.x, normal.y, rotation)
            return <circle key={index} r={1} />
          }}
        />
      </Mainplate>,
    )
    // Angle 42 on a circle: every coordinate is irrational, and the edge
    // rotation comes off atan2 — raw, none of these survive toFixed(4) intact.
    expect(seen).toHaveLength(5)
    for (const n of seen) expect(n).toBe(Number(n.toFixed(4)))
  })

  it("keeps renderItem keys unique when marks share a value via at", () => {
    // `at` exists to nudge a mark without falsifying its value — the
    // tachymeter case — so two marks may share a `value` at different
    // positions. Keying the list on `value` would collide there; React
    // routes the duplicate-key warning through console.error.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const { container } = render(
        <Mainplate max={360}>
          <Ticks
            ticks={[
              { value: 30, at: 10 },
              { value: 30, at: 350 },
            ]}
            renderItem={({ point }) => <circle cx={point.x} cy={point.y} r={1} />}
          />
        </Mainplate>,
      )
      expect(container.querySelectorAll('[data-mp="ticks"] circle')).toHaveLength(2)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it("throws when both r and inset are given", () => {
    expect(() =>
      render(
        <Mainplate max={60}>
          {/* @ts-expect-error r and inset are exactly-one-of */}
          <Ticks count={4} r={90} inset={6} length={4} width={1} fill="#fff" />
        </Mainplate>,
      ),
    ).toThrow(/only one of/i)
  })

  it("keeps r, logs once and renders in production when both anchors are given", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const face = (anchor: object) => (
        <Mainplate max={60}>
          <Ticks count={4} {...anchor} length={4} width={1} fill="#fff" />
        </Mainplate>
      )
      const both = render(face({ r: 90, inset: 6 }))
      const rOnly = render(face({ r: 90 }))
      expect(paths(both.container)[0]?.getAttribute("d")).toBe(
        paths(rOnly.container)[0]?.getAttribute("d"),
      )

      render(face({ r: 90, inset: 6 }))
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/mainplate: <Ticks>/)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Ignoring `inset`/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
