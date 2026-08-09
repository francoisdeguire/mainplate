/**
 * The error ruling, spelled once: throw for programmer error, degrade for data.
 * May import: nothing. Must not import: react, time/.
 *
 * Every anchored primitive shares one misuse class — contradictory
 * exactly-one-of props smuggled past the XOR types by an untyped spread — and
 * the sites used to answer it four different ways, from a hard production
 * throw to silence. This module is the single answer: development throws so
 * the mistake cannot be missed, production degrades to a documented survivor
 * and says so once.
 */

/**
 * Production warnings already spoken, keyed by the whole line.
 *
 * These sites run per primitive per render — sixty times a second on a face
 * driven by a hand — so an undeduped log is a log that buries the page. Keyed
 * by the message rather than a flag, and every message interpolates what it
 * received, so a second, *different* misuse still speaks up instead of hiding
 * behind the first one's key.
 */
const warned = new Set<string>()

/**
 * A programmer error, handled per the global ruling: development throws
 * `received`; production appends `fallback` — what the code will do instead —
 * and logs the whole line through one deduped `console.error`. Degrading
 * beats taking down the route, but degrading in silence is the failure class
 * this helper exists to catch.
 *
 * `received` must interpolate the offending input, because it doubles as the
 * dedup key: a static string would log an entire misuse class at most once
 * for the life of the page, silencing every later, different mistake.
 */
export function failSoft(received: string, fallback: string): void {
  if (process.env.NODE_ENV !== "production") throw new Error(received)
  const line = `${received} ${fallback}`
  if (warned.has(line)) return
  warned.add(line)
  console.error(line)
}

/**
 * The one message for the misuse every anchored primitive shares, so the
 * wording cannot drift between call sites — `owner` is the caller's own name
 * for itself, and the values ride along per `failSoft`'s dedup contract.
 *
 * The survivor precedence, everywhere it applies, is `track` > `r` > `inset`.
 * An omitted anchor *is* `inset: 0`, so `inset` is the one value that can
 * arrive by accident, from a spread or a shared props object; `r` only ever
 * appears because somebody wrote a number; and `track` hands the radius to a
 * solver, the most deliberate ask of the three.
 */
export function bothAnchorsMessage(owner: string, r: unknown, inset: unknown): string {
  return (
    `mainplate: ${owner} takes only one of \`r\` or \`inset\` — received r=${describe(r)} and ` +
    `inset=${describe(inset)}. \`r\` is frame-anchored — a fixed radius from the centre, ` +
    "ignoring the outline. `inset` is outline-anchored — a distance inward from the edge, so " +
    "it follows the shape. On a circle they can agree; on any other outline they cannot, so " +
    "there is no sensible way to honour both."
  )
}

/** The anchors may be function-valued on `<Ticks>`/`<Numerals>`; say so rather than print source. */
function describe(v: unknown): string {
  return typeof v === "function" ? "a function" : String(v)
}
