# mainplate

Declarative React primitives for analog instrument faces. A speedometer, a
clock, and a power reserve indicator are the same component with different
numbers in it.

> **Status: foundation only, and not published.** What exists is the geometry,
> the frame, the outlines, the tick pipeline, and `<Ticks>`. Hands, numerals,
> arcs, subdials, and the time layer do not exist yet. There is no package on
> npm; the import path below is the in-repo alias.

## The idea

Most circular-UI libraries have one concept where there are really two.

- The **frame** is the angular coordinate system. Given a value, what angle?
- The **outline** is the closed path marks sit on. Given an angle, where is the
  edge?

On a round watch these coincide, so collapsing them into one costs nothing —
which is why almost every library does. On a Cartier Tank they do not, and that
is the reason no existing library can draw a railway minute track on a
rectangle. Separating them is the whole point of this library.

```tsx
import { Mainplate, Ticks } from "@/mainplate/core"

const TANK = { kind: "rect", ratio: 0.78, radius: 12 } as const

export default function Face() {
  return (
    <Mainplate size={260} max={60} outline={TANK}>
      <Ticks count={60} inset={9} length={6} width={0.6} orient="edge" align="inside" />
    </Mainplate>
  )
}
```

Position comes from the frame, so the mark at 15 is still straight right, exactly
where it would be on a circle. Orientation comes from the outline, so every mark
stands perpendicular to the edge it sits on rather than pointing at the centre.
Their spacing along the perimeter is therefore uneven, which is correct — the
angles are evenly spaced, the perimeter is not.

That claim is a test file rather than an assertion:
`src/mainplate/core/thesis.test.tsx` pins uneven perimeter spacing, preserved
angular correspondence, edge-perpendicular orientation, `edge` and `radial`
diverging on a rectangle and converging on a circle, and the resulting path data.

The `outline` above is a plain object because an `Outline` is made of closures,
and functions cannot cross the React Server Component boundary. Descriptors and
the string forms `"circle"` and `"rect"` work anywhere; `circleOutline()` and
`rectOutline()` build the real thing once you are inside `"use client"`.

## Conventions

- **0° is twelve o'clock, and positive is clockwise.**
- **Dial units.** The nominal radius is 100 and the origin is the frame centre.
  On a non-circular outline, 100 is half the *minor* axis, so a Tank at
  `ratio: 0.78` is 200 dial units wide and about 256 tall.
- Angles are always degrees. Never radians.
- Nothing is measured in pixels. `size` is the one exception, because something
  eventually has to be.

## Name

In horology the *mainplate* is the base plate every other component of a
movement mounts onto. Same idea here: the substrate a face is built on.

## Development

```bash
bun install
bun run dev     # dev harness at localhost:3000/lab
bun run check   # typecheck, www typecheck, lint, boundary check, tests
```

`bun run check` chains the same five steps CI runs. The boundary check enforces
the one structural rule the library has so far: nothing in `core/` may import
from `time/`.

## Licence

MIT
