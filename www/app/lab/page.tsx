import { LabNav, ScratchNotice } from "./nav"

/**
 * The lab index. Nothing renders here: the primitive-era exploration pages
 * went with the SVG examples and the two HTML prototypes went once `faces/`
 * shipped. What is left is the three faces-era routes below — scratch, not
 * documentation.
 */
export default function Lab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">mainplate lab</h1>
      <p className="mt-2 text-sm opacity-60">Dev harness. The faces render on the routes below.</p>
      <LabNav current="/lab" />
      <ScratchNotice />
    </main>
  )
}
