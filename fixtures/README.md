# Fixtures

## transform.html — the rotation recipe

Open this file directly in a browser. Each of the four cases must match its
caption. Case D is the decisive one: two hands at 45 degrees, one with a tail so
their bounding boxes differ, must be perfectly collinear. If they diverge,
`transform-box` is resolving against each element's own bounding box and the
recipe below is wrong.

The recipe is three nested groups:

1. `<g transform="translate(cx cy)">` — position. Static, so the SVG attribute is
   correct and cheapest here.
2. `<g style="rotate: Ndeg; transform-box: view-box; transform-origin: 0 0">` —
   rotation. The only animated node.
3. `<g transform="translate(-pivotX -pivotY)">` — pivot correction. Static.

`transform-box` and `transform-origin` are always written explicitly. The
defaults differ between SVG and HTML, they changed between Transforms Level 1
and Level 2, and `fill-box` would resolve against each element's own bounding
box — which is what case D exists to catch.

### Status

**Verified.** All four cases pass in all three browsers. The CSS rotate recipe ships.

| Browser | Version | A | B | C | D |
| --- | --- | --- | --- | --- | --- |
| Chrome | 151.0.7922.77 | pass | pass | pass | pass |
| Safari | 26.5.2 | pass | pass | pass | pass |
| Firefox | 153.0.3 | pass | pass | pass | pass |

Chrome was checked numerically rather than by eye, via `getScreenCTM()`:

| Case | Measurement | Result |
| --- | --- | --- |
| A | tip offset from pivot | dx +81.818, dy 0 — due east |
| B | hand pivot vs subdial centre | 0 px apart |
| C | bar midpoint vs centre dot | 0 px apart |
| D | pivot separation; angle between | 0 px; sin 0 — screen CTMs identical |

Case D is the one that matters. The two rects have bounding-box heights of 90
and 115, and their screen CTMs are byte-identical, so `transform-box: view-box`
is demonstrably not resolving against either element's own box.

If any case fails, the recipe is rejected in favour of the SVG
`transform="rotate(N)"` attribute — unambiguous everywhere, but it forfeits
compositor promotion. Correctness beats a frame of GPU time.

Re-run this fixture whenever a browser ships a major version.

## foreign-object.html — HTML inside the SVG

Open this file directly in a browser. The header carries a build marker; if it does
not read `BUILD 5`, hard-reload before reading anything.

### Status: the feature this tested was cut

`asHTML` — arbitrary consumer HTML rendered inside the SVG through
`<foreignObject>` — is **not being built**. The fixture and this section are a
record of what was found, not a specification. Nothing implements from them.

A recipe that works does exist and is written out below in enough detail to reuse.
It was cut on value, not only on the Safari bug:

- Web fonts, OpenType features, variable fonts, `letter-spacing` and tabular figures
  all already work in SVG `<text>`. That is most of what HTML-in-SVG was assumed to buy.
- Icons work as nested `<svg>`. Multi-line dial text is two to four short authored
  lines, which `<tspan>` handles well; automatic wrapping is a liability on a dial
  rather than a feature.
- What remained was dropping arbitrary consumer components onto a face — precisely
  the case WebKit bug 23113 cripples, since any consumer component using `position`,
  `transform`, `opacity < 1` or a filter is displaced off the dial in Safari. The
  restriction lands hardest on the only use case that justified the feature.

**The supported alternative is layer composition outside the SVG.** Stack
absolutely-positioned `<Mainplate>` roots in a shared `position: relative` container
with HTML between them: background face below, HTML in the middle, hands above. That
recovers paint-order interleaving at layer granularity, with no Safari restrictions,
exact font sizes and unrestricted consumer CSS. Layer granularity is the right
granularity for a dial.

### The rule: anything that gets a RenderLayer leaves the dial

