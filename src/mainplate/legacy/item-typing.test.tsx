// @vitest-environment jsdom

/**
 * Generic item typing: the authored item type rides from the `ticks` array
 * through the pipeline into `renderItem` and `useTicks` as `mark.item`.
 *
 * Half of what this file asserts lives at compile time. The `accepts*`
 * helpers take exactly the claimed type, so a widened, weakened, or `unknown`
 * inference breaks `bun run typecheck` — a regression no runtime assertion
 * could catch, because the values are right either way. The `@ts-expect-error`
 * lines are the same check from the other side: if the wrong access ever
 * compiles, the expectation itself errors.
 */
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { TickItem } from "../core/tick-scale"
import { Mainplate } from "./frame"
import { type MarkGeometry, Ticks, useTicks } from "./ticks"

const acceptsString = (s: string) => s
const acceptsNumber = (n: number) => n
const acceptsBoolean = (b: boolean) => b

describe("item typing — ticks", () => {
  const items = [
    { value: 0, label: "twelve", major: true },
    { value: 15, label: "three", major: false },
  ]

  it("hands renderItem the authored item, typed, and renders from it", () => {
    const seen: (typeof items)[number][] = []
    const { container } = render(
      <Mainplate max={60}>
        <Ticks
          ticks={items}
          inset={10}
          renderItem={(mark) => {
            seen.push(mark.item)
            acceptsString(mark.item.label)
            acceptsBoolean(mark.item.major)
            // @ts-expect-error — not a field of the authored item
            mark.item.missing
            return (
              <text key={mark.index} x={mark.point.x} y={mark.point.y}>
                {mark.item.label}
              </text>
            )
          }}
        />
      </Mainplate>,
    )
    expect(container.textContent).toContain("twelve")
    expect(container.textContent).toContain("three")
    expect(seen.map((i) => i.label)).toEqual(["twelve", "three"])
  })

  it("hands back the very array element, by reference", () => {
    const seen: unknown[] = []
    render(
      <Mainplate max={60}>
        <Ticks
          ticks={items}
          inset={10}
          renderItem={(mark) => {
            seen.push(mark.item)
            return null
          }}
        />
      </Mainplate>,
    )
    expect(seen[0]).toBe(items[0])
    expect(seen[1]).toBe(items[1])
  })

  it("keeps an inline literal array's shape — the const type parameter at work", () => {
    // `label` must stay the literal union, not widen to `string`; this
    // assignment is the compile-time proof.
    const keepsLiteral = (label: "twelve" | "three") => label
    render(
      <Mainplate max={60}>
        <Ticks
          ticks={[
            { value: 0, label: "twelve", major: true },
            { value: 15, label: "three", major: false },
          ]}
          inset={10}
          renderItem={(mark) => {
            keepsLiteral(mark.item.label)
            return null
          }}
        />
      </Mainplate>,
    )
  })

  it("types the skip predicate's ctx.item as the authored item", () => {
    const kept: string[] = []
    render(
      <Mainplate max={60}>
        <Ticks
          ticks={items}
          inset={10}
          skip={(ctx) => ctx.item.major}
          renderItem={(mark) => {
            kept.push(mark.item.label)
            return null
          }}
        />
      </Mainplate>,
    )
    expect(kept).toEqual(["three"])
  })
})

describe("item typing — count", () => {
  it("hands renderItem just { value }, because nothing more was authored", () => {
    const seen: { value: number }[] = []
    render(
      <Mainplate max={60}>
        <Ticks
          count={4}
          inset={10}
          renderItem={(mark) => {
            seen.push(mark.item)
            acceptsNumber(mark.item.value)
            // @ts-expect-error — count marks carry no label
            mark.item.label
            return null
          }}
        />
      </Mainplate>,
    )
    expect(seen[0]).toEqual({ value: 0 })
    expect(seen).toHaveLength(4)
  })
})

describe("item typing — tiers", () => {
  it("hands renderItem the tier's own props plus the stepped value", () => {
    const seen: { kind: string; value: number }[] = []
    render(
      <Mainplate max={60}>
        <Ticks
          tiers={[{ every: 15, kind: "major", length: 8 }]}
          inset={10}
          renderItem={(mark) => {
            seen.push(mark.item)
            acceptsString(mark.item.kind)
            acceptsNumber(mark.item.value)
            // @ts-expect-error — `every` is the tier's step, not an item field
            mark.item.every
            return null
          }}
        />
      </Mainplate>,
    )
    expect(seen.map((i) => i.kind)).toEqual(["major", "major", "major", "major"])
    expect(seen[0]).toEqual({ kind: "major", length: 8, value: 0 })
  })
})

describe("item typing — evaluable props stay an allowlist", () => {
  it("never invokes a function-valued item field as a visual prop", () => {
    const onPick = vi.fn()
    let handed: (() => void) | undefined
    render(
      <Mainplate max={60}>
        <Ticks
          ticks={[{ value: 0, onPick }]}
          inset={10}
          length={({ t }) => 4 + t}
          renderItem={(mark) => {
            handed = mark.item.onPick
            return null
          }}
        />
      </Mainplate>,
    )
    expect(onPick).not.toHaveBeenCalled()
    expect(handed).toBe(onPick)
  })

  it("lets a function-valued prop read the authored item through ctx", () => {
    const { container } = render(
      <Mainplate max={60}>
        <Ticks
          ticks={[
            { value: 0, major: true },
            { value: 15, major: false },
            { value: 30, major: false },
          ]}
          inset={10}
          fill={(ctx) => (ctx.item.major ? "#f00" : "#00f")}
        />
      </Mainplate>,
    )
    // Two distinct paints, so the merged path splits in two.
    expect(container.querySelectorAll('[data-mp="ticks"] path')).toHaveLength(2)
  })
})

describe("item typing — useTicks", () => {
  const items = [{ value: 0, label: "noon" }]

  it("carries the same item type and resolved props as <Ticks>", () => {
    const seen: MarkGeometry<(typeof items)[number]>[] = []
    function Probe() {
      const marks = useTicks({ ticks: items, inset: 10, length: 7 })
      acceptsString(marks[0]?.item.label ?? "")
      acceptsNumber(marks[0]?.props.length ?? 0)
      seen.push(...marks)
      return null
    }
    render(
      <Mainplate max={60}>
        <Probe />
      </Mainplate>,
    )
    expect(seen[0]?.item).toBe(items[0])
    expect(seen[0]?.props.length).toBe(7)
  })

  it("types a count population's item as { value } and a base annotation still accepts it", () => {
    function Probe() {
      const marks: MarkGeometry<Pick<TickItem, "value">>[] = useTicks({ count: 3, inset: 10 })
      acceptsNumber(marks[0]?.item.value ?? 0)
      // @ts-expect-error — count marks carry no label
      marks[0]?.item.label
      return null
    }
    const { container } = render(
      <Mainplate max={60}>
        <Probe />
      </Mainplate>,
    )
    expect(container).toBeTruthy()
  })
})
