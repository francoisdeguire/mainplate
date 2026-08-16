# mainplate

Analog instrument faces for React. A speedometer, a clock, and a power reserve
indicator are the same component with different numbers in it.

> **Status: mid-pivot — not published, nothing to install.**
>
> - **The engine is stable.** Geometry, outlines, the frame/outline split,
>   `Source`, the `at` vocabulary, the tick population pipeline, and the layer
>   helpers live in `src/mainplate/core/`. This is the part whose bugs are
>   already paid for.
> - **The time layer is stable.** `src/mainplate/time/` — `useWatchSource`,
>   glide/tick cadence, one shared ticker, reduced-motion and offscreen
>   handling.
> - **The SVG component layer is frozen.** `<Mainplate>`, `<Dial>`, `<Ticks>`,
>   `<Numerals>`, `<Hand>`, `<Arc>`, `<Subdial>` and `<Place>` moved to
>   `src/mainplate/legacy/`. They work and they are tested; they are no longer
>   the product and are not developed further.
> - **The HTML face layer is being built.** `<Clock>` and `<Gauge>` as
>   HTML-first components — one line to add, finished-looking with zero props,
>   themed by the app's own CSS. Direction in
>   `.planning/simple-layer-direction.md`. Nothing of it exists yet.
>
> There is no package on npm, no docs site and no registry. Import paths below
> are the in-repo alias.

## The idea

Most circular-UI libraries have one concept where there are really two.

- The **frame** is the angular coordinate system. Given a value, what angle?
- The **outline** is the closed path marks sit on. Given an angle, where is the
  edge?

On a round watch these coincide, so collapsing them into one costs nothing —
which is why almost every library does. On a Cartier Tank they do not, and that
is the reason no existing library can draw a railway minute track on a
rectangle. Separating them is the whole point of this library, and it belongs to
the engine — it survives the pivot unchanged.

```tsx
import { Mainplate, Ticks } from "@/mainplate/legacy"

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
`src/mainplate/legacy/thesis.test.tsx` pins uneven perimeter spacing, preserved
angular correspondence, edge-perpendicular orientation, `edge` and `radial`
diverging on a rectangle and converging on a circle, and the resulting path data.

The `outline` above is a plain object because an `Outline` is made of closures,
and functions cannot cross the React Server Component boundary. Descriptors and
the string forms `"circle"` and `"rect"` work anywhere; `circleOutline()` and
`rectOutline()` build the real thing once you are inside `"use client"`.

## The engine

`@/mainplate/core` is React-free apart from one hook, and is what both the
frozen SVG layer and the coming HTML layer are made of:

- **Geometry** — `polar`, `valueToAngle`/`angleToValue`, `quantize`/`fmt` (the
  4dp quantiser every number crossing the hydration boundary goes through),
  `epsilonFor`.
- **Outlines** — `circleOutline`, `rectOutline`, `resolveOutline`. An `Outline`
  answers angle→point, length→point, and draws its own path at any inset.
- **`Source`** — `createSource`, `useSourceValue`. A tiny subscribable with an
  optional domain; the seam every live value crosses.
- **Positioning** — `resolveAt` (angles, clock positions like `"9h"`, literal
  points), `frameBox` and `dialPercent` for mapping a dial point onto a box in
  CSS percentages, `arcPath` for arc path data on either anchor.
- **Ticks** — `populate` and `resolveTicks`, the count/`ticks`/`tiers`
  population pipeline with `skip` and per-tick prop callbacks.

## The frozen SVG layer

`@/mainplate/legacy` is the primitive set the first three plans built. It is
complete and tested, it may import `core/` and nothing else, and it is kept as
the escape hatch under the face layer — but it is closed to new work.

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
- **`<Arc>`** — the only stroked primitive: bezels, rails, redlines, gauge
  fills. `from`/`to` are domain values or `Source`s; `r` draws a circle,
  `inset` traces the outline's own shape.
- **`<Subdial>`** — a dial inside a dial: re-establishes the frame at a scaled
  origin, so every primitive works inside it unchanged with its own domain.
- **`<Place>`** — the escape hatch: arbitrary SVG children positioned at an
  angle, a clock position (`at="9h"`), or a point.

One rule these lean on: **paint order is document order, and a subdial's well is
opaque** — a `<Subdial>` paints over anything rendered before it, and nothing
warns, because the library has no layout engine. Chapter-ring numerals that land
under a register render half-hidden; `skip` (domain values or a predicate) is
what omits them.

## Time

A stopwatch is just a `Source` someone writes; nothing in the library has to
know about it. The wall clock is the packaged case: `useWatchSource()` serves
`hour`, `hour24`, `minute`, `second`, `ms` as five stable `Source`s, each
carrying its own domain — which is why the hour hand below needs no `max={12}`;
the source already knows. This component was run exactly as written (Chrome,
hands checked against the wall clock; it renders once and never again while the
clock runs):

```tsx
"use client"

