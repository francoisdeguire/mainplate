/**
 * Optical numeral clearance: where a label must sit to clear a tick.
 * May import: geometry. Must not import: react, time/.
 *
 * The eye reads the *shortest* distance between a numeral's ink and the tick
 * it labels — not the distance along the ray between them. A wide label at a
 * diagonal position brings a corner near the tick without that corner ever
 * lying on the ray, so holding the on-ray gap constant (this module's
 * predecessor) makes "220" crowd its tick while "0" floats. Everything here
 * exists to hold the shortest distance constant instead, and to measure that
 * distance against the label's optical footprint rather than its em box.
 */
import { type Degrees, type DialUnits, polar } from "../core/geometry"

/**
 * The optical footprint of a label: the box the eye reads, as half-extents in
 * dial units about the anchored centre, with an optional corner recession per
 * side.
 *
 * `halfHeight` is half the *flat cap band* — round glyphs deliberately
 * overshoot it (that is what overshoot is for) and the eye discounts the
 * excess, so the band is the honest optical height for every dial string.
 * `cornerLeft` / `cornerRight` say how far the outermost glyph's ink recedes
 * from its box corner: a "0" is round everywhere and its corners hold no ink,
 * so a tick approaching corner-on may sit that much closer before the eye
 * sees the gap shrink. Left and right are the label's own reading direction;
 * either may be omitted for a squarely-inked glyph.
 */
export type Ink = {
  halfWidth: DialUnits
  halfHeight: DialUnits
  cornerLeft?: DialUnits
  cornerRight?: DialUnits
}

/**
 * The tick being cleared: `r` is the frame radius of its numeral-facing inner
 * end, `width` its tangential width — the same two words `<Ticks>` uses for
 * the same quantities. `width` omitted treats the tick as a point at its tip;
 * `Infinity` turns it into a rail (a chapter ring's line), which every
 * direction ends at, so the box corner governs the clearance.
 */
export type TickFace = { r: DialUnits; width?: DialUnits }

/**
 * Per-character advance widths in em, for the characters that break the
 * fallback. Measured off canvas rasterisation of the system font stack:
 * digits cluster at 0.55–0.62em of advance, so 0.61 covers them generously,
 * and only the genuinely narrow ("1", "I") or wide ("W", "M") shapes need
 * their own entry.
 */
const CHAR_EM: Record<string, number> = {
  "1": 0.45,
  "7": 0.55,
  I: 0.24,
  M: 0.85,
  N: 0.7,
  V: 0.64,
  // "W" nearly fills its advance (0.924em advance, 0.88em ink), so its entry
  // pre-pays the end-trim other glyphs genuinely carry.
  W: 0.98,
}

const FALLBACK_CHAR_EM = 0.61

/**
 * End side bearings, in em. A string's ink is narrower than the sum of its
 * advances by roughly one bearing at each end — measured 0.09–0.095em across
 * the digit strings ("220": 1.738em advance, 1.643em ink). Subtracting it
 * keeps multi-digit estimates within ~1% of real ink instead of ~6% over.
 */
const TRIM_EM = 0.09

/**
 * The flat cap band, in em. Measured ink height is 0.705em for every
 * flat-topped dial string and 0.73em for strings containing a round digit —
 * overshoot of ~1.8% of cap height per side, squarely inside the 1–3% type
 * designers aim for. The band, not the overshot ink, is what the eye reads as
 * the glyph's height, so the estimate uses 0.705 for everything and lets
 * rounds protrude exactly as their designer intended.
 */
const CAP_EM = 0.705

/**
 * Corner recession in em for round-cornered glyphs. The measured emptiness at
 * the ink-box corners of 0/3/4/6/8/9/C/G/O/Q/S is 0.087–0.265em; 0.08 is the
 * safe floor, so the modelled boundary never cuts into real ink. Glyphs with
 * any square corner — "2"'s flat base, "N", "E", "I" — get no recession at
 * all, which is why this is a class table and not a constant.
 */
const CORNER_EM = 0.08

const ROUND_CORNERED = new Set(["0", "3", "4", "6", "8", "9", "C", "G", "O", "Q", "S"])

/**
 * Estimate a label's optical footprint from its text and font size — no DOM,
 * no canvas, no layout pass, so it is SSR-safe and deterministic.
 *
 * A dial's character set is tiny and descender-free, which is what makes a
 * six-constant estimate land within about one dial unit of measured ink, and
 * err toward a generous gap where it misses. `fontSize` is in dial units,
 * matching the `<text>` attribute it will be rendered with.
 */
export function estimateInk(label: string, fontSize: DialUnits): Ink {
  const chars = [...label]
  const advance = chars.reduce((w, ch) => w + (CHAR_EM[ch] ?? FALLBACK_CHAR_EM), 0)
  const emWidth = Math.max(advance - TRIM_EM, 0)
  const halfWidth = (emWidth * fontSize) / 2
  const halfHeight = (CAP_EM * fontSize) / 2
  const corner = Math.min(CORNER_EM * fontSize, halfWidth, halfHeight)
  return {
    halfWidth,
    halfHeight,
    cornerLeft: ROUND_CORNERED.has(chars.at(0) ?? "") ? corner : 0,
    cornerRight: ROUND_CORNERED.has(chars.at(-1) ?? "") ? corner : 0,
  }
}

type Vec = { x: number; y: number }

/**
 * Everything below works in the label's local frame, where the ink box is
 * axis-aligned: `u` is the outward ray direction expressed in those axes and
 * `v` its perpendicular. For upright text the local frame is the dial's; for
 * text rotated with its ray, `u` collapses to straight-up and the whole
 * problem reduces to the scalar half-height case.
 */
