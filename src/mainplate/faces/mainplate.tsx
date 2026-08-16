"use client"

/**
 * `<Mainplate>` — the context root of the HTML face layer.
 * May import: core, faces/palette. Must not be imported by core/ or time/.
 *
 * One div establishes everything a face's parts share: the outline, the face
 * box the percentages are expressed against, the palette, and the liveness
 * registry that pauses the whole face offscreen. Parts read it through
 * `useFaceContext()`; `<Complication>` will be the one component that
 * re-establishes it scaled. A client component of necessity — React context
 * does not cross the Server Component boundary — which is why `shape` is
 * plain data (`OutlineSpec` descriptors), never a factory-built `Outline`.
 *
 * Sizing is CSS: the root is an inline-size container with the outline's own
 * aspect ratio, all internal geometry is `cqw`, so `className="w-40"` (or
 * `w-full`, or anything) sizes the face. No size prop, no ResizeObserver.
 */
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { fmt, frameBox, type Outline, resolveOutline } from "../core"
import { hoistArcs } from "./arc"
import { paletteVars } from "./palette"

/**
 * The face's shape. Plain data so it crosses the Server Component boundary;
 * `{ ratio, radius }` is the Meridian/Tank form. Rect tick math goes live in
 * the shape task — until then a rect face renders, on the same engine, with
 * the circle's part defaults.
 */
export type FaceShape = "circle" | "rect" | { ratio?: number; radius?: number }

/** What a live part must do when its face leaves or re-enters the viewport. */
type LiveHooks = { pause(): void; resume(): void }

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
 * Exported for `<Complication>` alone — the one component allowed to
 * re-establish the context (scaled, at a resolved point). Deliberately not in
 * the barrel: a consumer with a legitimate custom face root composes
 * `<Mainplate>`, never a bare provider.
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

/**
 * One face's viewport liveness. Mirrors the time layer's `createVisibility`
 * semantics exactly — unattached or unobservable means visible, a torn-down
 * observer can never fire again — but lives here so it works for *any*
 * `Source`, not only the wall clock. The observer exists only while a live
 * part is registered AND the root is attached: a face of static hands never
 * constructs one, which is the "auto" in auto-attach.
 */
function createLiveness() {
  let node: Element | null = null
  let observer: IntersectionObserver | null = null
  let visible = true
  const live = new Set<LiveHooks>()

  function set(next: boolean) {
    if (next === visible) return
    visible = next
    for (const hooks of live) {
      if (next) hooks.resume()
      else hooks.pause()
    }
  }

  function sync() {
    const want = live.size > 0 && node !== null && typeof IntersectionObserver !== "undefined"
    if (want && observer === null && node !== null) {
      observer = new IntersectionObserver((entries) => {
        // Entries arrive oldest-first; only the newest reflects the present.
        const latest = entries[entries.length - 1]
        if (latest !== undefined) set(latest.isIntersecting)
      })
      observer.observe(node)
    } else if (!want && observer !== null) {
      observer.disconnect()
      observer = null
      // Unobserved means visible: a still-subscribed face must never stay
      // dark behind an observer that no longer exists.
      set(true)
    }
  }

  return {
    attach(next: Element | null) {
      if (next === node) return
      node = next
      if (observer !== null) {
        observer.disconnect()
        observer = null
        set(true)
      }
      sync()
    },
    register(hooks: LiveHooks) {
      live.add(hooks)
      sync()
      // Registering into an already-hidden face pauses immediately — a part
      // mounted offscreen must not run until the face scrolls in.
      if (!visible) hooks.pause()
      return () => {
        live.delete(hooks)
        sync()
      }
    },
  }
}

export type MainplateProps = {
  /** The face's shape. @default "circle" */
  shape?: FaceShape
  /** One CSS color; the whole palette derives from it in CSS. @default the inherited `currentColor` */
  color?: string
  /** Accessible name for the `role="img"` root. @default "Face" */
  label?: string
  /** Full structure, zero default paint; slots own everything. @default false */
  unstyled?: boolean
  className?: string
  children?: ReactNode
  /**
   * Standard div attributes, `role` among them. It defaults to `"img"` — a
   * face is a picture — and `<Gauge>` overrides it with `"meter"` plus the
   * `aria-value*` trio, so a reading reaches assistive technology as a value.
   * Both roles are Children-Presentational-True in ARIA 1.2, so no part below
   * ever needs `aria-hidden` of its own. `aria-label` is the exception the
   * spread cannot reach: the accessible name is this root's own contract.
   */
} & Omit<ComponentProps<"div">, "children" | "className" | "aria-label">

/**
 * The context root: an HTML div wearing the palette, sized by CSS, named for
 * assistive technology. `role="img"` makes every descendant presentational
 * (ARIA 1.2 children-presentational), so no part needs `aria-hidden` of its
 * own — the label is the face's whole accessible surface.
 */
export function Mainplate({
  shape = "circle",
  color,
  label = "Face",
  unstyled = false,
  className,
  style,
  children,
  ref,
  ...rest
}: MainplateProps) {
  // One liveness registry per instance, created once — never on the server's
  // hot path beyond a closure allocation, never touching an observer until a
  // live part registers in a browser.
  const [liveness] = useState(createLiveness)

  // Memo keys are the shape's own scalars, not the object: an inline
  // `shape={{ ratio: 0.82 }}` is a new object every render and must not
  // rebuild the outline (or worse, re-key every part's geometry).
  const kind = typeof shape === "string" ? shape : "sized-rect"
  const ratio = typeof shape === "object" ? shape.ratio : undefined
  const radius = typeof shape === "object" ? shape.radius : undefined

  const face = useMemo<FaceContextValue>(() => {
    const outline = resolveOutline(kind === "circle" ? "circle" : { kind: "rect", ratio, radius })
    // The same box `dialPercent` would use for an HTML layer beside this
    // face: bbox grown by the unclipped padding. One function, two consumers.
    const box = frameBox({ outline, clip: false })
    return { outline, boxW: box.width, boxH: box.height, unstyled, registerLive: liveness.register }
  }, [kind, ratio, radius, unstyled, liveness])

  const attachRef = useCallback(
    (node: HTMLDivElement | null) => {
      liveness.attach(node)
      if (typeof ref === "function") ref(node)
      else if (ref !== null && ref !== undefined) ref.current = node
    },
    [liveness, ref],
  )

  return (
    <FaceContext.Provider value={face}>
      <div
        className={className}
        style={{
          position: "relative",
          containerType: "inline-size",
          aspectRatio: `${fmt(face.boxW)} / ${fmt(face.boxH)}`,
          // The palette stays under `unstyled`: variables paint nothing —
          // they are inputs a design system may still want — and the parts'
          // paint is what `unstyled` removes.
          ...(paletteVars(color) as CSSProperties),
          ...style,
        }}
        // Before the spread, so a face that is a meter can say so; after it,
        // the name and the ref stay the root's own.
        role="img"
        {...rest}
        ref={attachRef}
        aria-label={label}
      >
        {/* One `<svg>` per face, created on demand: `hoistArcs` lifts every
            `<Arc>` among these children into a single shared layer, at the
            position the first of them was written. A face with no arc — every
            clock — gets its children back untouched. */}
        {hoistArcs(children)}
      </div>
    </FaceContext.Provider>
  )
}
