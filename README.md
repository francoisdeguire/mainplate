# mainplate

Analog instrument faces for React. A wall clock, a speedometer and a battery
ring are the same face with different numbers in it.

```tsx
import { Clock } from "@/mainplate/faces"

export function Header() {
  return <Clock className="w-56" />
}
```

Zero props and it is finished: a Swiss-railway face, running, drawn in the ink
it inherits from the page, sized by `className`. No provider to mount, no size
prop, no measurement on mount.

> **Status: unpublished.** No npm package, no registry, no docs site — the
> import paths below are the in-repo alias. What exists is the library: the HTML
> face layer (`faces/`), the engine underneath it (`core/`), the time layer
> (`time/`), and the frozen SVG primitives (`legacy/`).

## The clock

Ten props, none required.

```tsx
<Clock second="tick" className="w-56" />
<Clock numerals="roman" ticks="quarters" className="w-56" />
<Clock timezone="Asia/Tokyo" second="none" className="w-56" />
<Clock time={new Date("2026-01-15T10:09:36Z")} timezone="UTC" className="w-56" />
```

- `second` — `"sweep"` glides, `"tick"` takes the quartz step once a second
  (animated, and it crosses :59 → :00 forwards rather than unwinding the long
  way), `"none"` omits the hand.
- `numerals` — `"arabic"`, `"roman"` (IIII, as a dial spells it), `"quarters"`,
  `"none"`. Dropping the numerals hands the ring back to the hands, which reach
  further to take it.
- `ticks` — `"all"` is the minute track with hour majors, `"quarters"` keeps
  12/3/6/9, `"none"` clears it.
- `timezone` is an IANA zone resolved through `Intl`, never a manual offset —
  DST breaks offset arithmetic twice a year.
- `time` freezes the face at an instant. It is not a clock that stopped: it
  subscribes to nothing and costs nothing per frame, which is what makes it the
  right thing for docs, tests and screenshots.
- `shape`, `color`, `label`, `unstyled`, `className`, and children — below.

Standard div attributes spread to the root, `ref` included.

## One colour in, a whole face out

```tsx
<Clock color="oklch(0.45 0.16 264)" className="w-56" />
```

The default is `currentColor`, so a face takes the ink of whatever it sits in
and a dark app's light text produces light ramps with no prop and no mode
switch. Give it a `color` and the whole palette derives from that instead — the
dial wash, the two tick ramps, the numerals, and the accent that the seconds
hand and the needle wear.

Every derivation is a CSS string, never a computed value:

```css
--mp-tick: oklch(from currentColor l c h / 0.32);
```

The browser resolves it against the ink in force at paint time, which is why
`color="var(--primary)"` follows a live theme switch. Nothing reads
`getComputedStyle`, so nothing bakes one moment's answer into the DOM.

Relative colour syntax is the baseline this asks for: Chrome 119+, Firefox
128+, Safari 16.4+. The `from currentColor` path is verified in Chrome; **it
has not been checked in Safari here** — one human minute on a face would close
that.

For a design system that would rather not argue with any of it, `unstyled`
keeps the whole structure and removes every default paint.

## The gauge

```tsx
<Gauge value={72} className="w-56" />
<Gauge value={speed} max={220} redline={[180, 220]} label="Speed" className="w-56" />
<Gauge value={64} indicator="sweep" label="Battery" className="w-56" />
```

`value` is the one required prop. A number is controlled — and changes *glide*
to the new reading, because a needle that teleports reads as a bug — while a
`Source` is live and drives its own motion at zero React renders. Under
`prefers-reduced-motion` the glide becomes instant.

`indicator="sweep"` swaps the needle for a filled band from the minimum to the
value: the progress-ring mode, same component. `redline` paints a warning band
that keeps its own hue whatever `color` says — a blue gauge with a blue redline
says nothing at all. `format` owns the readout — centred in sweep mode, sitting
in the gap below the pivot behind a needle; `false` hides it, and composing a
`<Complication>` supersedes it outright.

A gauge is a `role="meter"` with real bounds, and its reported value is clamped
into them: a needle may legitimately pin past its stop, an `aria-valuenow`
outside its own declared range is just invalid. The reading is never announced
— a meter that shouts every graduation is unusable.

Gauges are circular. The sweep fill is expressed as a dash offset over a
fixed path, which equates angle with arc length — true on a circle and on
nothing else — so a shaped gauge needs a different fill primitive before it can
exist.

## Composition

Underneath both wrappers is one context root and a set of parts that read it.
`<Clock>` and `<Gauge>` are pre-composed arrangements of exactly these:

```tsx
"use client"

import { Cap, Dial, Hand, Mainplate, Ticks } from "@/mainplate/faces"
import { useWatchSource } from "@/mainplate/time"

export function Face() {
  const clock = useWatchSource()

  return (
    <Mainplate label="A clock" className="w-56">
      <Dial />
      <Ticks />
      <Hand value={clock.hour} type="hour" />
      <Hand value={clock.minute} type="minute" />
      <Hand value={clock.second} type="second" />
      <Cap />
    </Mainplate>
  )
}
```

