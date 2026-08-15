// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler } from "react"
import { describe, expect, it } from "vitest"
import { createSource } from "../core"
import { Chronograph } from "./chronograph"

/** The rotation node: `<Hand>`'s stage-2 group, the only thing that turns. */
function rotationOf(scope: Element): string {
  const node = scope.querySelector<SVGGElement>('[data-mp="hand"] > g')
  if (node === null) throw new Error("no hand rotation node in scope")
  return node.style.rotate
}

/** One register, found by the accessible name its `<Subdial label>` carries. */
function register(container: HTMLElement, label: string): Element {
  const node = container.querySelector(`[data-mp="subdial"][aria-label="${label}"]`)
  if (node === null) throw new Error(`no register labelled ${label}`)
  return node
}

/** The central chrono hand: the only top-level hand painted --mp-second. */
function chronoHand(container: HTMLElement): Element {
  const hand = [...container.querySelectorAll('[data-mp="hand"]')].find(
    (h) =>
      h.closest('[data-mp="subdial"]') === null && h.getAttribute("fill") === "var(--mp-second)",
  )
  if (hand === undefined) throw new Error("no central chrono hand")
  return hand
}

/**
 * The tachymeter's texts: top-level numerals sitting out past r 85 — nothing
 * else on the face prints that far out, and the registers' own numerals live
 * inside `[data-mp="subdial"]` groups.
 */
function tachyTexts(container: HTMLElement): SVGTextElement[] {
  return [...container.querySelectorAll<SVGTextElement>('[data-mp="numerals"] text')].filter(
    (t) =>
      t.closest('[data-mp="subdial"]') === null &&
      Math.hypot(Number(t.getAttribute("x")), Number(t.getAttribute("y"))) > 85,
  )
}

/** A text node's dial angle, from its coordinates: 0° at twelve, clockwise. */
function angleOf(t: SVGTextElement): number {
  const x = Number(t.getAttribute("x"))
  const y = Number(t.getAttribute("y"))
  return (Math.atan2(x, -y) * (180 / Math.PI) + 360) % 360
}

