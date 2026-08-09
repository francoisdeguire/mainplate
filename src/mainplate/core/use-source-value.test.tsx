// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createSource } from "./source"
import { useSourceValue } from "./use-source-value"

function Readout({ source }: { source: ReturnType<typeof createSource<number>> }) {
  return <output>{useSourceValue(source)}</output>
}

describe("useSourceValue", () => {
  it("renders the current value", () => {
    render(<Readout source={createSource(7)} />)
    expect(screen.getByRole("status").textContent).toBe("7")
  })

  it("re-renders when the source changes", () => {
    const s = createSource(1)
    render(<Readout source={s} />)
    act(() => s.set(2))
    expect(screen.getByRole("status").textContent).toBe("2")
  })

  it("unsubscribes on unmount", () => {
    const s = createSource(1)
    const teardown = vi.fn()
    const spied = {
      ...s,
      subscribe: (cb: () => void) => {
        const off = s.subscribe(cb)
        return () => {
          teardown()
          off()
        }
      },
    }
    const { unmount } = render(<Readout source={spied} />)
    unmount()
    expect(teardown).toHaveBeenCalledTimes(1)
  })
})
