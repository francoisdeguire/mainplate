// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { quantize } from "../core/geometry"
import { rectOutline } from "../core/outline"
import { estimateInk, inkClearance, type TickFace } from "./clearance"
import { Mainplate } from "./frame"
import { type NumeralGeometry, Numerals } from "./numerals"

const texts = (c: HTMLElement) => [...c.querySelectorAll('[data-mp="numerals"] text')]
const group = (c: HTMLElement) => c.querySelector('[data-mp="numerals"]')
const labels = (c: HTMLElement) => texts(c).map((t) => t.textContent)

/** The /lab/gallery speed gauge: the face the clearance solver was built for. */
const GAUGE = { min: 0, max: 220, startAngle: -135, sweepAngle: 270 }
const TRACK: TickFace = { r: 78, width: 2.2 }

type Captured = {
  label: string
  angle: number
  rotation: number
  point: { x: number; y: number }
}

/** Render a solved gauge and capture what renderItem is handed. */
function captureGauge(props: { orient?: "upright" | "radial"; fontSize: number }): Captured[] {
  const seen: Captured[] = []
  render(
    <Mainplate {...GAUGE}>
      <Numerals
        tiers={[{ every: 20 }]}
        track={TRACK}
        clearance={3}
        fontSize={props.fontSize}
        orient={props.orient ?? "upright"}
        renderItem={(mark) => {
          seen.push({
            label: mark.label,
            angle: mark.angle,
            rotation: mark.rotation,
            point: mark.point,
          })
          return null
        }}
      />
    </Mainplate>,
  )
  return seen
}

describe("<Numerals> — rendering", () => {
  it("draws one <text> per mark, labelled with the value, inside the part group", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Numerals tiers={[{ every: 15 }]} inset={20} />
      </Mainplate>,
    )
    expect(group(container)?.tagName).toBe("g")
    expect(labels(container)).toEqual(["0", "15", "30", "45"])
  })

  it("always anchors text at middle/central — positioning is geometric, never baseline-based", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Numerals tiers={[{ every: 15 }]} inset={20} />
      </Mainplate>,
    )
    for (const t of texts(container)) {
      expect(t.getAttribute("text-anchor")).toBe("middle")
      expect(t.getAttribute("dominant-baseline")).toBe("central")
    }
  })

  it("defaults fontSize to 12 and honours an explicit one", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Numerals tiers={[{ every: 15 }]} inset={20} />
      </Mainplate>,
    )
    expect(texts(container)[0]?.getAttribute("font-size")).toBe("12")

    const { container: sized } = render(
      <Mainplate max={60}>
        <Numerals tiers={[{ every: 15 }]} inset={20} fontSize={17} />
      </Mainplate>,
    )
    expect(texts(sized)[0]?.getAttribute("font-size")).toBe("17")
  })

  it("defaults fill to currentColor, and takes the item/function forms like <Ticks>", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Numerals tiers={[{ every: 15 }]} inset={20} />
      </Mainplate>,
    )
    for (const t of texts(container)) expect(t.getAttribute("fill")).toBe("currentColor")

    const { container: fn } = render(
      <Mainplate max={60}>
        <Numerals
          tiers={[{ every: 15 }]}
          inset={20}
          fill={({ value }) => (value === 0 ? "#f00" : "#aaa")}
        />
      </Mainplate>,
    )
    expect(texts(fn).map((t) => t.getAttribute("fill"))).toEqual(["#f00", "#aaa", "#aaa", "#aaa"])
  })

  it("spreads SVG props onto the group and keeps the static part attribute", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Numerals tiers={[{ every: 15 }]} inset={20} className="chapter" opacity={0.5} />
      </Mainplate>,
    )
    expect(group(container)?.getAttribute("class")).toBe("chapter")
    expect(group(container)?.getAttribute("opacity")).toBe("0.5")
    expect(group(container)?.getAttribute("data-mp")).toBe("numerals")
  })

  it("quantises every coordinate it emits or hands out", () => {
    const { container } = render(
      <Mainplate max={360}>
        {/* Angle 37 is irrational in both coordinates. */}
        <Numerals ticks={[{ value: 37 }]} r={91} />
      </Mainplate>,
    )
    const t = texts(container)[0]
    expect(t?.getAttribute("x")).toMatch(/^-?\d+(\.\d{1,4})?$/)
    expect(t?.getAttribute("y")).toMatch(/^-?\d+(\.\d{1,4})?$/)

    // The solver's bisection output reaches renderItem too, so it must come
    // back quantised — raw floats here were a real SSR hydration mismatch.
    for (const m of captureGauge({ fontSize: 11 })) {
      expect(m.point.x).toBe(quantize(m.point.x))
      expect(m.point.y).toBe(quantize(m.point.y))
      expect(m.rotation).toBe(quantize(m.rotation))
    }
  })
})

