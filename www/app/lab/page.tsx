import { rectOutline } from "@/mainplate/core/outline"

export default function Lab() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">mainplate lab</h1>
      <p className="mt-2 text-sm opacity-60">Dev harness. Faces render here as primitives land.</p>
      <div className="mt-8 flex flex-wrap gap-8">
        {/* Boundary probe: proves `../src/mainplate` resolves and produces real
            path data. Task 8 replaces this with the first <Mainplate> face. */}
        <svg viewBox="-140 -140 280 280" width="160" height="160" aria-label="outline probe">
          <title>outline probe</title>
          <path
            d={rectOutline({ ratio: 0.78, radius: 12 }).path()}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.4"
          />
        </svg>
      </div>
    </main>
  )
}
