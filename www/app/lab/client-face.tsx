"use client"

import { Mainplate, rectOutline } from "@/mainplate/core"

/**
 * The other half of the outline contract: a factory-built `Outline` object,
 * which is only legal once you are already inside the client boundary. Kept in
 * the lab so both paths — plain-data from the server, real object from the
 * client — stay exercised.
 *
 * Module scope, not inline, so the object identity is stable across renders and
 * <Mainplate>'s useMemo is not invalidated every time.
 */
const WIDE = rectOutline({ ratio: 1.6, radius: 40 })

export function ClientFace() {
  return (
    // clip={false} for the one thing this face draws: a stroke centred *on*
    // the outline. Clipping would keep only its inner half, and with the
    // clipped padding default of 0 the outer half would fall outside the
    // viewBox as well — a hairline where a full-weight line was drawn. Turning
    // clipping off restores the whole stroke and the 10 units of room it needs.
    <Mainplate size={240} outline={WIDE} clip={false} label="Client-built outline">
      <path d={WIDE.path()} fill="none" stroke="oklch(0.4 0.01 285)" />
      <circle r={4} fill="oklch(0.92 0.01 95)" />
    </Mainplate>
  )
}
