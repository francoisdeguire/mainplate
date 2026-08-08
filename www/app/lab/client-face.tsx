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
    <Mainplate size={240} outline={WIDE} label="Client-built outline">
      <path d={WIDE.path()} fill="none" stroke="oklch(0.4 0.01 285)" />
      <circle r={4} fill="oklch(0.92 0.01 95)" />
    </Mainplate>
  )
}
