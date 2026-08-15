// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { Frame } from "./frame"
import { Mainplate, useFrame } from "./frame"
import { Hand } from "./hand"
import { createSource, type Source, type WritableSource } from "./source"

/** The three groups of the §2.9 recipe: position, rotation, artwork. */
const position = (c: HTMLElement) => c.querySelector('[data-mp="hand"]')
const rotation = (c: HTMLElement) => c.querySelector('[data-mp="hand"] > g')
const artwork = (c: HTMLElement) => c.querySelector('[data-mp="hand"] > g > g')

/**
 * The rotation node's style, byte for byte. `transform-box` and
 * `transform-origin` are part of the recipe, not decoration, so they are
 * asserted as literally as the angle is.
 */
const recipe = (deg: number) => `rotate: ${deg}deg; transform-box: view-box; transform-origin: 0 0;`

/** Reads the frame a sibling sees, to prove a local override stayed local. */
function FrameProbe({ onRead }: { onRead: (frame: Frame) => void }) {
  onRead(useFrame().frame)
  return null
}

describe("<Hand> — the transform recipe", () => {
  it("nests three groups: position, then rotation, then the artwork's own space", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} />
      </Mainplate>,
    )
    expect(position(container)).not.toBeNull()
    expect(rotation(container)).not.toBeNull()
    expect(artwork(container)).not.toBeNull()
    // Stage 1 is the frame centre, static, as an SVG attribute.
    expect(position(container)?.getAttribute("transform")).toBe("translate(0 0)")
  })

  it("rotates in CSS on the middle group, with transform-box and transform-origin explicit", () => {
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={15} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(90))
    // The animated node must not carry an SVG transform attribute: the CSS
    // form is what the fixture verified and what the compositor can promote.
    expect(rotation(container)?.hasAttribute("transform")).toBe(false)
  })

  it("declares the recipe as parsed CSS, not as free text", () => {
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={15} />
      </Mainplate>,
    )
    const node = rotation(container) as SVGGElement | null
    expect(node?.style.getPropertyValue("rotate")).toBe("90deg")
    expect(node?.style.getPropertyValue("transform-box")).toBe("view-box")
    expect(node?.style.getPropertyValue("transform-origin")).toBe("0 0")

    // The honest limit of this assertion: jsdom parses the declaration but
    // renders nothing, so all it proves is that three well-formed properties
    // reach the DOM. That `view-box` is the *right* value — that `fill-box`
    // would pivot a hand with a tail differently from one without — rests on
    // fixtures/transform.html case D, verified in Chrome, Safari and Firefox.
  })

  it("writes an identical rotation style for artwork with different bounding boxes", () => {
    // The fixture's case D, reduced to what a DOM test can see: the rotation
    // node is a pure function of the value, never of what it contains, so two
    // hands at one angle stay collinear however differently they are drawn.
    const { container } = render(
      <Mainplate min={0} max={8}>
        <Hand value={1} length={90} />
        <Hand value={1} length={90} tail={25} width={12} />
      </Mainplate>,
    )
    const [first, second] = container.querySelectorAll('[data-mp="hand"] > g')
    expect(first?.getAttribute("style")).toBe(recipe(45))
    expect(second?.getAttribute("style")).toBe(first?.getAttribute("style"))
  })
})

describe("<Hand> — value to rotation", () => {
  it("rotates by exactly the value's angle, with no ±90 correction", () => {
    // Artwork points up (−y) at 0, so the rotation *is* the angle. A hand at a
    // quarter of a full sweep points due east at exactly 90 degrees.
    const cases: Array<[number, number]> = [
      [0, 0],
      [15, 90],
      [30, 180],
      [45, 270],
    ]
    for (const [value, deg] of cases) {
      const { container } = render(
        <Mainplate min={0} max={60}>
          <Hand value={value} />
        </Mainplate>,
      )
      expect(rotation(container)?.getAttribute("style")).toBe(recipe(deg))
    }
  })

  it("follows the frame's startAngle and sweepAngle", () => {
    const { container } = render(
      <Mainplate min={0} max={10} startAngle={-135} sweepAngle={270}>
        <Hand value={5} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(0))
  })

  it("quantises the rotation through fmt", () => {
    // A seventh of a turn is 51.428571…: raw, it serializes differently on the
    // server's engine and the browser's, which is a hydration mismatch on the
    // one node the whole library animates.
    const { container } = render(
      <Mainplate min={0} max={7}>
        <Hand value={1} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(51.4286))
  })
})

