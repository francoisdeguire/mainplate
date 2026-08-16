"use client"

/**
 * `FaceContext` — what every part reads, and the one way in.
 * May import: core. Must not import: any other `faces/` module.
 *
 * Nothing here renders. The context lives in its own module for one structural
 * reason: **both the root that provides it and the parts that read it need
 * it**, and one of those parts — `<Arc>` — is also imported *by* the root, to
 * host the shared SVG layer. Left in `mainplate.tsx`, that pairing is a module
 * cycle (harmless at render time, since neither module touches the other while
 * evaluating, but a cycle nonetheless). A leaf module both sides depend on
 * removes it outright rather than relying on evaluation order staying benign.
 *
 * What is deliberately NOT here: the domain. A reading's `min`/`max`/sweep live
 * on the part that maps it, so a nested register states its own domain exactly
 * as a root face would — there is nothing to leak and nothing to reset.
 */
import { createContext, useContext } from "react"
import type { Outline } from "../core"

/** What a live part must do when its face leaves or re-enters the viewport. */
export type LiveHooks = { pause(): void; resume(): void }

/**
 * What every part reads: the outline it places marks on, and the face box
 * (`frameBox`'s width/height, dial units) its percentages and cqw sizes are
 * expressed against. `unstyled` and `registerLive` ride along so paint and
 * liveness need no second context.
 */
export type FaceContextValue = {
  outline: Outline
  boxW: number
  boxH: number
  /**
   * The face's silhouette, for parts whose DEFAULTS depend on it: `null` on a
   * round face, the corner radius in dial units (0 for square corners) on a
   * rect. Two consumers and no more — `<Dial>` turns it into `border-radius`,
   * and `<Ticks>` picks the default track pair with it (a rect face's minute
   * ring is perimeter-placed, a circle's keeps the skip pair). GEOMETRY never
   * reads it: placement always goes through the outline, which is why a
   * square-cornered rect is not a circle even though its bbox is square.
   */
  cornerRadius: number | null
  /** Zero default paint (the sonner escape hatch); parts skip every background. */
  unstyled: boolean
  /**
   * A part driving itself from a `Source` registers here. While at least one
   * is registered, the Mainplate observes its own root and pauses/resumes
   * them as the face leaves and re-enters the viewport — offscreen pausing
   * with no consumer wiring, for any `Source`, because pausing is just
   * unsubscribing and the time layer's refcount does the rest.
   */
  registerLive(hooks: LiveHooks): () => void
}

/**
 * Provided by `<Mainplate>`, and re-established by `<Complication size>` alone
 * — the one component allowed to hand a subtree a scaled face of its own.
 * Deliberately not in the barrel: a consumer with a legitimate custom face root
 * composes `<Mainplate>`, never a bare provider.
 */
export const FaceContext = createContext<FaceContextValue | null>(null)

/** The face parts' one way in. Throws outside `<Mainplate>` — there is no geometry to fall back to. */
export function useFaceContext(): FaceContextValue {
  const ctx = useContext(FaceContext)
  if (ctx === null) {
    throw new Error(
      "mainplate: face parts must render inside <Mainplate> (or a component composed of it).",
    )
  }
  return ctx
}