describe("<Numerals> — population is the tick pipeline", () => {
  it("merges tiers and honours a top-level skip exactly as <Ticks> does", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Numerals
          tiers={[
            { every: 5, fill: "#aaa" },
            { every: 15, fill: "#f00" },
          ]}
          inset={20}
          skip={[30]}
        />
      </Mainplate>,
    )
    const all = labels(container)
    expect(all).toHaveLength(11)
    expect(all).not.toContain("30")
    // Later tier wins at a shared position: the quarters draw once, in red.
    const red = texts(container).filter((t) => t.getAttribute("fill") === "#f00")
    expect(red.map((t) => t.textContent)).toEqual(["0", "15", "45"])
  })

  it("populates by count over from/to with the fencepost rules", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Numerals count={3} from={0} to={60} inset={20} />
      </Mainplate>,
    )
    // The covered arc closes on itself, so `to` folds onto `from`.
    expect(labels(container)).toEqual(["0", "20", "40"])
  })

  it("keys marks by tier and index, so two marks sharing a value via at coexist", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const { container } = render(
        <Mainplate max={60}>
          <Numerals ticks={[{ value: 12 }, { value: 12, at: 180 }]} inset={20} />
        </Mainplate>,
      )
      expect(labels(container)).toEqual(["12", "12"])
      // A `value`-keyed list would collide here and React would say so.
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })
})

describe("<Numerals> — format", () => {
  it("transforms the value into the drawn label", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Numerals tiers={[{ every: 15 }]} inset={20} format={({ value }) => `${value / 5}`} />
      </Mainplate>,
    )
    expect(labels(container)).toEqual(["0", "3", "6", "9"])
  })

  it("reads the authored item, typed", () => {
    const { container } = render(
      <Mainplate max={360}>
        <Numerals
          ticks={[
            { value: 0, label: "N" },
            { value: 90, label: "E" },
          ]}
          inset={20}
          format={({ item }) => item.label}
        />
      </Mainplate>,
    )
    expect(labels(container)).toEqual(["N", "E"])
  })
})

describe("<Numerals> — explicit anchoring", () => {
  it("centres the glyph box on r, or on the outline at inset", () => {
    const { container: byRadius } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 90 }]} r={70} />
      </Mainplate>,
    )
    expect(texts(byRadius)[0]?.getAttribute("x")).toBe("70")
    expect(texts(byRadius)[0]?.getAttribute("y")).toBe("0")

    const { container: byInset } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 90 }]} inset={15} />
      </Mainplate>,
    )
    expect(texts(byInset)[0]?.getAttribute("x")).toBe("85")
  })

  it("aligns the optical box, not a scalar: the radial half-extent at 3h is halfWidth", () => {
    const ink = estimateInk("220", 12)
    const render3h = (align: "inside" | "center" | "outside") => {
      const { container } = render(
        <Mainplate max={360}>
          <Numerals ticks={[{ value: 90 }]} r={70} align={align} format={() => "220"} />
        </Mainplate>,
      )
      return Number(texts(container)[0]?.getAttribute("x"))
    }
    expect(render3h("center")).toBeCloseTo(70, 4)
    expect(render3h("inside")).toBeCloseTo(70 - ink.halfWidth, 3)
    expect(render3h("outside")).toBeCloseTo(70 + ink.halfWidth, 3)
  })

  it("aligns by halfHeight at 12h, where the radial axis is the block axis", () => {
    const ink = estimateInk("220", 12)
    const { container } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 0 }]} r={70} align="inside" format={() => "220"} />
      </Mainplate>,
    )
    expect(Number(texts(container)[0]?.getAttribute("y"))).toBeCloseTo(-(70 - ink.halfHeight), 3)
  })

  it("throws when the anchors are combined", () => {
    expect(() =>
      render(
        <Mainplate max={60}>
          {/* @ts-expect-error — r and inset are exactly-one-of */}
          <Numerals count={4} r={70} inset={10} />
        </Mainplate>,
      ),
    ).toThrow(/only one of/i)

    expect(() =>
      render(
        <Mainplate max={60}>
          {/* @ts-expect-error — track is an anchor too: solver or explicit, never both */}
          <Numerals count={4} r={70} track={{ r: 80 }} clearance={3} />
        </Mainplate>,
      ),
    ).toThrow(/only one of/i)

    expect(() =>
      render(
        <Mainplate max={60}>
          {/* @ts-expect-error — clearance is the solved mode's distance; it needs track */}
          <Numerals count={4} clearance={3} />
        </Mainplate>,
      ),
    ).toThrow(/clearance/i)
  })

  it("prefers track, logs once and renders in production when anchors are combined", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const face = (anchor: object) => (
        <Mainplate min={0} max={220} startAngle={-135} sweepAngle={270}>
          <Numerals count={3} {...anchor} />
        </Mainplate>
      )
      const both = render(face({ r: 70, track: { r: 80, width: 2 }, clearance: 3 }))
      const solvedOnly = render(face({ track: { r: 80, width: 2 }, clearance: 3 }))
      const coords = (c: HTMLElement) =>
        texts(c).map((t) => `${t.getAttribute("x")},${t.getAttribute("y")}`)
      expect(coords(both.container)).toEqual(coords(solvedOnly.container))

      render(face({ r: 70, track: { r: 80, width: 2 }, clearance: 3 }))
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/mainplate: <Numerals>/)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Using `track`/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it("ignores clearance without track in production, saying so once", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const misused = render(
        <Mainplate max={60}>
          {/* @ts-expect-error — clearance is the solved mode's distance; it needs track */}
          <Numerals count={4} clearance={3} />
        </Mainplate>,
      )
      const plain = render(
        <Mainplate max={60}>
          <Numerals count={4} />
        </Mainplate>,
      )
      const coords = (c: HTMLElement) =>
        texts(c).map((t) => `${t.getAttribute("x")},${t.getAttribute("y")}`)
      expect(coords(misused.container)).toEqual(coords(plain.container))
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Ignoring `clearance`/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})