describe("<Hand> — the local scale override", () => {
  it("reads its own domain without mutating the frame", () => {
    // A clock is three hands with three different maxima on one frame. If the
    // override leaked into the frame, every sibling would read the hour scale.
    let seen: Frame | undefined
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={3} max={12} />
        <Hand value={3} />
        <FrameProbe onRead={(f) => (seen = f)} />
      </Mainplate>,
    )
    const [overridden, plain] = container.querySelectorAll('[data-mp="hand"] > g')
    expect(overridden?.getAttribute("style")).toBe(recipe(90))
    expect(plain?.getAttribute("style")).toBe(recipe(18))
    expect(seen?.max).toBe(60)
    expect(seen?.min).toBe(0)
  })

  it("overrides min, startAngle and sweepAngle locally too", () => {
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={0} min={-30} max={30} startAngle={-135} sweepAngle={270} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(0))
  })
})

describe("<Hand> — artwork", () => {
  it("draws a built-in shape honouring length, tail and width", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} length={90} tail={20} width={6} />
      </Mainplate>,
    )
    // Up is −y, so the tip is at −90 and the counterweight at +20.
    expect(container.querySelector('[data-mp="hand"] path')?.getAttribute("d")).toBe(
      "M -3 20 L -3 -90 L 3 -90 L 3 20 Z",
    )
  })

  it("renders arbitrary SVG children instead of the built-in shape", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0}>
          <polygon points="0,0 1,1 2,2" />
        </Hand>
      </Mainplate>,
    )
    // Queried from the root rather than through `artwork()`, whose optional
    // chain would make this pass against a component that rendered nothing.
    expect(container.querySelector('[data-mp="hand"] > g > g > polygon')).not.toBeNull()
    expect(container.querySelector('[data-mp="hand"] path')).toBeNull()
  })

  it("moves the rotation point with pivot, in the artwork's own space", () => {
    // Artwork drawn around (40, 260) in Figma pivots there once told to: the
    // correction group slides that point onto the rotation group's origin.
    const { container } = render(
      <Mainplate>
        <Hand value={0} pivot={[40, 260]}>
          <circle cx={40} cy={260} r={4} />
        </Hand>
      </Mainplate>,
    )
    expect(artwork(container)?.getAttribute("transform")).toBe(
      "translate(0 0) scale(1) translate(-40 -260)",
    )
  })

  it("defaults pivot to the artwork origin", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} />
      </Mainplate>,
    )
    expect(artwork(container)?.getAttribute("transform")).toBe(
      "translate(0 0) scale(1) translate(0 0)",
    )
  })

  it("scales artwork not authored in dial units", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} scale={0.25} pivot={[12, 400]} />
      </Mainplate>,
    )
    // Pivot is subtracted first, in the artwork's own units, then the whole
    // thing is scaled — the other order would scale the pivot as well.
    expect(artwork(container)?.getAttribute("transform")).toBe(
      "translate(0 0) scale(0.25) translate(-12 -400)",
    )
  })

  it("applies nudge after the scale, in dial units", () => {
    // An optical correction is on the face, so it must not change size when
    // the artwork is rescaled.
    const { container } = render(
      <Mainplate>
        <Hand value={0} scale={2} nudge={[0, -1.5]} />
      </Mainplate>,
    )
    expect(artwork(container)?.getAttribute("transform")).toBe(
      "translate(0 -1.5) scale(2) translate(0 0)",
    )
  })
})

