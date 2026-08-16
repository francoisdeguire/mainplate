// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createSource, type Source } from "../core/source"
import { Clock } from "./clock"
import { Complication } from "./complication"
import { Mainplate } from "./mainplate"
import { Cap, Dial, Hand, Ticks } from "./parts"

/**
 * `<Complication>` — the dual-nature component, both halves pinned.
 *
 * Content mode (no `size`): `at`/`inset` position arbitrary children on the
 * outer face, and the children INHERIT the outer context — a bare part inside
 * reads the outer outline, which is what makes a date window at 3 o'clock one
 * element and zero new concepts.
 *
 * Context mode (`size` given): the one component that re-establishes
 * `FaceContext` — a fresh origin at the resolved point, nominal radius 100
 * inside, so every part works in there unchanged. The `<Subdial>` semantics,
 * reborn in HTML.
 */

/** The frozen marketing pose — slot tests must not depend on the wall clock. */
const POSE = new Date("2026-01-15T10:09:36Z")

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Same fake as the mainplate tests: fires only when told. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed: Element[] = []
  disconnected = false
  private cb: (entries: { isIntersecting: boolean }[]) => void
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    this.cb = cb
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((e) => e !== el)
  }
  disconnect() {
    this.disconnected = true
    this.observed = []
  }
  trigger(isIntersecting: boolean) {
    if (this.disconnected) return
    this.cb([{ isIntersecting }])
  }
}

/** A source whose subscriptions are countable — how pause is observed. */
function countingSource(initial: number, domain: { min: number; max: number }) {
  const inner = createSource(initial, domain)
  let active = 0
  const source: Source<number> = {
    domain,
    get: inner.get,
    subscribe: (cb) => {
      active += 1
      const off = inner.subscribe(cb)
      return () => {
        active -= 1
        off()
      }
    },
  }
  return { source, set: inner.set, subscriptions: () => active }
}

function complicationsOf(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-mp="complication"]')]
}

function complicationOf(container: ParentNode): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-mp="complication"]')
  if (el === null) throw new Error("no complication rendered")
  return el
}

function ticksOf(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
}

function handOf(container: ParentNode): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-mp="hand"]')
  if (el === null) throw new Error("no hand rendered")
  return el
}

/** The rotation an element wears, parsed out of its written transform. */
function rotationOf(el: Element): number {
  const style = el.getAttribute("style") ?? ""
  const match = style.match(/rotate\((-?[\d.]+)deg\)/)
  if (match === null || match[1] === undefined) {
    throw new Error(`no rotation in ${JSON.stringify(style)}`)
  }
  return Number(match[1])
}

function pct(value: string): number {
  if (!value.endsWith("%")) throw new Error(`not a percentage: ${JSON.stringify(value)}`)
  return Number(value.slice(0, -1))
}

function cqw(value: string): number {
  if (!value.endsWith("cqw")) throw new Error(`not a cqw length: ${JSON.stringify(value)}`)
  return Number(value.slice(0, -3))
}

describe("<Complication> — content mode positions on the outer face", () => {
  it('"3h" lands right of centre, on the outline, at exact percentages', () => {
    const { container } = render(
      <Mainplate>
        <Complication at="3h">x</Complication>
      </Mainplate>,
    )
    const comp = complicationOf(container)
    // pointAt(90°, 0) on the circle is (100, 0); the 220-unit face box puts
    // that at 50 + 100·100/220 — right of centre by construction.
    expect(comp.style.left).toBe("95.4545%")
    expect(comp.style.top).toBe("50%")
    // Centred on the resolved point: the anchor names the centre.
    expect(comp.style.transform).toBe("translate(-50%, -50%)")
  })

  it("inset pulls the point inward from the outline", () => {
    const { container } = render(
      <Mainplate>
        <Complication at="3h" inset={30}>
          x
        </Complication>
      </Mainplate>,
    )
    // (70, 0): 50 + 100·70/220.
    expect(complicationOf(container).style.left).toBe("81.8182%")
    expect(complicationOf(container).style.top).toBe("50%")
  })

  it('"center" is the dial origin: 50/50', () => {
    const { container } = render(
      <Mainplate>
        <Complication at="center">x</Complication>
      </Mainplate>,
    )
    const comp = complicationOf(container)
    expect(comp.style.left).toBe("50%")
    expect(comp.style.top).toBe("50%")
  })

  it("degrees are accepted on the same axis: 180 is straight down", () => {
    const { container } = render(
      <Mainplate>
        <Complication at={180}>x</Complication>
      </Mainplate>,
    )
    const comp = complicationOf(container)
    expect(comp.style.left).toBe("50%")
    expect(comp.style.top).toBe("95.4545%")
  })

  it("does NOT create a context: parts inside read the OUTER face", () => {
    // A rect face, because that is where inner and outer contexts diverge:
    // the nested context would be a nominal circle, and a tick placed on it
    // would sit at circle percentages instead of this outline's.
    const shape = { ratio: 0.82, radius: 30 }
    const inside = render(
      <Mainplate shape={shape}>
        <Complication at="center">
          <Ticks count={4} />
        </Complication>
      </Mainplate>,
    )
    const reference = render(
      <Mainplate shape={shape}>
        <Ticks count={4} />
      </Mainplate>,
    )
    const nested = ticksOf(inside.container)
    const direct = ticksOf(reference.container)
    expect(nested).toHaveLength(4)
    expect(nested.map((el) => el.getAttribute("style"))).toEqual(
      direct.map((el) => el.getAttribute("style")),
    )
  })

  it("a bare <Hand> inside inherits the outer face: it renders, and rotation proves it maps", () => {
    const { container } = render(
      <Mainplate shape={{ ratio: 0.82, radius: 30 }}>
        <Complication at="center">
          <Hand value={30} />
        </Complication>
      </Mainplate>,
    )
    // The plain preset's domain is 0–60, so 30 is half a turn. No
    // useFaceContext throw, no nested provider — the outer face's.
    expect(rotationOf(handOf(container))).toBe(180)
  })

  it("carries no nested-face box: no width, no container", () => {
    const { container } = render(
      <Mainplate>
        <Complication at="center">x</Complication>
      </Mainplate>,
    )
    const comp = complicationOf(container)
    expect(comp.style.width).toBe("")
    expect(comp.getAttribute("style") ?? "").not.toContain("container-type")
  })
})

