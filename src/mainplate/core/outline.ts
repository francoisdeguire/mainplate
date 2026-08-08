/**
 * Outlines: the closed path that statics are placed on.
 * May import: geometry. Must not import: react, time/.
 *
 * The frame answers "given a value, what angle?"; the outline answers "given
 * an angle, where is the edge?". On a circle these coincide, which is why most
 * libraries have only one. On a rectangle they do not.
 */
import { type Degrees, DIAL_RADIUS, type DialUnits, fmt, type Point, polar } from "./geometry"

/** An axis-aligned rectangle in dial units, origin at the dial centre. */
export type Rect = { x: number; y: number; width: number; height: number }

/** A closed path that statics are placed on, queried by angle. */
export type Outline = {
  /** The point at `angle` on the outline, shrunk inward by `inset`. */
  pointAt(angle: Degrees, inset?: DialUnits): Point
  /** The inward-pointing unit normal at `angle`. */
  normalAt(angle: Degrees, inset?: DialUnits): Point
  /** The bounding box of the outline shrunk inward by `inset`. */
  bbox(inset?: DialUnits): Rect
  /** SVG path data for the outline shrunk inward by `inset`. */
  path(inset?: DialUnits): string
}

/** The default outline: a circle of the nominal dial radius. */
export function circleOutline(): Outline {
  const radiusAt = (inset: DialUnits) => Math.max(DIAL_RADIUS - inset, 0)

  return {
    pointAt: (angle, inset = 0) => polar(angle, radiusAt(inset)),

    normalAt: (angle) => {
      const p = polar(angle, 1)
      return { x: -p.x, y: -p.y }
    },

    bbox: (inset = 0) => {
      const r = radiusAt(inset)
      return { x: -r, y: -r, width: r * 2, height: r * 2 }
    },

    path: (inset = 0) => {
      const r = radiusAt(inset)
      const f = fmt(r)
      // Two half-arcs: SVG cannot express a full circle in a single arc command.
      return `M 0 ${fmt(-r)} A ${f} ${f} 0 1 1 0 ${f} A ${f} ${f} 0 1 1 0 ${fmt(-r)} Z`
    },
  }
}

/**
 * An outline, or plain data describing one.
 *
 * `Outline` is an object of closures, and functions cannot cross the React
 * Server Component boundary: `<Mainplate outline={rectOutline(...)}>` written
 * in a server component throws "Functions cannot be passed directly to Client
 * Components" before any mainplate code runs. `<Mainplate>` must stay a client
 * component — React context is unsupported in server components — so the fix is
 * to let the *description* cross the boundary instead of the behaviour, and
 * build the real `Outline` on the client.
 *
 * Hence the plain-data forms. Use `"circle"`, `"rect"`, or a descriptor like
 * `{ kind: "rect", ratio: 0.78 }` from a server component; pass a factory-built
 * `Outline` when you are already inside `"use client"` or need a custom shape.
 */
export type OutlineSpec =
  | "circle"
  | "rect"
  | { kind: "circle" }
  | { kind: "rect"; ratio?: number; radius?: DialUnits }
  | Outline

/**
 * Structural check, mirroring `isSource`: every method must be callable.
 *
 * All four, not just `pointAt`. A partial object would otherwise pass as an
 * `Outline` and fail later inside `<Mainplate>` — which calls `bbox()` first —
 * as a bare `TypeError`, losing the branded error this module exists to give.
 */
function isOutline(v: unknown): v is Outline {
  if (typeof v !== "object" || v === null) return false
  const o = v as Outline
  return (
    typeof o.pointAt === "function" &&
    typeof o.normalAt === "function" &&
    typeof o.bbox === "function" &&
    typeof o.path === "function"
  )
}

/**
 * A short, safe description of bad input.
 *
 * `JSON.stringify` drops functions, so a half-built `Outline` would otherwise
 * be reported as `{}` — exactly the case worth naming. Fall back to the keys.
 */
function describeSpec(v: unknown): string {
  if (typeof v !== "object" || v === null) return JSON.stringify(v) ?? String(v)
  const json = JSON.stringify(v)
  const keys = Object.keys(v)
  return json === "{}" && keys.length > 0 ? `object with keys [${keys.join(", ")}]` : json
}

/**
 * Normalise an {@link OutlineSpec} into a real `Outline`.
 *
 * `undefined` yields the default circle. An `Outline` passes straight through,
 * so this is safe to call on an already-resolved value.
 *
 * On unrecognised input this throws in development. In production it logs and
 * falls back to the default circle, so one malformed descriptor degrades a
 * single face rather than taking down the route — but never in silence.
 */
export function resolveOutline(spec?: OutlineSpec): Outline {
  if (spec === undefined || spec === "circle") return circleOutline()
  if (spec === "rect") return rectOutline()

  if (typeof spec === "object" && spec !== null && "kind" in spec) {
    if (spec.kind === "circle") return circleOutline()
    if (spec.kind === "rect") return rectOutline({ ratio: spec.ratio, radius: spec.radius })
  }

  if (isOutline(spec)) return spec

  const received = `mainplate: unrecognised outline ${describeSpec(spec)}.`

  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `${received} Pass "circle", "rect", a descriptor such as ` +
        `{ kind: "rect", ratio: 0.78, radius: 12 }, or an Outline from circleOutline() / ` +
        `rectOutline() with all four methods. Note that an Outline is made of functions, so ` +
        `it cannot be passed from a React Server Component — use the descriptor form there, ` +
        `or build the Outline inside a "use client" component.`,
    )
  }

  // Deliberately outside the guard above: degrading to a circle is the right
  // call in production, but doing it silently is the failure class we are
  // meant to prevent. One line, one face, and it reaches error tracking.
  console.error(`${received} Falling back to the default circle.`)
  return circleOutline()
}

