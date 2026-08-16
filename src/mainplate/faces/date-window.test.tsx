// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DateWindow } from "../../../www/app/lab/faces/date-window"

/**
 * The animated date window is LAB code — a demo composition, not library API —
 * but its motion contract is worth pinning: the roll is a CSS transition on
 * translateY (~200ms, strong ease-out), and reduced motion swaps instantly.
 * The test lives here because the lab carries no test runner of its own.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function trackOf(container: ParentNode): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-lab="date-track"]')
  if (el === null) throw new Error("no date track")
  return el
}

describe("the animated date window (lab)", () => {
  it("shows the value in a tabular-digit, overflow-hidden window", () => {
    const { container, getByText } = render(<DateWindow value={14} />)
    expect(getByText("14")).toBeTruthy()
    const window = container.firstElementChild as HTMLElement
    expect(window.style.overflow).toBe("hidden")
    expect(window.style.fontVariantNumeric).toBe("tabular-nums")
  })

  it("rolls on change: old slides out, new slides in, ~200ms ease-out", () => {
    const { container, rerender, getByText, queryByText } = render(<DateWindow value={14} />)
    rerender(<DateWindow value={15} />)

    // Mid-roll, both values are in the window: the old on its way out above,
    // the new arriving from below.
    expect(getByText("14")).toBeTruthy()
    expect(getByText("15")).toBeTruthy()

    const track = trackOf(container)
    expect(track.style.transform).toBe("translateY(-50%)")
    expect(track.style.transition).toContain("transform")
    expect(track.style.transition).toContain("200ms")
    expect(track.style.transition).toContain("cubic-bezier")

    // The roll settles: the old value leaves the DOM, the inline transition
    // and transform are cleared so the next roll starts from rest.
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(queryByText("14")).toBeNull()
    expect(getByText("15")).toBeTruthy()
    expect(trackOf(container).style.transform).toBe("")
    expect(trackOf(container).style.transition).toBe("")
  })

  it("reduced motion: the swap is instant — no old value, no transition", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const { container, rerender, getByText, queryByText } = render(<DateWindow value={14} />)
    rerender(<DateWindow value={15} />)
    expect(queryByText("14")).toBeNull()
    expect(getByText("15")).toBeTruthy()
    const track = trackOf(container)
    expect(track.style.transform).toBe("")
    expect(track.style.transition).toBe("")
  })
})
