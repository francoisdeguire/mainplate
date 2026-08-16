"use client"

/**
 * The animated date window — LAB code, not library API.
 *
 * A rolling number in an overflow-hidden window: on a value change the old
 * digit slides out upward and the new one slides in from below, one CSS
 * transition on translateY (~200ms, strong ease-out — a mechanical date disc
 * clicking over). Reduced motion swaps instantly. Minimal-Swiss: ink on
 * light, tabular digits, a hairline frame. Sized in cqw so it lives on a
 * face, inside a content-mode `<Complication>`.
 */
import { type CSSProperties, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function subscribeMotion(onChange: () => void): () => void {
  if (typeof matchMedia === "undefined") return () => {}
  const mql = matchMedia(REDUCED_MOTION)
  if (typeof mql.addEventListener !== "function") return () => {}
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function readMotion(): boolean {
  return typeof matchMedia === "undefined" ? false : matchMedia(REDUCED_MOTION).matches
}

/** Lab-local twin of the library's private hook — the lab imports the barrel only. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, readMotion, () => false)
}

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
      <div ref={track} data-lab="date-track">
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
