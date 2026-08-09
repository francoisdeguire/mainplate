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
