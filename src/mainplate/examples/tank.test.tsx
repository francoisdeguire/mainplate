// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Mainplate, type Point, rectOutline, Ticks } from "../core"
import { Tank } from "./tank"

/** The Tank's case, restated here so the tests never read it from the source. */
const CASE = { ratio: 0.78, radius: 12 }

/** Where the chemin de fer is anchored, and how long a tie is. */
const RAIL_INSET = 5
const TIE_LENGTH = 6

/**
 * Recover each mark's **anchor point** from a merged tick path.
 *
 * A mark is `M c0 L c1 L c2 L c3 Z`, and `align="inside"` puts the anchor on
 * the outer edge, so the four corners' centroid sits half a tie inward of it
 * along the mark's own outward axis. That axis times the tie length is exactly
 * `c1 - c0`, so walking back is half of that vector and the length never has
 * to be restated. Reconstructed rather than read off `c0`, because a corner
 * tie is rotated and its first corner is not comparable with a flank tie's —
 * the thing being measured is where the marks *sit*.
 */
function anchors(d: string): Point[] {
  return d
    .split("Z")
    .filter((mark) => mark.trim().length > 0)
    .map((mark) => {
      const n = [...mark.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
      const [x0, y0, x1, y1, x2, y2, x3, y3] = n
      if (
        x0 === undefined ||
        y0 === undefined ||
        x1 === undefined ||
        y1 === undefined ||
        x2 === undefined ||
        y2 === undefined ||
        x3 === undefined ||
        y3 === undefined
      ) {
        throw new Error(`malformed mark: ${mark}`)
      }
      const cx = (x0 + x1 + x2 + x3) / 4
      const cy = (y0 + y1 + y2 + y3) / 4
      return { x: cx + (x1 - x0) / 2, y: cy + (y1 - y0) / 2 }
    })
}

/** Centre-to-centre distance between neighbouring marks, all the way round. */
function gaps(points: Point[]): number[] {
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length]
    if (b === undefined) throw new Error("no neighbour")
    return Math.hypot(b.x - a.x, b.y - a.y)
  })
}

/** How uneven a run of marks is: the widest gap over the narrowest. */
function spread(points: Point[]): number {
  const g = gaps(points)
  return Math.max(...g) / Math.min(...g)
}

/** The Tank's chemin de fer, as anchor points in population order. */
function cheminDeFer(container: HTMLElement): Point[] {
  const paths = container.querySelectorAll('[data-mp="ticks"] > path')
  // One paint, so sixty ties merge into exactly one node (§15.4).
  expect(paths).toHaveLength(1)
  return anchors(paths[0]?.getAttribute("d") ?? "")
}

