"use client"

/**
 * The animated date window — INTERNAL, not tier-1 API (not in the barrel).
 * May import: faces/*. Composed by the lab pages and Task 10's complex face,
 * always inside a content-mode `<Complication>`.
 *
 * A rolling number in an overflow-hidden window: on a value change the old
 * digit slides out upward and the new one slides in from below, one CSS
 * transition on translateY (~200ms, strong ease-out — a mechanical date disc
 * clicking over). Reduced motion swaps instantly. Minimal-Swiss: ink on
 * light, tabular digits, a hairline frame. Sized in cqw so it scales with
 * the face it sits on.
 */
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react"
import { usePrefersReducedMotion } from "./face"

/** ~200ms, fast out and a soft landing — the disc clicks, it does not drift. */
const ROLL = "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)"

/** How long after arming before the old digit leaves the DOM. */
const SETTLE_MS = 240

const WINDOW: CSSProperties = {
  overflow: "hidden",
  height: "11cqw",
  minWidth: "12cqw",
  padding: "0 1.6cqw",
  borderRadius: "1.6cqw",
  border: "0.45cqw solid oklch(from var(--mp-ink, #1a1a1a) l c h / 0.18)",
  background: "#fff",
  color: "var(--mp-ink, #1a1a1a)",
  fontSize: "6.4cqw",
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
}

const ROW: CSSProperties = {
  height: "11cqw",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}

export function DateWindow({ value }: { value: number }) {
  const reduced = usePrefersReducedMotion()
  // `prev` non-null means mid-roll: two rows in the window, the track a row
  // tall of travel from done. Adjusted during render (the sanctioned derived-
  // state form), so the first paint of a change already shows both rows.
  const [shown, setShown] = useState<{ current: number; prev: number | null }>({
    current: value,
    prev: null,
  })
  if (shown.current !== value) {
    setShown({ current: value, prev: reduced ? null : shown.current })
  }

  const track = useRef<HTMLDivElement | null>(null)
  const rolling = shown.prev !== null

  useLayoutEffect(() => {
    const node = track.current
    if (node === null) return
    if (!rolling) {
      // At rest the track owns no inline motion styles — the next roll (and
      // React's own re-renders) start from a clean element.
      node.style.transition = ""
      node.style.transform = ""
      return
    }
    // Name the roll on the element — inspectable in devtools, and the read
    // is what makes a mid-roll value change restart the animation (the
    // dependency below re-fires this effect for the new digit).
    node.dataset.rollTo = String(shown.current)
    // Two writes with a forced style flush between them: land on the old
    // digit un-transitioned, then arm the transition and slide one row up.
    node.style.transition = "none"
    node.style.transform = "translateY(0)"
    void node.getBoundingClientRect()
    node.style.transition = ROLL
    node.style.transform = "translateY(-50%)"
    const settle = setTimeout(() => setShown((s) => ({ ...s, prev: null })), SETTLE_MS)
    return () => clearTimeout(settle)
  }, [rolling, shown.current])

  return (
    <div style={WINDOW}>
      <div ref={track} data-mp="date-track">
        {shown.prev !== null && (
          <div key={`out:${shown.prev}`} style={ROW}>
            {shown.prev}
          </div>
        )}
        <div key={`in:${shown.current}`} style={ROW}>
          {shown.current}
        </div>
      </div>
    </div>
  )
}