`<Mainplate>` establishes the shape, the box, the palette and the liveness
registry once; `<Dial>`, `<Ticks>`, `<Numerals>`, `<Hand>`, `<Cap>` and `<Arc>`
read it. Paint order is DOM order, with two structural exceptions: the hands
sit above whatever you add, and the cap sits above the hands.

**Props decide what exists; slots decide what it looks like.** Inside a
`<Clock>` or a `<Gauge>`, writing a part as a child replaces that one part and
leaves the rest alone — and the wrapper keeps supplying its reading, so this
restyles the seconds hand without re-wiring it:

```tsx
<Clock className="w-56">
  <Hand type="second" variant="line" className="opacity-70" />
</Clock>
```

There is no `classNames` object. Each part carries its own `className` and
spreads its own attributes.

### Tick tracks stack

One `<Ticks>` is one track. Two of them are two tracks, and `skip` is how the
lower one gets out of the upper one's way — the classic minute-and-hour dial,
written out:

```tsx
<Mainplate label="Minutes and hours" className="w-56">
  <Ticks count={60} skip={(v) => v % 5 === 0} />
  <Ticks count={12} emphasis="major" />
</Mainplate>
```

Which is what a bare `<Ticks/>` renders on a round face. Nothing merges
and nothing silently wins: what is written is what is drawn, in the order it is
written. A track can be populated by `count`, by a domain `every`, or by
`values` stated outright — the last is the tachymeter case, where the marks
cluster where the domain does and no even step can describe them. `render`
replaces each mark's bar while position, size and rotation stay the engine's,
so a custom mark cannot fall off its ring.

### Complications

Anything a face does beyond its hands is a `<Complication>`, and there is no
second mechanism. It has two modes. Given a position, it places content:

```tsx
<Clock ticks="quarters" numerals="none" className="w-56">
  <Complication at="12h" inset={34}>
    <span
      style={{
        fontSize: "4.2cqw",
        letterSpacing: "0.18em",
        whiteSpace: "nowrap",
        color: "var(--mp-numeral)",
      }}
    >
      MAINPLATE
    </span>
  </Complication>
</Clock>
```

Given a `size` as well, it re-establishes the whole face context at that scale —
so the same parts work inside it, unchanged, reading a new centre and a new
edge. That is a sub-dial, and a chronograph register is therefore built with
zero additional API:

```tsx
<Clock second="none" numerals="none" className="w-56">
  <Complication at="6h" inset={36} size={52}>
    <Ticks count={12} length={9} width={3.5} emphasis="major" />
    <Hand value={clock.second} variant="line" long style={{ background: "var(--mp-accent)" }} />
    <Cap />
  </Complication>
</Clock>
```

`size` is the register's diameter in the parent's dial units — `52` spans 52
units of the face it sits on, the way anyone eyeballs one.

### Arcs

Strokes are the one thing HTML cannot draw, so `<Arc>` is the exception: every
arc on a face is hoisted onto a single embedded `<svg>` layer, wherever the
first of them was written. A clock never grows one.

```tsx
<Mainplate label="One minute elapsed" className="w-56">
  <Arc from={0} to={100} width={4} />
  <Arc from={0} to={elapsed} width={4} stroke="var(--mp-accent)" />
  <Ticks count={12} inset={18} length={5} width={1.4} />
</Mainplate>
```

`from` and `to` take domain values or `Source`s. The ring above sweeps a whole
minute at zero React commits, and a `<Gauge>`'s own track, redline and fill are
three of these on that same layer.

## Shape — where the frame and the outline come apart

```tsx
<Clock shape={{ ratio: 0.82, radius: 30 }} numerals="none" className="w-72" />
```

Most circular-UI libraries have one concept where there are really two.

- The **frame** is the angular coordinate system. Given a value, what angle?
- The **outline** is the closed path marks sit on. Given an angle, where is the
  edge?

On a round watch these coincide, so collapsing them into one costs nothing —
which is why almost every library does. On a Cartier Tank they do not, and that
is the reason no existing library can draw a railway minute track on a
rectangle. Separating them is the whole point, it lives in the engine, and
tier 1 charges one prop for it.

So the rounded-rect face above is not a circle with its corners pushed out. The
twelve hour bars stand on their **frame rays**, which is what keeps a hand
pointing at a value pointing at that value's mark. Each one is the span between
two parallel insets measured along its own ray, so the oblique bars come out
visibly longer — the gap widens by 1/cos θ off the cardinals — while their inner
ends still describe one uniform ring, and a matching width correction keeps them
from reading thinner. The minute track instead divides the **outline's own
length** evenly, which is the chemin-de-fer rhythm and what no angular walk can
give a non-circle. Both rhythms are the `placement` prop on `<Ticks>`; that pair
is what a bare `<Ticks/>` renders once the face has corners. The dial takes the
shape's own corner radius.