describe("<Chronograph>", () => {
  it("mounts three registers, each wearing its own accessible name", () => {
    const { container } = render(<Chronograph elapsed={0} />)
    const registers = container.querySelectorAll('[data-mp="subdial"]')
    expect(registers).toHaveLength(3)
    expect([...registers].map((r) => r.getAttribute("aria-label"))).toEqual([
      "Running seconds",
      "30-minute counter",
      "12-hour counter",
    ])
  })

  it("maps the 30-minute counter through ITS domain: 15 minutes points down, not at 3h", () => {
    // The §4.8 trap this face exists to spring: 15 elapsed minutes on a 0–30
    // register is half a turn — 180°. If the register inherited the parent's
    // 0–60 seconds domain, 15 would sit at 90° instead.
    const { container } = render(<Chronograph elapsed={900} />)
    expect(rotationOf(register(container, "30-minute counter"))).toBe("180deg")
  })

  it("maps the 12-hour counter through ITS domain: 90 minutes is 45°", () => {
    // 5400 s = 1.5 h on a 0–12 register: 1.5/12 × 360 = 45°. On the parent's
    // 0–60 frame the same hand would read 1.5 s ≈ 9°.
    const { container, rerender } = render(<Chronograph elapsed={5400} />)
    expect(rotationOf(register(container, "12-hour counter"))).toBe("45deg")
    // And the 30-minute counter has lapped back to zero: 90 % 30 = 0.
    expect(rotationOf(register(container, "30-minute counter"))).toBe("0deg")
    rerender(<Chronograph elapsed={900} />)
    // 15 minutes = 0.25 h: 0.25/12 × 360 = 7.5° — the domains stay distinct.
    expect(rotationOf(register(container, "12-hour counter"))).toBe("7.5deg")
  })

  it("wraps the central chrono hand at 60 on the main frame", () => {
    const { container, rerender } = render(<Chronograph elapsed={45} />)
    expect(rotationOf(chronoHand(container))).toBe("270deg")
    rerender(<Chronograph elapsed={100} />)
    // 100 % 60 = 40 s → 240°.
    expect(rotationOf(chronoHand(container))).toBe("240deg")
    rerender(<Chronograph elapsed={900} />)
    expect(rotationOf(chronoHand(container))).toBe("0deg")
  })

  it("places a tachymeter mark at the angle of its time, in domain units", () => {
    // t = 45 s on a 0–60 frame is 270° — position comes from the value, §6.1.
    // This test holds whatever the label says; the label test below is the
    // one that pins the 3600/t computation.
    const { container } = render(<Chronograph elapsed={0} />)
    const texts = tachyTexts(container)
    expect(texts).toHaveLength(23)
    const at270 = texts.filter((t) => Math.abs(angleOf(t) - 270) < 0.1)
    expect(at270).toHaveLength(1)
  })

  it("labels the tachymeter as 3600 / t: the mark at 45 s reads 80", () => {
    const { container } = render(<Chronograph elapsed={0} />)
    const texts = tachyTexts(container)
    const labelAt = (deg: number): string | null => {
      const t = texts.find((el) => Math.abs(angleOf(el) - deg) < 0.1)
      return t === undefined ? null : t.textContent
    }
    expect(labelAt(270)).toBe("80") // 3600 / 45
    expect(labelAt(54)).toBe("400") // 3600 / 9: 9 s of 60 → 54°
    expect(labelAt(180)).toBe("120") // 3600 / 30
  })

  it("skips the chapter-ring positions the registers paint over", () => {
    const { container } = render(<Chronograph elapsed={0} />)
    // The two top-level tick groups: the tachymeter (one path) and the
    // two-tier seconds track (two paths, split by fill).
    const groups = [...container.querySelectorAll('[data-mp="ticks"]')].filter(
      (g) => g.closest('[data-mp="subdial"]') === null,
    )
    expect(groups).toHaveLength(2)
    const tachy = groups.find((g) => g.querySelectorAll("path").length === 1)
    const track = groups.find((g) => g.querySelectorAll("path").length === 2)
    if (tachy === undefined || track === undefined) throw new Error("missing tick groups")

    // 23 authored tachymeter marks, one `M` each.
    const tachyPath = tachy.querySelector("path")?.getAttribute("d") ?? ""
    expect(tachyPath.match(/M/g)).toHaveLength(23)

    // 60 every-1 positions minus 12 merged majors = 48 minors; 12 majors
    // minus the three skipped under the registers (15, 30, 45) = 9.
    const byFill = new Map(
      [...track.querySelectorAll("path")].map((p) => [
        p.getAttribute("fill"),
        p.getAttribute("d") ?? "",
      ]),
    )
    expect(byFill.get("var(--mp-chapter)")?.match(/M/g)).toHaveLength(48)
    expect(byFill.get("var(--mp-index)")?.match(/M/g)).toHaveLength(9)

    // The track's numerals skip the same three positions.
    const trackLabels = [...container.querySelectorAll<SVGTextElement>('[data-mp="numerals"] text')]
      .filter(
        (t) =>
          t.closest('[data-mp="subdial"]') === null &&
          Math.hypot(Number(t.getAttribute("x")), Number(t.getAttribute("y"))) < 85,
      )
      .map((t) => t.textContent)
    expect(trackLabels).toEqual(["5", "10", "20", "25", "35", "40", "50", "55", "60"])
  })

  it("moves the live hands through the DOM while the parent renders exactly once", () => {
    // The §8.10 claim under the heaviest composition in the library: an
    // elapsed Source drives the central hand and two counters, and none of it
    // re-renders React. A `<Profiler>` counts commits of the whole subtree —
    // including `<Chronograph>` itself, the component that would re-render if
    // anything inside subscribed through state — while the rotations prove
    // the hands actually moved through the ref path.
    const elapsed = createSource(0)
    let commits = 0
    const { container } = render(
      <Profiler
        id="chronograph"
        onRender={() => {
          commits += 1
        }}
      >
        <Chronograph elapsed={elapsed} />
      </Profiler>,
    )
    expect(commits).toBe(1)
    expect(rotationOf(chronoHand(container))).toBe("0deg")

    act(() => elapsed.set(45))
    expect(rotationOf(chronoHand(container))).toBe("270deg")

    act(() => elapsed.set(75))
    // 75 s: central hand 15 s → 90°; the 30-minute counter 1.25 min → 15°.
    expect(rotationOf(chronoHand(container))).toBe("90deg")
    expect(rotationOf(register(container, "30-minute counter"))).toBe("15deg")

    expect(commits).toBe(1)
  })

  it("themes through --mp-* custom properties on the root", () => {
    const { getByRole } = render(
      <Chronograph
        elapsed={0}
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
    const root = getByRole("img", { name: "Chronograph" })
    expect(root.style.getPropertyValue("--mp-second")).toBe("g")
    expect(root.style.getPropertyValue("--mp-chapter")).toBe("b")
  })
})