[WebKit bug 23113](https://bugs.webkit.org/show_bug.cgi?id=23113), filed 2009-01-04
and still open. In Safari, a descendant of a `<foreignObject>` that acquires a
**RenderLayer** is parented into the SVG root's layer rather than the
foreignObject's, so no SVG transform — neither the foreignObject's own placement nor
the viewBox CTM — ever reaches it. The content lands at the SVG root's border-box
origin plus the foreignObject's raw `x`/`y` read as CSS pixels. At user-unit
coordinates that is far off-dial, not subtly wrong. Loss of clipping is the same
symptom, not a second bug: content painted outside the foreignObject is no longer
inside it to be clipped.

The forbidden-property list this generates, for anything inside a `<foreignObject>`:

`position` other than `static` · `transform` / `translate` / `rotate` / `scale` ·
`opacity < 1` · `filter` / `backdrop-filter` · `will-change` · `perspective` ·
`mix-blend-mode` / `isolation` · `transition` · `backface-visibility`

Our fixture verifies `position` (M1), `transform` (M4) and `opacity` (S) directly;
the rest follow from the trigger class bug 23113 names. The last two come from
[react-d3-tree #284](https://github.com/bkrem/react-d3-tree/issues/284), which on
Safari strips `position`, `transform`, `transition`, `transform-style` and
`backface-visibility` from its foreignObject content — independent confirmation of
the same rule from a library that hit it in production.

**Panel S is why this is a rule and not a story fitted to past data.** It was written
as a prediction before the Safari pass: bug 23113 says the trigger is "acquires a
RenderLayer", so `opacity: .5` alone — nothing positioned, nothing scaled — must be
displaced exactly as `position` and `transform` were. Safari displaced it. Chrome
renders it correctly — per the bug page, Chrome fixed its copy in Chrome 87 (2020).

SVG 2 says Safari is wrong: the foreignObject rectangle
"defines the bounds of a containing block", and its scale is defined
"in the current coordinate system, including all explicit and implicit (e.g.
'viewBox') transformations"
([spec](https://svgwg.org/svg2-draft/embedded.html#ForeignObjectElement)). The real
fix is LBSE, WebKit's layer-based SVG engine, which has landed but is not the default
and has no shipping date. Nothing should be planned around it.

### The recipe that works

No layers anywhere. Position with SVG attributes, size with `zoom`, centre with grid.

For an item `w × h` **consumer px** centred at `(cx, cy)` **user units**, with
`k = viewBoxSpan / renderedPx` (here `220/320 = 0.6875`):

```html
<foreignObject x={cx - w*k/2} y={cy - h*k/2} width={w*k} height={h*k}>
  <div xmlns="http://www.w3.org/1999/xhtml"
       style="zoom: 0.6875; width: {w}px; height: {h}px;
              display: grid; place-items: center">
    <!-- consumer content, authored in real px, in their own stylesheet -->
  </div>
</foreignObject>
```

- **Positioning** is the foreignObject's `x`/`y` attributes. No CSS positioning is
  involved, so nothing gets a layer.
- **Sizing** is `zoom` on a static wrapper. `zoom` scales layout at used-value time
  and creates no RenderLayer, which is the whole reason the recipe is built on it.
  Because it applies after the cascade, it cancels the viewBox magnification for the
  **consumer's own stylesheet** too — a counter-scaling `transform` cannot do that,
  and neither can pre-dividing the values the library emits.
- **Centring** intrinsic content is `display: grid; place-items: center`. Static,
  no layer. Verified in Safari as panel Q2.
- `k` comes from the viewBox and the `width`/`height` attributes the library already
  requires. Static, SSR-safe, no measurement step.
- Per-item foreignObjects also contain the pointer-events problem: each covers only
  its own item's box. A full-frame wrapper (panel T) swallows pointer events over the
  whole dial and would need `pointer-events: none` on the wrapper with re-enabling on
  the content.
- Resizing the SVG by CSS breaks the size contract — `k` is computed from the
  attributes, so `13px` stops meaning 13 real px. True of every recipe considered.

Panel T is a working fallback: one full-frame foreignObject, `display: grid`, every
item at `grid-area: 1/1; place-self: start` with margins in real px. Same-cell grid
children overlap without positioning. It shares the whole-dial pointer-events problem.

### What was verified, and where

Nine panels. Chrome was measured numerically through the browser extension; Safari
was checked panel by panel by the human partner across four builds. `fail` on M1, M4
and S is the expected result — those panels exist to fail.

| Panel | What it is | Chrome | Safari | Firefox |
| --- | --- | --- | --- | --- |
| Q1 | per-item foreignObject + `zoom`, static flow | pass | pass | not verified |
| Q2 | Q1 + `display: grid` centring | pass | pass | not verified |
| T | full-frame foreignObject, same-cell grid | pass | pass | not verified |
| R | consumer stylesheet units under the zoom | pass | **partial** — see the lattice below | not verified |
| H | baseline: plain static div, no layer | pass | pass | not verified |
| M1 | H + `position: relative` | pass | fail (expected) | not verified |
| M4 | H + `transform: scale(.6875)` | pass | fail (expected) | not verified |
| M5 | H + `zoom: .6875` | pass | pass | not verified |
| S | H + `opacity: .5` (prediction) | pass | fail (predicted) | not verified |

Versions: Chrome **150.0.7871.129** on macOS, `devicePixelRatio` 2, page zoom 1 —
read from the running browser, not the app bundle. Safari version **not reported**;
the pass was made on this machine on 2026-08-08 against a Safari 26.x-era build.

Chrome numbers, measured rather than eyeballed:

| Panel | Measurement |
| --- | --- |
| Q1 | rings 11.000 px, worst centre offset 0.00004 px; text 13.000 px vs a 13.000 px SVG ruler, top and bottom deltas 0 |
| Q2 | rings 11.000 px, offsets ≤ 0.00004 px |
| T | ring dx/dy 0.0000; text flush with the ruler |
| R | all four bars 13.000 real px — `13px`, `0.8125rem`, `1em` and a `font-size:13px` class |
| H, M1, M4, M5 | green div's client rect vs the dashed target: 160.000 × 128.000 against 160.000 × 128.000, all four edge deltas 0 |
| S | fills the target, deltas 0 |

These figures were taken on the pages the panels were drawn from — the round-4 ladder
and the candidate page — before they were consolidated into `BUILD 5`. `BUILD 5` was
not itself re-measured in Chrome.

**Firefox has never seen any of these panels.** It was shown only the `BUILD 2`
page, whose panels were the counter-scale recipe and its three scaling variants;
those passed. It has not been shown the bisection ladder, the diagnostic, or the
recipe that works. Firefox has no equivalent layer bug and has shipped `zoom` since
126, so the expectation is that everything passes — but that is an expectation, not a
result, and nothing here rests on it. Since nothing ships from this record, the gap
was left honest rather than filled by inference from Chrome.

### The font lattice — Safari only, and not caused by `zoom`

Panel R is partial in Safari. Box lengths are exact: `height: 13px` and
`height: 0.8125rem` from a consumer stylesheet render at exactly 13 real px.
**Font-derived** lengths do not: at `k = 0.6875` and a drawn size of 320 px, a
consumer's `1em` box renders **13.09** real px and a `font-size: 13px` text block's
line box renders **11.64** real px, against a 13 real px target.

Two different WebKit rounding behaviours, neither of them zoom-specific:

- **Font sizes round to nearest.**
  [WebKit bug 46987](https://bugs.webkit.org/show_bug.cgi?id=46987) —
  `FontDescription::computedPixelSize()` is `unsigned(m_computedSize + 0.5f)`, done
  for cache hit rates. `13 × 0.6875 = 8.9375`, `round → 9`, `9 / 0.6875 = 13.09`.
  Marked RESOLVED FIXED in 2023, but Safari 26.x measurably still quantises this
  path.
- **Fractional line-heights floor.**
  [WebKit bug 225695](https://bugs.webkit.org/show_bug.cgi?id=225695) — open,
  unassigned. `floor(8.9375) = 8`, `8 / 0.6875 = 11.64`.

Both arithmetic results reproduce the measurements exactly. Chrome quantises neither:
all four R bars measured 13.000 real px there.

**This is not a cost of `zoom`.** Both bugs are about fractional CSS pixels in
general. The alternative recipe — the library pre-dividing every value it emits and
writing `font-size: 8.9375px` directly — lands on the identical lattice. Anything
that maps 13 real px onto 8.9375 CSS px does. The lattice is intrinsic to drawing
text at a non-integer scale in Safari.

The lattice is **integer dial units**. With viewBox span `V` and drawn size `S` px,
one dial unit is `u = S/V` real px, and a font requested at `p` real px renders at
`round(p·V/S)·S/V`. Worst-case font error is `±u/2`; worst case for an explicit
fractional line-height is `−u`. Real px rendered, `V = 220`:

| requested | S=220 | S=320 (u=1.45) | S=440 (u=2.0) | S=640 (u=2.91) |
| --- | --- | --- | --- | --- |
| 10px | 10.00 | 10.18 | 10.00 | 8.73 (−12.7%) |
| 13px | 13.00 | 13.09 | 14.00 (+7.7%) | 11.64 (−10.5%) |
| 16px | 16.00 | 16.00 | 16.00 | 17.45 (+9.1%) |
| 24px | 24.00 | 24.73 | 24.00 | 23.27 |

The error grows with drawn size, because the step in real px is `S/V`. The exact
columns are arithmetic accidents of `k` and are not a strategy.

**Mitigation: snap to integer dial units.** For a requested `p` real px, emit
`round(p·k)/k` px — equivalently, author the size as a whole number of dial units.
The post-zoom value is then an integer, and integers are fixed points of nearest,
floor and ceil alike, so Safari's rounding becomes the identity and Chrome and
Firefox render the same snapped size. All three browsers then agree, and the error
is explicit at emit time (`≤ u/2`) instead of arbitrary at render time. It is zero
whenever sizes are authored in whole dial units, which is mainplate's native idiom.
Consumer stylesheets cannot be snapped; their text sits on the lattice in Safari,
bounded by `±u/2` plus up to `−u` on an explicit fractional line-height.

Whether mainplate's own SVG `<text>` numerals sit on the same lattice under the
viewBox scale was never tested. Worth one look someday.

### Dead explanations — do not re-propose these

Four explanations of the Safari failure, all dead. **Two of them came from the
controller coordinating the work, two from the implementer.** The useful lesson is
not whose they were: the first two were stated with confidence, each from a
mechanism that was entirely plausible, and both were wrong. Reading the source and
running a control was the only thing that caught either. Every round that changed
the fixture on a hypothesis cost a human Safari pass.

| Explanation | Killed by |
| --- | --- |
| The counter-scaled wrapper is `position: static`, so absolutely-positioned children escape to the initial containing block | All four wrappers already carried `position: relative` from round 1. Nothing was escaping. Read from the source before acting. |
| `transform-box: border-box` routes WebKit into its SVG reference-box path, replacing the CTM instead of composing with it | Variant F used `zoom` and no transform at all and was displaced identically. The content is in the wrong place before any scaling is applied. |
| The SVG is sized by CSS rather than by `width`/`height` attributes | The fixture had been attribute-sized since round 1, so there was nothing to change; control J ran the inverse experiment — the same panel sized by CSS — and passed. |
| The negative-origin viewBox is the trigger: the viewBox translate is dropped | Controls I, J and K passed: no viewBox, CSS sizing and a non-negative `viewBox="0 0 220 220"` all rendered correctly, and the full recipe rebuilt on the non-negative viewBox (L) still failed. |

Two process notes worth keeping:

- The build marker in the fixture header exists to remove "the browser was showing a
  cached copy" as an unfalsifiable explanation. Bump it whenever the file changes.
- The `<foreignObject>` element itself was never the problem. Panel H — a plain
  static div on the exact production geometry, negative origin included — passes in
  Safari. Writing a rejection on "Safari cannot do foreignObject" would have been
  wrong, and the bisection ladder from H to the failing recipe is what showed it.