describe("<Numerals> — solved anchoring holds the clearance constant", () => {
  it("gives 0, 20 and 220 the same ink-to-tick clearance, to a tight tolerance", () => {
    const seen = captureGauge({ fontSize: 11 })
    expect(seen.map((m) => m.label)).toEqual(expect.arrayContaining(["0", "20", "220"]))
    for (const m of seen) {
      const c = inkClearance({
        ink: estimateInk(m.label, 11),
        angle: m.angle,
        rotation: m.rotation,
        tick: TRACK,
        r: Math.hypot(m.point.x, m.point.y),
      })
      // Within half a thousandth of a dial unit of the requested 3 — the
      // quantisation floor. A naive placement misses by whole units.
      expect(c).toBeCloseTo(3, 3)
    }
  })

  it("puts labels of different widths on different radii to do it", () => {
    const seen = captureGauge({ fontSize: 11 })
    const rOf = (label: string) => {
      const m = seen.find((s) => s.label === label)
      return m ? Math.hypot(m.point.x, m.point.y) : Number.NaN
    }
    // Both sit at diagonal angles (±135°); only their ink differs. Equal radii
    // here would mean the solver never saw the labels at all.
    expect(Math.abs(rOf("220") - rOf("0"))).toBeGreaterThan(1)
  })

  it("collapses to the scalar case when numerals rotate with their ray", () => {
    const seen = captureGauge({ fontSize: 11, orient: "radial" })
    const { halfHeight } = estimateInk("0", 11)
    for (const m of seen) {
      // Rotated with the ray, every label approaches its tick cap-band first,
      // whatever its width — so every radius is track.r − clearance − halfHeight.
      expect(Math.hypot(m.point.x, m.point.y)).toBeCloseTo(TRACK.r - 3 - halfHeight, 3)
      const c = inkClearance({
        ink: estimateInk(m.label, 11),
        angle: m.angle,
        rotation: m.rotation,
        tick: TRACK,
        r: Math.hypot(m.point.x, m.point.y),
      })
      expect(c).toBeCloseTo(3, 3)
    }
  })

  it("feeds fontSize to the ink estimate: bigger type solves further inward", () => {
    const xAt = (fontSize: number) => {
      const { container } = render(
        <Mainplate max={360}>
          <Numerals
            ticks={[{ value: 90 }]}
            track={{ r: 80, width: 2 }}
            clearance={3}
            fontSize={fontSize}
            format={() => "220"}
          />
        </Mainplate>,
      )
      return Number(texts(container)[0]?.getAttribute("x"))
    }
    // At 3h the box meets the tick edge-on: r = track.r − clearance − halfWidth.
    expect(xAt(8)).toBeCloseTo(80 - 3 - estimateInk("220", 8).halfWidth, 3)
    expect(xAt(16)).toBeCloseTo(80 - 3 - estimateInk("220", 16).halfWidth, 3)
    expect(xAt(16)).toBeLessThan(xAt(8))
  })
})