describe("<Tank>", () => {
  it("is a rectangle, not a circle: the viewBox follows the case's bbox", () => {
    const { container } = render(<Tank hour={10.15} minute={9} />)
    const root = container.querySelector('[data-mp="mainplate"]')
    // ratio 0.78 with the minor axis pinned at 100: 200 wide, 256.41 tall.
    // The root's box is plain division rather than trig, so it is written
    // unquantised — deterministic on both engines, unlike path data.
    const [x, y, w, h] = (root?.getAttribute("viewBox") ?? "").split(" ").map(Number)
    expect([x, y]).toEqual([-100, -100 / 0.78])
    expect(w).toBe(200)
    expect(h).toBeCloseTo(256.4103, 4)
  })

  it("draws both rails as the outline itself, not as inscribed circles", () => {
    // A full-sweep `<Arc>` on an `inset` anchor is documented to *be*
    // `outline.path(inset)` — the rounded rectangle, corners and all. Asserted
    // as string identity against a freshly built outline, so an arc that
    // quietly fell back to a circle could not pass.
    const { container } = render(<Tank hour={10.15} minute={9} />)
    const rails = [...container.querySelectorAll('[data-mp="arc"]')].map((a) => a.getAttribute("d"))
    const outline = rectOutline(CASE)
    expect(rails).toEqual([outline.path(RAIL_INSET), outline.path(11)])
  })

  it("divides the case by arc length: sixty ties, evenly spaced, corners included", () => {
    const { container } = render(<Tank hour={10.15} minute={9} />)
    const marks = cheminDeFer(container)
    expect(marks).toHaveLength(60)

    // The claim §1 exists for. Perimeter placement walks the outline, so the
    // widest gap is one sixtieth of the perimeter at the rail's own inset —
    // and the narrowest is only shorter because a gap that turns a corner is
    // measured as a chord across it, not along it.
    const g = gaps(marks)
    expect(Math.max(...g)).toBeCloseTo(rectOutline(CASE).length(RAIL_INSET) / 60, 3)
    expect(spread(marks)).toBeLessThan(1.2)
  })

  it("which a radial division of the same case cannot do", () => {
    // The control that gives the number above its meaning: identical
    // population, identical outline, identical anchor — only `placement`
    // differs. Equal angular steps produce arc lengths that grow away from
    // each edge's perpendicular foot, and on this case they grow by exactly
    // two to one.
    const { container } = render(
      <Mainplate outline={{ kind: "rect", ...CASE }} min={0} max={60}>
        <Ticks
          count={60}
          orient="edge"
          inset={RAIL_INSET}
          align="inside"
          length={TIE_LENGTH}
          width={0.8}
        />
      </Mainplate>,
    )
    const marks = anchors(
      container.querySelector('[data-mp="ticks"] > path')?.getAttribute("d") ?? "",
    )
    expect(spread(marks)).toBeGreaterThan(1.9)
  })

  it("but on a circle the two placements are the same mapping", () => {
    // The negative control. `placement` changes nothing on a circle — the
    // fraction of the turn and the fraction of the circumference are the same
    // number there — so this must stay green under any perimeter mutation. If
    // it ever went red with the tests above, they would be measuring the
    // population, not the placement.
    const marks = (placement?: "perimeter") => {
      const { container } = render(
        <Mainplate min={0} max={60}>
          <Ticks
            count={60}
            placement={placement}
            orient="edge"
            inset={RAIL_INSET}
            align="inside"
            length={TIE_LENGTH}
            width={0.8}
          />
        </Mainplate>,
      )
      return container.querySelector('[data-mp="ticks"] > path')?.getAttribute("d") ?? ""
    }
    expect(marks("perimeter")).toBe(marks())
    expect(marks()).not.toBe("")
  })

  it("prints twelve Roman numerals, with the watchmaker's four", () => {
    const { container } = render(<Tank hour={10.15} minute={9} />)
    const texts = [...container.querySelectorAll('[data-mp="numerals"] text')]
    expect(texts.map((t) => t.textContent)).toEqual([
      "XII",
      "I",
      "II",
      "III",
      "IIII",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
    ])
  })

  it("turns each numeral with its own ray, so VI reads from the six", () => {
    const { container } = render(<Tank hour={10.15} minute={9} />)
    const texts = [...container.querySelectorAll('[data-mp="numerals"] text')]
    const rotationOf = (label: string) => {
      const t = texts.find((el) => el.textContent === label)
      // `orient="upright"` emits no transform at all, so a missing attribute
      // here would mean the Tank had quietly gone upright.
      return t?.getAttribute("transform")?.match(/rotate\((-?\d+(?:\.\d+)?)/)?.[1]
    }
    expect(rotationOf("XII")).toBeUndefined() // 0°, and 0 is written as no transform
    expect(rotationOf("III")).toBe("90")
    expect(rotationOf("VI")).toBe("180")
    expect(rotationOf("IX")).toBe("270")
  })

  it("sets the numerals off the outline, so they follow the case rather than a circle", () => {
    const { container } = render(<Tank hour={10.15} minute={9} />)
    const texts = [...container.querySelectorAll('[data-mp="numerals"] text')]
    const radius = (label: string) => {
      const t = texts.find((el) => el.textContent === label)
      if (t === undefined) throw new Error(`no numeral ${label}`)
      return Math.hypot(Number(t.getAttribute("x")), Number(t.getAttribute("y")))
    }
    // An `r` anchor would put every numeral on one circle. An `inset` anchor
    // follows the rectangle, so XII — out on the long axis — sits far deeper
    // from the centre than III does on the short one.
    expect(radius("XII") - radius("III")).toBeGreaterThan(20)
  })

  it("points the hands where the props say, on two different domains", () => {
    const { container } = render(<Tank hour={3} minute={0} />)
    const rotations = [...container.querySelectorAll<SVGGElement>('[data-mp="hand"] > g')].map(
      (g) => g.style.rotate,
    )
    // The hour hand's local `max={12}` maps 3 of 12 onto 90° while the minute
    // hand reads the frame's own 0–60 and stays at the top.
    expect(rotations).toEqual(["90deg", "0deg"])
  })

  it("is one image with the time in its name, never a meter", () => {
    // §14.1's shape for a clock, and the ruling this example is pinned to: a
    // meter reports one `aria-valuenow`, and a watch has three domains.
    const { container, getByRole } = render(<Tank hour={10.15} minute={9} />)
    expect(getByRole("img").getAttribute("aria-label")).toBe("Tank watch face, 10:09")
    expect(container.querySelector('[role="meter"]')).toBeNull()
  })

  it("themes through --mp-* custom properties on the root", () => {
    const { getByRole } = render(
      <Tank
        hour={10.15}
        minute={9}
        theme={{
          dial: "a",
          chapter: "b",
          index: "c",
          lume: "d",
          hour: "e",
          minute: "f",
          second: "g",
          accent: "h",
        }}
      />,
    )
    const root = getByRole("img")
    expect(root.style.getPropertyValue("--mp-dial")).toBe("a")
    expect(root.style.getPropertyValue("--mp-hour")).toBe("e")
  })
})