describe("<Complication size> — context mode re-establishes the face", () => {
  it("sizes the box from `size` — the nested dial's DIAMETER, in parent dial units", () => {
    const { container } = render(
      <Mainplate>
        <Complication at="6h" size={30} />
      </Mainplate>,
    )
    const comp = complicationOf(container)
    // `size` is the dial's diameter: the nested 220-unit box scaled by
    // size/200 is 33 parent units, which on the parent's own 220 box is
    // exactly `size / 2` cqw. The round number is the invariant, not a fluke.
    expect(comp.style.width).toBe("15cqw")
    expect(comp.style.height).toBe("15cqw")
  })

  it("keeps width === height on a RECT parent — both cqw scale by the parent's WIDTH", () => {
    // The one place the two denominators diverge: a rect face's boxH (184)
    // is not its boxW (220). cqw is width-based by definition, so a square
    // register must come out square here too — dividing the height by boxH
    // would stretch it 220/184 and only ever on a shaped face.
    const { container } = render(
      <Mainplate shape={{ ratio: 0.82, radius: 30 }}>
        <Complication at="center" size={30} />
      </Mainplate>,
    )
    const comp = complicationOf(container)
    expect(comp.style.width).toBe("15cqw")
    expect(comp.style.height).toBe("15cqw")
  })

  it("threads `unstyled` into the nested face: a register paints nothing", () => {
    const { container } = render(
      <Mainplate unstyled>
        <Complication at="center" size={60}>
          <Dial />
          <Ticks count={4} />
          <Hand value={15} />
          <Cap />
        </Complication>
      </Mainplate>,
    )
    const comp = complicationOf(container)
    const parts = [...comp.querySelectorAll<HTMLElement>("[data-mp]")]
    expect(parts.length).toBe(7) // dial, four ticks, hand, cap
    for (const part of parts) {
      expect(part.style.background, part.getAttribute("style") ?? "").toBe("")
    }
  })

  it("keeps every tick of a nested track inside the complication's own box", () => {
    const { container } = render(
      <Mainplate>
        <Complication at="6h" size={30}>
          <Ticks count={12} />
        </Complication>
      </Mainplate>,
    )
    const comp = complicationOf(container)
    const cx = pct(comp.style.left)
    const cy = pct(comp.style.top)
    const w = cqw(comp.style.width)
    const h = cqw(comp.style.height)

    // The bounds come from the PROPS, not from the rendered box: a size-30
    // (diameter) register on the 220-unit parent is ±7.5 of the parent's
    // width around the resolved point. Skipping the rescale inflates the
    // rendered box and pushes the marks outside these prop-derived bounds —
    // the mutation this test reds on.
    const half = 7.5
    expect(cx).toBe(50)
    expect(cy).toBe(95.4545)

    const marks = ticksOf(comp)
    expect(marks).toHaveLength(12)
    for (const mark of marks) {
      const x = cx - w / 2 + (pct(mark.style.left) / 100) * w
      const y = cy - h / 2 + (pct(mark.style.top) / 100) * h
      expect(x).toBeGreaterThanOrEqual(cx - half - 1e-9)
      expect(x).toBeLessThanOrEqual(cx + half + 1e-9)
      expect(y).toBeGreaterThanOrEqual(cy - half - 1e-9)
      expect(y).toBeLessThanOrEqual(cy + half + 1e-9)
    }
  })

  it("parts inside read the nested context unchanged: nominal-face styles, verbatim", () => {
    const nested = render(
      <Mainplate>
        <Complication at="center" size={40}>
          <Ticks count={12} />
        </Complication>
      </Mainplate>,
    )
    const reference = render(
      <Mainplate>
        <Ticks count={12} />
      </Mainplate>,
    )
    expect(ticksOf(complicationOf(nested.container)).map((el) => el.getAttribute("style"))).toEqual(
      ticksOf(reference.container).map((el) => el.getAttribute("style")),
    )
  })

  it("a nested gauge-style composition maps values through the NESTED domain", () => {
    const { container } = render(
      <Mainplate>
        <Complication at="center" size={30}>
          <Ticks count={5} startAngle={-120} sweepAngle={240} />
          <Hand value={25} min={0} max={100} startAngle={-120} sweepAngle={240} />
        </Complication>
      </Mainplate>,
    )
    // 25 of 0–100 across a 240° sweep from −120: a quarter of the way in.
    expect(rotationOf(handOf(container))).toBe(-60)
  })

  it("nests two deep: a register inside a register, each nominal", () => {
    const { container } = render(
      <Mainplate>
        <Complication at="center" size={30}>
          <Complication at="3h" size={40}>
            <Ticks count={4} />
          </Complication>
        </Complication>
      </Mainplate>,
    )
    const comps = complicationsOf(container)
    expect(comps).toHaveLength(2)
    const inner = comps[1]
    if (inner === undefined) throw new Error("no inner complication")
    // Positioned in the MIDDLE face's units — the same 3h percentage a root
    // face resolves — and sized in ITS dial units: a 40-diameter register on
    // the nominal 200-diameter dial.
    expect(inner.style.left).toBe("95.4545%")
    expect(inner.style.top).toBe("50%")
    expect(inner.style.width).toBe("20cqw")

    const reference = render(
      <Mainplate>
        <Ticks count={4} />
      </Mainplate>,
    )
    expect(ticksOf(inner).map((el) => el.getAttribute("style"))).toEqual(
      ticksOf(reference.container).map((el) => el.getAttribute("style")),
    )
  })

  it("threads liveness to the ROOT: nested live hands pause with the root's observer", () => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
    const one = countingSource(10, { min: 0, max: 60 })
    const two = countingSource(20, { min: 0, max: 60 })
    render(
      <Mainplate>
        <Complication at="12h" size={30}>
          <Hand value={one.source} />
          <Complication at="center" size={40}>
            <Hand value={two.source} />
          </Complication>
        </Complication>
      </Mainplate>,
    )
    // ONE observer — the root's. A complication is not a second face to the
    // viewport; its parts must go dark when the ROOT scrolls out.
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer")
    expect(one.subscriptions()).toBe(1)
    expect(two.subscriptions()).toBe(1)

    act(() => io.trigger(false))
    expect(one.subscriptions()).toBe(0)
    expect(two.subscriptions()).toBe(0)

    act(() => io.trigger(true))
    expect(one.subscriptions()).toBe(1)
    expect(two.subscriptions()).toBe(1)
  })
})

describe("<Complication> inside the tier-1 wrappers", () => {
  it("is a free child — never claimed — above the parts and BELOW the cap", () => {
    const { container } = render(
      <Clock time={POSE} timezone="UTC">
        <Complication at="center">
          <span>readout</span>
        </Complication>
      </Clock>,
    )
    const order = [...container.querySelectorAll<HTMLElement>("[data-mp]")].map(
      (el) => el.dataset.mp,
    )
    const comp = order.indexOf("complication")
    const cap = order.indexOf("cap")
    const lastHand = order.lastIndexOf("hand")
    expect(comp).toBeGreaterThan(lastHand)
    expect(comp).toBeLessThan(cap)
    expect(cap).toBe(order.length - 1)
  })

  it("two complications both render — no slot swallows the second", () => {
    const { container, getByText } = render(
      <Clock time={POSE} timezone="UTC">
        <Complication at="12h" inset={30}>
          <span>brand</span>
        </Complication>
        <Complication at="6h" inset={30}>
          <span>date</span>
        </Complication>
      </Clock>,
    )
    expect(complicationsOf(container)).toHaveLength(2)
    expect(getByText("brand")).toBeTruthy()
    expect(getByText("date")).toBeTruthy()
  })
})