describe("<Hand> — the DOM contract", () => {
  it("emits a static data-mp, the consumer's transition hook", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("data-mp")).toBe("hand")
  })

  it("defaults fill to currentColor, and lets an explicit fill replace it", () => {
    const { container: themed } = render(
      <Mainplate>
        <Hand value={0} />
      </Mainplate>,
    )
    expect(position(themed)?.getAttribute("fill")).toBe("currentColor")

    const { container: painted } = render(
      <Mainplate>
        <Hand value={0} fill="#0af" />
      </Mainplate>,
    )
    expect(position(painted)?.getAttribute("fill")).toBe("#0af")
  })

  it("spreads SVG props onto the position group", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} className="seconds" opacity={0.5} />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("class")).toBe("seconds")
    expect(position(container)?.getAttribute("opacity")).toBe("0.5")
  })

  it("refuses a caller's transform at compile time", () => {
    const { container } = render(
      <Mainplate>
        {/* @ts-expect-error — the position group's transform is the position */}
        <Hand value={0} transform="scale(2)" />
      </Mainplate>,
    )
    expect(position(container)?.getAttribute("transform")).toBe("translate(0 0)")
  })

  it("hands the root element to render, still carrying data-mp", () => {
    const { container } = render(
      <Mainplate>
        <Hand value={0} render={(props) => <g {...props} data-wrapped="yes" />} />
      </Mainplate>,
    )
    const root = position(container)
    expect(root?.getAttribute("data-wrapped")).toBe("yes")
    expect(root?.getAttribute("transform")).toBe("translate(0 0)")
    expect(rotation(container)).not.toBeNull()
  })
})

