# mainplate

Declarative React primitives for analog instrument faces. A speedometer, a
clock, and a power reserve indicator are the same component with different
numbers in it.

> **Status: core primitives, not published.** What exists is the geometry, the
> frame, the outlines, and the full primitive set — `<Dial>`, `<Ticks>`,
> `<Numerals>`, `<Hand>`, `<Arc>`, `<Subdial>`, `<Place>`. The time layer
> (`useWatchSource`, motion modes) and the packaged examples do not exist yet.
> There is no package on npm; the import path below is the in-repo alias.

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

## The primitives

- **`<Mainplate>`** — the root `<svg>`: establishes the frame (domain, sweep,
  outline) every other primitive reads from context.
- **`<Dial>`** — the surface: the outline's own shape, filled. Fill-only by
  type; a stroked ring is a full-sweep `<Arc>`.
- **`<Ticks>`** — the marks: populated by `count`, an explicit `ticks` array,
  or multi-track `tiers`, merged into as few `<path>` nodes as the paint allows.
- **`<Numerals>`** — the numbers: same population pipeline as `<Ticks>`, plus
  a clearance solver — `track` + `clearance` place each label so its optical
  ink holds the same shortest distance from the tick track, whatever the
  label's width or angle.
- **`<Hand>`** — the pointer. `value` takes a number (controlled, pure) or a
  `Source` (live: the hand subscribes and writes `style.rotate` through a ref,
  zero React renders per update). Local `min`/`max`/`startAngle`/`sweepAngle`
  override the frame per hand — a clock is three hands with three domains.
- **`<Arc>`** — the library's only stroked path: bezels, rails, redlines, gauge
  fills. `from`/`to` are domain values or `Source`s; `r` draws a circle,
  `inset` traces the outline's own shape.
- **`<Subdial>`** — a dial inside a dial: re-establishes the frame at a scaled
  origin, so every primitive works inside it unchanged with its own domain.
- **`<Place>`** — the escape hatch: arbitrary SVG children positioned at an
  angle, a clock position (`at="9h"`), or a point.

A complete face, trimmed from the working chronograph at
`www/app/lab/face/page.tsx` (run it with `bun run dev`, then `/lab/face`):

```tsx
"use client"

import { Arc, createSource, Dial, Hand, Mainplate, Numerals, Place, Subdial, Ticks } from "@/mainplate/core"

const elapsed = createSource(0, { min: 0, max: 60 })

export function Chronograph() {
  return (
    <Mainplate size={360} max={60} label="Chronograph">
      <Dial fill="oklch(0.21 0.006 285)" />

      <Ticks
        inset={4}
        align="inside"
        tiers={[
          { every: 1, length: 4, width: 0.8 },
          { every: 5, length: 10, width: 2.2 },
        ]}
      />

      {/* Each label's ink holds exactly 3 dial units from the tick track. */}
      <Numerals tiers={[{ every: 5 }]} from={5} to={60} track={{ r: 86, width: 2.2 }} clearance={3} fontSize={10} />

      {/* A static track, and a live fill whose end tracks the source. */}
      <Arc inset={1.5} strokeWidth={1.2} stroke="oklch(0.34 0.008 285)" />
      <Arc from={0} to={elapsed} inset={1.5} strokeWidth={1.2} stroke="oklch(0.8 0.13 78)" />

      <Subdial at="9h" inset={50} r={26} min={0} max={60} label="Running seconds">
        <Dial fill="oklch(0.13 0.005 285)" />
        <Ticks count={12} inset={5} length={9} width={2} align="inside" />
        <Hand value={42} length={80} tail={16} width={5} />
      </Subdial>

      <Place at="12h" inset={38}>
        <text fontSize={8.5} textAnchor="middle" dominantBaseline="central">
          mainplate
        </text>
      </Place>

      {/* The hour hand overrides the 0–60 frame locally; the chrono hand is live. */}
      <Hand value={10.85} max={12} length={50} tail={10} width={7} />
      <Hand value={51} length={76} tail={12} width={5} />
      <Hand value={elapsed} length={92} tail={22} width={1.8} fill="oklch(0.8 0.13 78)" />
    </Mainplate>
  )
}
```

## Theming, Tailwind, and dial units

Every primitive's paint defaults to `"currentColor"`, and `color` inherits
through SVG — so a single `color` on an ancestor themes an entire face:

```tsx
<div className="text-cyan-500">
  <Chronograph /> {/* every default-painted mark is now cyan */}
</div>
```

The one exception is `<Arc>`: it is the library's only stroked primitive, so
its themed paint is `stroke` (also defaulting to `currentColor`), and `fill`
is a compile error — SVG fills an open path as if closed by its chord, so a
"filled" arc would silently paint a chord segment.

One thing to know before reaching for Tailwind inside a face: within the
viewBox, a CSS `px` resolves to **one user unit, which is one dial unit** —
not one screen pixel. So `stroke-2` means 2% of the dial radius, and `text-sm`
means 14 dial units, whatever size the face renders at. That makes Tailwind's
**colour** utilities the right tool (they are unit-free) and its sizing scales
the wrong one — geometry belongs in props, which are dial units on purpose.

## HTML on a face

HTML does not go inside the SVG. The supported pattern is **layer
composition**: stacked absolutely-positioned `<Mainplate>` roots with ordinary
HTML between them in one `position: relative` container, so paint order is DOM
order — background face below, HTML in the middle, hands above. The HTML layer
is a sibling of the face and cannot call `useFrame()`, so `dialPercent` maps a
dial point to CSS `left`/`top` percentages, and `frameBox` gives the container
the face's aspect ratio. Pass them the same `outline`/`padding`/`clip` the
faces get, and the layers cannot disagree about geometry.

```tsx
const FACE = { outline: OUTLINE, clip: false, padding: 12 }

<div className="relative">
  <Mainplate {...FACE} size={320} className="absolute top-0 left-0">…</Mainplate>

  <div className="absolute inset-0">
    <Chip
      style={{
        position: "absolute",
        transform: "translate(-50%, -50%)",
        ...dialPercent(polar(45, 66), FACE),
      }}
    />
  </div>

  <Mainplate {...FACE} size={320} className="absolute top-0 left-0">
    <Hand value={45} />
  </Mainplate>
</div>
```

The working demo is `/lab/layers`. One caveat that matters on a real face: an
upper `<svg>` root is hit-testable across its **whole box**, not just where it
draws, so any layer above the one that handles input needs
`pointer-events-none` or it swallows every click.

Why not `<foreignObject>`: WebKit bug 23113 displaces any HTML inside it that
uses `position`, `transform`, `opacity < 1`, or a filter — which is most
components worth dropping on a dial. The findings and a working recipe are on
file in `fixtures/README.md` in case a future example genuinely needs it.

## Conventions

- **0° is twelve o'clock, and positive is clockwise.**
- **Dial units.** The nominal radius is 100 and the origin is the frame centre.
  On a non-circular outline, 100 is half the *minor* axis, so a Tank at
  `ratio: 0.78` is 200 dial units wide and about 256 tall.
- Angles are always degrees. Never radians.
- Nothing is measured in pixels. `size` is the one exception, because something
  eventually has to be.
- `value` is always a domain value; `at` is always a position. A mark's value
  is never falsified for aesthetics — nudge its `at` instead.
- `r` is frame-anchored (a circle, whatever the outline); `inset` is
  outline-anchored (follows the shape). Every primitive takes exactly one.

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
