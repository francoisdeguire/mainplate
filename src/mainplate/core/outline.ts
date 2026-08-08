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