Those are claims, so they are test files rather than assertions:
`src/mainplate/faces/shape.test.tsx` pins the uniform ring (its named mutation —
radial spans swapped for edge normals — reds it while every circle test stays
green), and `src/mainplate/legacy/thesis.test.tsx` is the original statement of
the split.

## How it works

`@/mainplate/core` is React-free apart from one hook, and is what every layer
above is made of:

- **Geometry** — `polar`, `valueToAngle`/`angleToValue`, `quantize`/`fmt` (the
  4dp quantiser every number crossing the hydration boundary goes through),
  `epsilonFor`.
- **Outlines** — `circleOutline`, `rectOutline`, `resolveOutline`. An `Outline`
  answers angle→point, length→point and outward-normal-at-length, and draws its
  own path at any inset.
- **`Source`** — `createSource`, `useSourceValue`. A tiny subscribable with an
  optional domain; the seam every live value crosses.
- **Positioning** — `resolveAt` (angles, clock positions like `"9h"`, literal
  points), `frameBox` and `dialPercent`, `arcPath`.
- **Ticks** — `populate` and `resolveTicks`, the population pipeline behind
  `count`/`every`/`values` with `skip`.

The faces layer adds one geometry module over it with four verbs — **place**,
**orient**, **span**, **arc** — and a single `markTransform()` that turns any
placement into `{left, top, width, height, rotate}` with quantisation built in.
No component assembles a transform by hand, so the hydration rule is enforced in
one place.

Three things follow from the parts being ordinary HTML:

**Sizing is CSS.** The root is an inline-size container carrying the outline's
aspect ratio and all internal geometry is `cqw`, so `className="w-56"` or
`w-full` sizes the face. No size prop, no `ResizeObserver`, responsive for free.

**Live values never re-render.** A hand subscribes to its `Source` and writes
`rotate` through a ref; the gauge's fill writes one dash offset. The lab's
chronograph carries five live hands off three engines, and costs one React
commit and one rAF while every one of them moves.

**Faces cost DOM nodes.** Measured: 78 elements for a bare `<Clock/>`, 28 for a
bare `<Gauge value={72}/>`, 139 for that chronograph — two registers, a
tachymeter and a date window. Fine for the faces a page actually shows. Twenty
live faces at once is still a job for the SVG primitives.

## Time

A stopwatch is just a `Source` someone writes; nothing in the library has to
know about it. The wall clock is the packaged case: `useWatchSource()` serves
`hour`, `hour24`, `minute`, `second` and `ms` as five stable `Source`s, each
carrying its own domain — which is why a hand reading `hour24` needs no
`max={24}`. The source already knows, and `source.domain` beats the hand's own
preset.

What none of the props show:

- **One engine per page.** Every `useWatchSource` shares one rAF loop through a
  lazy singleton ticker — twenty live faces cost one frame callback.
- **`second="tick"` really sleeps.** Cadence is a scheduler concern, not a hand
  prop, because only the scheduler can turn "once a second" into actually
  sleeping between boundaries: a tick-only face runs zero rAF and one timer per
  second.
- **Offscreen faces let go.** Each face watches itself with an
  `IntersectionObserver` and releases its sources when it scrolls away,
  resyncing to elapsed real time when it comes back — never a replay of the
  backlog. A hidden tab parks the engine the same way. This is automatic and
  applies to any `Source`, not only the clock.
- **Reduced motion degrades, never freezes.** Under `prefers-reduced-motion`
  every gliding hand steps once per second instead of sweeping. A stopped clock
  is a bug, not an accommodation.
- **SSR is deterministic by construction.** No live reading reaches server HTML
  — hands render their pivot translation and nothing else, and the binder writes
  the real angle after hydration. Two server renders a second apart are
  byte-identical, so there is nothing for hydration to mismatch.

## Accessibility

A face is `role="img"` with a `label`, which makes every part inside
presentational — no part needs `aria-hidden` of its own, and the label is the
face's whole accessible surface. A gauge is `role="meter"` with clamped bounds
instead. The time is never put in an ARIA string: an announced clock is a
screen-reader trap, and a live region on a seconds hand is worse.

## Conventions

- **0° is twelve o'clock, and positive is clockwise.**
- **Dial units.** The nominal radius is 100 and the origin is the frame centre.
  On a non-circular outline, 100 is half the *minor* axis.
- Angles are always degrees. Never radians.
- Nothing is measured in pixels — sizing is the app's job, through CSS.
- `value` is always a domain value; `at` is always a position. A mark's value is
  never falsified for aesthetics — move its `at` instead.
- `inset` is distance inward from the outline, so it follows the shape.

## The frozen SVG layer

`@/mainplate/legacy` is the SVG primitive set the earlier plans built — tested,
kept as the escape hatch under the face layer, and closed to new work.

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
the layering: `core/` imports nothing above it, not even `time/`; neither
`core/` nor `time/` may import `faces/` or `legacy/`; and `legacy/`, being
frozen, builds on `core/` alone.

## Licence

MIT