describe("<Numerals> — orientation", () => {
  it("stays upright by default: no rotation is applied to the text", () => {
    const { container } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 90 }]} r={70} />
      </Mainplate>,
    )
    expect(texts(container)[0]?.getAttribute("transform")).toBeNull()
  })

  it("rotates by the same rule <Ticks> uses, on the same enum", () => {
    // Angle 60 lands on the right edge of a square: `edge` resolves to 90
    // while `radial` stays on the ray — the divergence the enum exists for.
    const square = rectOutline({ ratio: 1 })
    const seen: Record<string, number> = {}
    for (const orient of ["radial", "tangential", "edge", "upright"] as const) {
      render(
        <Mainplate max={360} outline={square}>
          <Numerals
            ticks={[{ value: 60 }]}
            orient={orient}
            renderItem={(mark) => {
              seen[orient] = mark.rotation
              return null
            }}
          />
        </Mainplate>,
      )
    }
    expect(seen).toEqual({ radial: 60, tangential: 150, edge: 90, upright: 0 })
  })

  it("writes the rotation onto the default text about its own anchor", () => {
    const { container } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 90 }]} r={70} orient="radial" />
      </Mainplate>,
    )
    expect(texts(container)[0]?.getAttribute("transform")).toBe("rotate(90 70 0)")
  })
})

describe("<Numerals> — offset and nudge", () => {
  it("offsets along the mark's own side axis, as <Ticks> does — not the frame tangent", () => {
    // Upright at 3h: the mark's side axis is screen-x. The frame tangent there
    // is screen-y, so <Place>'s reading would move y instead — the divergence
    // this test pins down.
    const { container } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 90 }]} r={70} offset={5} />
      </Mainplate>,
    )
    expect(texts(container)[0]?.getAttribute("x")).toBe("75")
    expect(texts(container)[0]?.getAttribute("y")).toBe("0")
  })

  it("turns the offset with the mark under orient", () => {
    const { container } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 90 }]} r={70} offset={5} orient="radial" />
      </Mainplate>,
    )
    expect(texts(container)[0]?.getAttribute("x")).toBe("70")
    expect(texts(container)[0]?.getAttribute("y")).toBe("5")
  })

  it("nudges in local space, after the rotation", () => {
    // Unrotated, nudge is plain [right, down].
    const { container: upright } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 0 }]} r={70} nudge={[2, -3]} />
      </Mainplate>,
    )
    expect(upright && texts(upright)[0]?.getAttribute("x")).toBe("2")
    expect(texts(upright)[0]?.getAttribute("y")).toBe("-73")

    // At 3h with orient="radial" the local frame is turned a quarter turn, so
    // a local [0, -10] is 10 units further out along screen-x.
    const { container: radial } = render(
      <Mainplate max={360}>
        <Numerals ticks={[{ value: 90 }]} r={70} orient="radial" nudge={[0, -10]} />
      </Mainplate>,
    )
    expect(texts(radial)[0]?.getAttribute("x")).toBe("80")
    expect(texts(radial)[0]?.getAttribute("y")).toBe("0")
  })
})

describe("<Numerals> — renderItem", () => {
  it("replaces the built-in text and receives the item, typed, with resolved props", () => {
    const seen: NumeralGeometry<{ value: number; label: string }>[] = []
    const { container } = render(
      <Mainplate max={360}>
        <Numerals
          ticks={[
            { value: 0, label: "N" },
            { value: 90, label: "E" },
          ]}
          r={70}
          fill="#abc"
          renderItem={(mark) => {
            seen.push(mark)
            // Typed access to the authored item:
            mark.item.label.toUpperCase()
            // @ts-expect-error — not a field of the authored item
            mark.item.missing
            return <circle cx={mark.point.x} cy={mark.point.y} r={2} />
          }}
        />
      </Mainplate>,
    )
    expect(texts(container)).toHaveLength(0)
    expect(container.querySelectorAll('[data-mp="numerals"] circle')).toHaveLength(2)
    expect(seen.map((m) => m.item.label)).toEqual(["N", "E"])
    expect(seen.map((m) => m.label)).toEqual(["0", "90"])
    expect(seen[0]?.props.fill).toBe("#abc")
  })
})