function frameOf(angle: Degrees, rotation: Degrees) {
  const u = polar(angle - rotation, 1)
  return { u, v: { x: -u.y, y: u.x } }
}

/** Corner recessions, clamped so a tiny label cannot recede past its own core. */
function recessionsOf(ink: Ink): { rl: number; rr: number } {
  const cap = Math.min(ink.halfWidth, ink.halfHeight)
  const clamp = (c: number) => Math.min(Math.max(c, 0), cap)
  return { rl: clamp(ink.cornerLeft ?? 0), rr: clamp(ink.cornerRight ?? 0) }
}

/**
 * Distance from a point to the ink's rounded box. Exact for outside points:
 * inside the corner cut the nearest feature is the corner arc, otherwise it
 * is an edge. Inside the box the value goes negative — not a true signed
 * distance, but sign-correct, which is all the bisection needs.
 */
function inkDistance(p: Vec, ink: Ink): number {
  const { rl, rr } = recessionsOf(ink)
  const rq = p.x < 0 ? rl : rr
  const dx = Math.abs(p.x) - (ink.halfWidth - rq)
  const dy = Math.abs(p.y) - (ink.halfHeight - rq)
  if (dx > 0 && dy > 0) return Math.hypot(dx, dy) - rq
  return Math.max(Math.abs(p.x) - ink.halfWidth, Math.abs(p.y) - ink.halfHeight)
}

/**
 * The ink's farthest reach toward the tick — the support distance, corner
 * recessions included. Beyond `support + clearance` the whole label clears by
 * construction, which is what makes it both the rail's closed form and the
 * bisection's guaranteed upper bracket.
 */
function supportOf(ink: Ink, u: Vec): number {
  const { rl, rr } = recessionsOf(ink)
  let best = Number.NEGATIVE_INFINITY
  for (const sx of [-1, 1]) {
    const rq = sx < 0 ? rl : rr
    for (const sy of [-1, 1]) {
      const c = { x: sx * (ink.halfWidth - rq), y: sy * (ink.halfHeight - rq) }
      best = Math.max(best, c.x * u.x + c.y * u.y + rq)
    }
  }
  return best
}

/**
 * Shortest distance between the ink and a tick whose inner edge sits `d`
 * along the ray, modelled as a half-strip: the inner edge plus flanks running
 * outward without end (a longer tick can only be farther).
 *
 * Both shapes are convex, so the minimum is achieved vertex-to-boundary:
 * either one of the strip's two inner corners against the rounded box, or one
 * of the box's four corner discs against the strip. Six point queries, exact.
 */
function separation(d: number, halfTick: number, ink: Ink, u: Vec, v: Vec): number {
  const { rl, rr } = recessionsOf(ink)
  let best = Number.POSITIVE_INFINITY
  for (const s of [-1, 1]) {
    const p = { x: d * u.x + s * halfTick * v.x, y: d * u.y + s * halfTick * v.y }
    best = Math.min(best, inkDistance(p, ink))
  }
  for (const sx of [-1, 1]) {
    const rq = sx < 0 ? rl : rr
    for (const sy of [-1, 1]) {
      const c = { x: sx * (ink.halfWidth - rq), y: sy * (ink.halfHeight - rq) }
      const along = c.x * u.x + c.y * u.y
      const lateral = c.x * v.x + c.y * v.y
      const toStrip = Math.hypot(Math.max(d - along, 0), Math.max(Math.abs(lateral) - halfTick, 0))
      best = Math.min(best, toStrip - rq)
    }
  }
  return best
}

/**
 * The clearance a label would have with its centre anchored at radius `r`:
 * the shortest distance between its optical ink and the tick, in dial units.
 * Non-positive means the ink touches or overlaps the tick. The inverse of
 * {@link clearanceRadius}, exposed so a consumer placing text by other means
 * can still ask how a placement reads.
 */
export function inkClearance(args: {
  ink: Ink
  angle: Degrees
  rotation?: Degrees
  tick: TickFace
  r: DialUnits
}): DialUnits {
  const { u, v } = frameOf(args.angle, args.rotation ?? 0)
  const d = args.tick.r - args.r
  const halfTick = (args.tick.width ?? 0) / 2
  if (!Number.isFinite(halfTick)) return d - supportOf(args.ink, u)
  return separation(d, halfTick, args.ink, u, v)
}

/**
 * The anchor radius at which a label's ink clears its tick by exactly
 * `clearance` — the number `<Numerals>` needs to place upright text so every
 * label on a ring, whatever its width or angle, reads the same gap.
 *
 * The label is assumed inward of the tick, the arrangement of every gauge,
 * compass and chapter ring; mirror the inputs for an outside scale. At the
 * cardinals and for ray-rotated text the answer is the closed-form edge case
 * (half-extent plus clearance); a rail is the closed-form support case; the
 * general diagonal mixes edge, corner-arc and flank regimes, so it is solved
 * by bisecting the exact separation between the guaranteed brackets 0 and
 * support + clearance. Separation only grows as the label moves inward, which
 * is what makes the inverse well defined.
 */
export function clearanceRadius(args: {
  ink: Ink
  angle: Degrees
  rotation?: Degrees
  tick: TickFace
  clearance: DialUnits
}): DialUnits {
  const { u, v } = frameOf(args.angle, args.rotation ?? 0)
  const g = Math.max(args.clearance, 0)
  const halfTick = (args.tick.width ?? 0) / 2
  const reach = supportOf(args.ink, u)
  if (!Number.isFinite(halfTick)) return args.tick.r - (reach + g)
  if (separation(0, halfTick, args.ink, u, v) >= g) return args.tick.r
  let lo = 0
  let hi = reach + g
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (separation(mid, halfTick, args.ink, u, v) < g) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return args.tick.r - hi
}
