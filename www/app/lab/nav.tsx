import Link from "next/link"

/**
 * Shared chrome for the lab routes. Scratch furniture, not part of the library
 * and not part of the eventual docs site — it exists so the four exploration
 * pages are reachable from one another while the API is being felt out.
 */
const ROUTES = [
  { href: "/lab", label: "thesis" },
  { href: "/lab/playground", label: "playground" },
  { href: "/lab/orient", label: "orient" },
  { href: "/lab/hand", label: "hand" },
  { href: "/lab/gallery", label: "gallery" },
  { href: "/lab/live", label: "live" },
  { href: "/lab/layers", label: "layers" },
  { href: "/lab/face", label: "face" },
] as const

export function LabNav({ current }: { current: string }) {
  return (
    <nav className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs tracking-wide uppercase">
      {ROUTES.map((route) => (
        <Link
          key={route.href}
          href={route.href}
          className={
            route.href === current
              ? "text-ink underline underline-offset-4"
              : "text-dim transition-colors hover:text-ink"
          }
        >
          {route.label}
        </Link>
      ))}
    </nav>
  )
}

/** The delete-me line every scratch page carries at the top. */
export function ScratchNotice() {
  return (
    <p className="mt-4 border border-dashed border-line px-3 py-2 text-xs text-dim">
      <span className="text-ink">Temporary exploration page.</span> Scratch, not documentation —
      built to feel out the API by hand. The whole <code>www/app/lab</code> folder is safe to delete
      when the real docs site lands.
    </p>
  )
}