describe("<Hand> — driven by a Source", () => {
  /**
   * A source whose subscription traffic is observable from outside: every
   * subscribe and every teardown is counted. The teardown assertions watch the
   * unsubscribe actually *run* — the vacuous form of that test, "set() after
   * unmount does not throw", passes whether or not the cleanup exists, and is
   * a defect this project already paid for once in Plan 1.
   */
  function instrument(initial: number, domain?: { min: number; max: number }) {
    const s = createSource(initial, domain)
    const calls = { subscribes: 0, teardowns: 0 }
    const spied: WritableSource<number> = {
      ...s,
      subscribe: (cb: () => void) => {
        calls.subscribes += 1
        const off = s.subscribe(cb)
        return () => {
          calls.teardowns += 1
          off()
        }
      },
    }
    return { spied, calls }
  }

  it("subscribes on mount and runs the teardown on unmount", () => {
    const { spied, calls } = instrument(15)
    const { unmount } = render(
      <Mainplate min={0} max={60}>
        <Hand value={spied} />
      </Mainplate>,
    )
    expect(calls.subscribes).toBe(1)
    expect(calls.teardowns).toBe(0)
    unmount()
    expect(calls.subscribes).toBe(1)
    expect(calls.teardowns).toBe(1)
  })

  it("writes the rotation through the ref without re-rendering anything", () => {
    // The entire point of the seam: a face ticking eleven times a second must
    // cost zero React renders. Two counters — one in the parent's body, one in
    // the hand's own render prop — so an internal setState is caught even
    // though it would never re-render the parent.
    const s = createSource(0)
    const renders = { face: 0, hand: 0 }
    function Face() {
      renders.face += 1
      return (
        <Mainplate min={0} max={60}>
          <Hand
            value={s}
            render={(props) => {
              renders.hand += 1
              return <g {...props} />
            }}
          />
        </Mainplate>
      )
    }
    const { container } = render(<Face />)
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(0))
    expect(renders).toEqual({ face: 1, hand: 1 })

    act(() => s.set(15))
    // The whole recipe string, not just the angle: the ref write must change
    // `rotate` alone, leaving transform-box and transform-origin standing and
    // adding no transition of its own.
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(90))
    expect(renders).toEqual({ face: 1, hand: 1 })
  })

  it("quantises what the ref path writes, exactly as the render path does", () => {
    // The ref path bypasses React entirely, so the render path's quantisation
    // does not cover it: raw, a seventh of a turn is 51.42857142857143deg.
    const s = createSource(0)
    const { container } = render(
      <Mainplate min={0} max={7}>
        <Hand value={s} />
      </Mainplate>,
    )
    act(() => s.set(1))
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(51.4286))
  })

  it("keeps one subscription across parent re-renders", () => {
    // `subscribe` and `get` must reach the effect unwrapped: a fresh closure
    // identity per render tears the subscription down and re-establishes it on
    // every render — churn no other test in this file can see.
    const { spied, calls } = instrument(15)
    function Face({ tick }: { tick: number }) {
      return (
        <Mainplate min={0} max={60}>
          <Hand value={spied} opacity={tick} />
        </Mainplate>
      )
    }
    const { rerender } = render(<Face tick={1} />)
    rerender(<Face tick={0.9} />)
    rerender(<Face tick={0.8} />)
    expect(calls.subscribes).toBe(1)
    expect(calls.teardowns).toBe(0)
  })

  it("reads min and max from source.domain when no prop overrides them", () => {
    // The domain {0..12} beats the frame's {0..60}: 3 of 12 is 90°, not 18°.
    const s = createSource(3, { min: 0, max: 12 })
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={s} />
        <Hand value={3} />
      </Mainplate>,
    )
    const [live, plain] = container.querySelectorAll('[data-mp="hand"] > g')
    expect(live?.getAttribute("style")).toBe(recipe(90))
    // The sibling still reads the frame: the domain informed one hand, it did
    // not leak into the context.
    expect(plain?.getAttribute("style")).toBe(recipe(18))
    // And the ref path resolves the same scale as the render path did.
    act(() => s.set(6))
    expect(live?.getAttribute("style")).toBe(recipe(180))
  })

  it("lets an explicit prop beat source.domain, which beats the frame", () => {
    // All three levels present and disagreeing — frame max 60, domain max 12,
    // prop max 6. The prop wins: 3 of 6 is half the sweep.
    const s = createSource(3, { min: 0, max: 12 })
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={s} max={6} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(180))
    // The ref path honours the same precedence.
    act(() => s.set(1.5))
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(90))
  })

  it("falls back to the frame when the source declares no domain", () => {
    const s = createSource(15)
    const { container } = render(
      <Mainplate min={0} max={60}>
        <Hand value={s} />
      </Mainplate>,
    )
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(90))
  })

  it("switches between a number and a Source without leaking a subscription", () => {
    const { spied, calls } = instrument(15)
    function Face({ value }: { value: number | Source<number> }) {
      return (
        <Mainplate min={0} max={60}>
          <Hand value={value} />
        </Mainplate>
      )
    }
    const { container, rerender, unmount } = render(<Face value={spied} />)
    expect(calls).toEqual({ subscribes: 1, teardowns: 0 })

    // Back to a number: the controlled form takes over and the old
    // subscription is gone, observed as its teardown running.
    rerender(<Face value={45} />)
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(270))
    expect(calls).toEqual({ subscribes: 1, teardowns: 1 })

    // And back to the source: a fresh subscription that still drives the DOM.
    rerender(<Face value={spied} />)
    expect(calls).toEqual({ subscribes: 2, teardowns: 1 })
    act(() => spied.set(30))
    expect(rotation(container)?.getAttribute("style")).toBe(recipe(180))

    unmount()
    expect(calls).toEqual({ subscribes: 2, teardowns: 2 })
  })

  it("serialises the source's current value on the server, quantised", () => {
    // No effect runs on the server, so the render path alone must carry the
    // exact rotation string the client hydrates against — quantised, since a
    // raw float differs in the last ULP between the two engines.
    const s = createSource(1, { min: 0, max: 7 })
    const html = renderToStaticMarkup(
      <Mainplate min={0} max={60}>
        <Hand value={s} />
      </Mainplate>,
    )
    expect(html).toContain('style="rotate:51.4286deg;transform-box:view-box;transform-origin:0 0"')
  })
})
