import { LabNav, ScratchNotice } from "./nav"

/**
 * The lab index. Nothing renders here any more: the primitive-era exploration
 * pages went with the SVG examples, and what is left is the two HTML
 * prototypes the face layer is being built from — both scratch, both deleted
 * once `faces/` ships.
 */
export default function Lab() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">mainplate lab</h1>
      <p className="mt-2 text-sm opacity-60">
        Dev harness. Faces render here as the HTML layer lands.
      </p>
      <LabNav current="/lab" />
      <ScratchNotice />
    </main>
  )
}