import { Hand, Mainplate, Ticks } from "@/mainplate/legacy"
import { useWatchSource } from "@/mainplate/time"

export function Clock() {
  // Five Sources and an observe ref, created once — this component renders
  // once, and the hands move outside React from then on.
  const clock = useWatchSource({ second: "tick" })

  return (
    <Mainplate ref={clock.observe} size={220} min={0} max={60} label="A clock">
      <Ticks count={12} inset={4} length={8} width={2} />
      <Hand value={clock.hour} length={50} width={7} />
      <Hand value={clock.minute} length={76} width={5} />
      <Hand value={clock.second} length={88} tail={18} width={1.5} />
    </Mainplate>
  )
}
```

What the props don't show:

- **One engine per page.** Every `useWatchSource` shares one rAF loop through
  a lazy singleton ticker — twenty live faces cost one frame callback, not
  twenty.
- **`{ second: "tick" }` is the quartz step.** Cadence is a source option
  rather than a hand prop because only the scheduler can turn "once a second"
  into actually sleeping between boundaries — a tick-only face runs zero rAF
  and one timer per second. The default is `"glide"`, the sweep.
- **`ref={clock.observe}` is opt-in offscreen pausing.** Scrolled out of the
  viewport, this face releases the shared engine and resyncs to elapsed real
  time when it scrolls back — never a replay of the backlog. A hidden tab
  parks the engine the same way. Leave the ref off and the clock simply runs
  whenever the page is visible.
- **Reduced motion degrades, never freezes.** Under `prefers-reduced-motion`
  every glide hand steps once per second instead of sweeping. A stopped clock
  is a bug, not an accommodation.
- **On the server every field reads 10:09:36** — the time in every watch
  advertisement — so SSR output is deterministic and hydration never flakes.
- **`timezone` is an IANA zone resolved through `Intl`**, never a manual
  offset: DST breaks offset arithmetic twice a year.

## Theming, Tailwind, and dial units

Every frozen primitive's paint defaults to `"currentColor"`, and `color`
inherits through SVG — so a single `color` on an ancestor themes an entire face:

```tsx
<div className="text-cyan-500">
  <Face /> {/* every default-painted mark is now cyan */}
</div>
```

The one exception is `<Arc>`: it is the only stroked primitive, so its themed
paint is `stroke` (also defaulting to `currentColor`), and `fill` is a compile
error — SVG fills an open path as if closed by its chord, so a "filled" arc
would silently paint a chord segment.

One thing to know before reaching for Tailwind inside a face: within the
viewBox, a CSS `px` resolves to **one user unit, which is one dial unit** —
not one screen pixel. So `stroke-2` means 2% of the dial radius, and `text-sm`
means 14 dial units, whatever size the face renders at. That makes Tailwind's
**colour** utilities the right tool (they are unit-free) and its sizing scales
the wrong one — geometry belongs in props, which are dial units on purpose.

## HTML on a face

HTML does not go inside the SVG. With the frozen layer the supported pattern is
**layer composition**: stacked absolutely-positioned `<Mainplate>` roots with
ordinary HTML between them in one `position: relative` container, so paint order
is DOM order — background face below, HTML in the middle, hands above. The HTML
layer is a sibling of the face and cannot call `useFrame()`, so `dialPercent`
maps a dial point to CSS `left`/`top` percentages, and `frameBox` gives the
container the face's aspect ratio. Pass them the same
`outline`/`padding`/`clip` the faces get, and the layers cannot disagree about
geometry.

One caveat that matters on a real face: an upper `<svg>` root is hit-testable
across its **whole box**, not just where it draws, so any layer above the one
that handles input needs `pointer-events-none` or it swallows every click.

Why not `<foreignObject>`: WebKit bug 23113 displaces any HTML inside it that
uses `position`, `transform`, `opacity < 1`, or a filter — which is most
components worth dropping on a dial. The findings and a working recipe are on
file in `fixtures/README.md`.

That whole seam is the reason for the pivot: the face layer being built renders
HTML directly and drops the SVG for everything except the arcs.

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
  outline-anchored (follows the shape). Every primitive that anchors this way
  takes exactly one — the two exceptions are `<Subdial>`, whose `r` is its
  *size* in parent units, and `<Hand>`, which pivots at the centre and takes
  neither.

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
the layering: nothing in `core/` may import from `time/`; neither `core/` nor
`time/` may import the layers built on them (`faces/`, `legacy/`); and `legacy/`,
being frozen, may import `core/` alone.

## Licence

MIT