type RectDims = { hw: DialUnits; hh: DialUnits; rr: DialUnits }

// Guards float noise when classifying which edge or corner a traced point sits on.
const EDGE_TOLERANCE = 1e-9

/**
 * A rectangular outline, optionally with rounded corners.
 *
 * @param ratio  Width divided by height. Per the dial-unit rule, the *minor*
 *               axis half-extent is always 100, so a Tank at 0.78 is 100 wide
 *               and ~128 tall in dial units. @default 1
 * @param radius Corner radius in dial units. @default 0
 */
export function rectOutline({
  ratio = 1,
  radius = 0,
}: {
  ratio?: number
  radius?: DialUnits
} = {}): Outline {
  const baseHalfWidth = ratio <= 1 ? DIAL_RADIUS : DIAL_RADIUS * ratio
  const baseHalfHeight = ratio <= 1 ? DIAL_RADIUS / ratio : DIAL_RADIUS

  /**
   * Shrinking a rounded rect inward by `d` moves each edge in by `d` and
   * reduces the corner radius by `d`, which leaves the corner *centres* where
   * they were. The angle at which an arc begins still moves, so region
   * classification has to be recomputed per inset.
   */
  const dims = (inset: DialUnits): RectDims => {
    const hw = Math.max(baseHalfWidth - inset, 0)
    const hh = Math.max(baseHalfHeight - inset, 0)
    return { hw, hh, rr: Math.max(Math.min(radius - inset, hw, hh), 0) }
  }

  /** Ray/rect intersection, then a corner-arc correction if we landed on one. */
  const trace = (angle: Degrees, inset: DialUnits) => {
    const { hw, hh, rr } = dims(inset)
    const d = polar(angle, 1)

    const tx = d.x !== 0 ? hw / Math.abs(d.x) : Number.POSITIVE_INFINITY
    const ty = d.y !== 0 ? hh / Math.abs(d.y) : Number.POSITIVE_INFINITY
    let t = Math.min(tx, ty)
    let point: Point = { x: d.x * t, y: d.y * t }

    const cornerX = hw - rr
    const cornerY = hh - rr
    const inCorner =
      rr > 0 &&
      Math.abs(point.x) > cornerX + EDGE_TOLERANCE &&
      Math.abs(point.y) > cornerY + EDGE_TOLERANCE

    if (!inCorner) return { point, centre: null as Point | null }

    // Ray/circle: |t*d - c|^2 = rr^2. Take the far root to exit through the arc.
    const centre: Point = { x: Math.sign(point.x) * cornerX, y: Math.sign(point.y) * cornerY }
    const dc = d.x * centre.x + d.y * centre.y
    const disc = dc * dc - (centre.x * centre.x + centre.y * centre.y) + rr * rr
    t = dc + Math.sqrt(Math.max(disc, 0))
    point = { x: d.x * t, y: d.y * t }

    return { point, centre: centre as Point | null }
  }

  return {
    pointAt: (angle, inset = 0) => trace(angle, inset).point,

    normalAt: (angle, inset = 0) => {
      const { point, centre } = trace(angle, inset)
      if (centre) {
        const vx = centre.x - point.x
        const vy = centre.y - point.y
        const len = Math.hypot(vx, vy) || 1
        return { x: vx / len, y: vy / len }
      }
      const { hw } = dims(inset)
      // On a vertical edge the x-extent is at its limit; otherwise horizontal.
      return Math.abs(Math.abs(point.x) - hw) < EDGE_TOLERANCE
        ? { x: -Math.sign(point.x), y: 0 }
        : { x: 0, y: -Math.sign(point.y) }
    },

    bbox: (inset = 0) => {
      const { hw, hh } = dims(inset)
      return { x: -hw, y: -hh, width: hw * 2, height: hh * 2 }
    },

    path: (inset = 0) => {
      const { hw, hh, rr } = dims(inset)
      if (rr === 0) {
        return `M ${fmt(-hw)} ${fmt(-hh)} H ${fmt(hw)} V ${fmt(hh)} H ${fmt(-hw)} Z`
      }
      const a = `A ${fmt(rr)} ${fmt(rr)} 0 0 1`
      return [
        `M ${fmt(-hw + rr)} ${fmt(-hh)}`,
        `H ${fmt(hw - rr)}`,
        `${a} ${fmt(hw)} ${fmt(-hh + rr)}`,
        `V ${fmt(hh - rr)}`,
        `${a} ${fmt(hw - rr)} ${fmt(hh)}`,
        `H ${fmt(-hw + rr)}`,
        `${a} ${fmt(-hw)} ${fmt(hh - rr)}`,
        `V ${fmt(-hh + rr)}`,
        `${a} ${fmt(-hw + rr)} ${fmt(-hh)}`,
        "Z",
      ].join(" ")
    },
  }
}
