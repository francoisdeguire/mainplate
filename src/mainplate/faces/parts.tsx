"use client"

/**
 * The shared face parts: `<Hand>`, `<Cap>`, `<Dial>`, `<Numerals>`, `<Ticks>`.
 * May import: core, faces/*. One set for every face — flavor lives in the
 * `<Clock>`/`<Gauge>` wrappers, never in part duplicates.
 *
 * Two placement conventions, and which part uses which is the point:
 *
 * - **Marks on the outline go through `markTransform`** — no part assembles a
 *   transform by hand (the Task 2 rule; the spike shipped two defects doing
 *   exactly that).
 * - **Centre-anchored parts (hand, cap, dial) sit at `left/top: 50%`,**
 *   because the face box is centred on the dial origin by contract — the same
 *   assumption `markTransform` documents. Their only geometry is the dial→cqw
 *   size conversion, quantised through the shared `quantize` below.
 */
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react"
import {
  failSoft,
  isSource,
  quantize,
  type ResolveInput,
  resolveTicks,
  type Scale,
  type Skip,
  type Source,
  valueToAngle,
} from "../core"
import { bindRotation } from "./bind-rotation"
import { useFaceContext } from "./context"
import {
  type MarkTransform,
  markTransform,
  type Orient,
  resolveDomain,
  spanTransform,
} from "./geometry"

/** Dial units → cqw (percent of the container's inline size), quantised. */
function cq(u: number, boxW: number): number {
  return boxW === 0 ? 0 : quantize((u / boxW) * 100)
}

/**
 * The stroke-width floor, as a CSS value: never under one device-independent
 * pixel, however small the face.
 *
 * The Task 10 freeze stress measured why: inside a `size={40}` register on a
 * `w-56` face a line-variant hand computes to 0.33 CSS px and the browser
 * resolves it by fading it to nothing — silently, at exactly the sizes real
 * consumers use. The floor is a `max()` STRING, not a measurement, so it is
 * deterministic, SSR-byte-identical and quantisation-clean; and it applies to
 * WIDTHS only — a mark's length keeps the Subdial contract that geometry and
 * the face shrink together, because a short mark is a design and an invisible
 * one is a bug.
 */
function flooredWidth(widthCqw: number): string {
  return `max(${widthCqw}cqw, 1px)`
}

/**
 * A `MarkTransform` as the style every mark shares. `floorWidth` opts a track
 * of stroke-like marks into the 1px width floor; a numeral box stays literal —
 * text is never a stroke, and its metrics belong to the glyph.
 */
function markStyle(t: MarkTransform, floorWidth = false): CSSProperties {
  return {
    position: "absolute",
    left: t.left,
    top: t.top,
    width: floorWidth ? flooredWidth(t.widthCqw) : `${t.widthCqw}cqw`,
    height: `${t.heightCqw}cqw`,
    // Translate first, so the rotation happens about the centred mark.
    transform: `translate(-50%, -50%) rotate(${t.rotate}deg)`,
  }
}

/* ------------------------------------------------------------------- Dial */

export type DialProps = {
  className?: string
  children?: ReactNode
} & Omit<ComponentProps<"div">, "children" | "className">

/**
 * The background surface: the outline's own bounding box, tinted from the
 * palette's 5% ramp. Rarely touched — it exists so a shadow, a texture, or a
 * hard-edged design-system surface has one obvious `className` target.
 */
export function Dial({ className, style, children, ...rest }: DialProps) {
  const { outline, boxW, cornerRadius, unstyled } = useFaceContext()
  const box = outline.bbox()
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${cq(box.width, boxW)}cqw`,
        height: `${cq(box.height, boxW)}cqw`,
        transform: "translate(-50%, -50%)",
        ...(unstyled
          ? undefined
          : {
              // A round dial is a border-radius; a rect dial's is the SHAPE's
              // own corner radius, converted dial units → cqw. The silhouette
              // flag decides, not the bbox: a `ratio: 1` rect has a square
              // bbox and is still emphatically not a circle.
              borderRadius: cornerRadius === null ? "50%" : `${cq(cornerRadius, boxW)}cqw`,
              background: "var(--mp-dial)",
            }),
        ...style,
      }}
      {...rest}
      data-mp="dial"
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ Ticks */

/**
 * One mark, as `skip` and `render` receive it.
 *
 * `angle` is quantised, like everything else that can reach a style or a text
 * node: a `render` that prints it must not print a different float on the
 * server than in the browser.
 */
export type TickMark = {
  /** The domain value this mark stands at. */
  value: number
  /** Where it sits, in degrees from 12 o'clock. */
  angle: number
  /** Its position in the track's own population — skipping leaves holes rather than renumbering. */
  index: number
}

export type TicksProps = {
  /**
   * The pre-composed default track pair: `"all"` is the minute track with hour
   * majors, `"quarters"` keeps 12/3/6/9. Sugar for the two `count` tracks
   * below, and ignored the moment `count` or `every` says otherwise.
   * @default "all"
   */
  variant?: "all" | "quarters"
  /**
   * How many marks, spread evenly across the track's angular range. The
   * fencepost rule is the arc's: a full turn draws `count` marks and drops the
   * one that would land on the first, a bounded sweep includes both endpoints.
   * With no `from`/`to`, the values are simply `0 … count − 1`.
   */
  count?: number
  /** A step in domain units instead of a mark count. Needs `to` — there is no domain to step across without one. */
  every?: number
  /**
   * The marks stated outright, one per domain value — the non-uniform scale a
   * step cannot describe: a tachymeter, a log axis, the three readings that
   * matter. Mapped through `from`/`to` and the sweep exactly as `count` marks
   * are; with no `to`, the domain spans the list, so the largest value lands at
   * the sweep's end (state `to` on a closed ring, or the largest lands back on
   * the first). Exactly one of `values`, `count` and `every`.
   */
  values?: readonly number[]
  /** The domain's lower bound, at the start of the sweep. @default 0 */
  from?: number
  /** The domain's upper bound, at the end of the sweep. @default the one `count` implies */
  to?: number
  /**
   * Carve holes: a list of domain values, or a predicate. This is what turns a
   * stack of tracks into one layout — the minute track skips every fifth
   * minute so the hour track stands in the gap.
   */
  skip?: readonly number[] | ((value: number, mark: TickMark) => boolean)
  /**
   * How the track lays its marks on a shaped face — the two rhythms spec §3
   * names, indistinguishable on a circle:
   *
   * - `"angular"` — each mark stands on its frame ray, so a hand pointing at
   *   value v points at the mark for v. On a rect these are the radial spans
   *   (rotation = the angle, `1/cos θ` stretch and width correction), whose
   *   inner ends describe the uniform inset ring.
   * - `"perimeter"` — the marks divide the outline's LENGTH evenly (the
   *   chemin-de-fer rhythm): a fraction of the sweep is the same fraction of
   *   the perimeter, which no angular walk gives a non-circle.
   *
   * @default "angular"
   */
  placement?: "angular" | "perimeter"
  /** Distance inward from the outline to the mark's OUTER end, so tracks of different lengths share an edge. @default 4 */
  inset?: number
  /**
   * The mark preset this track draws with. `"major"` is the prominent pair —
   * the hour-marker length and width plus the 78% ramp — applied as DEFAULTS,
   * so an explicit `length`, `width` or `style` still wins. One word instead
   * of three restated numbers and an internal palette variable, which is
   * exactly what every hand-written major track was doing before the Task 10
   * freeze stress named it. @default "minor"
   */
  emphasis?: "minor" | "major"
  /** The mark's extent along its own axis, in dial units. */
  length?: number
  /** The mark's extent across its own axis, in dial units. */
  width?: number
  /**
   * Which way each mark faces. The default follows the placement — `"radial"`
   * for angular marks (the span ring; identical to `"edge"` on a circle) and
   * `"edge"` for perimeter marks (square to the outline they walk). An
   * angular mark left radial IS the radial span; any other word opts it back
   * into a fixed-length mark, which is how the Tank's edge-perpendicular
   * style stays expressible.
   */
  orient?: Orient
  /** Where the track's domain starts, in degrees from 12 o'clock. @default 0 */
  startAngle?: number
  /** The track's angular span. @default 360 */
  sweepAngle?: number
  className?: string
  /**
   * Replaces each mark's bar. Position, size and rotation stay the part's —
   * the same division of labour `<Numerals render>` gets — so a custom mark
   * cannot fall off its ring. The default paint goes with the bar: a custom
   * mark IS the mark, not a decoration on top of one.
   *
   * Mind `orient` when the content is TEXT: the `"edge"` default turns the
   * box with the ring — right for bars and artwork, sideways for a label —
   * so a labelled track nearly always wants `orient="upright"` stated. The
   * complex face's register labels are the worked example: they shipped
   * lying along the ring until the browser pass said so.
   */
  render?: (value: number, mark: TickMark) => ReactNode
} & Omit<ComponentProps<"div">, "children" | "className">

/** The tick ring's geometry, in dial units. Private: sizing is CSS. */
const TICK_INSET = 4
const MAJOR_LENGTH = 9
const MAJOR_WIDTH = 2.4
const MINOR_LENGTH = 5
/**
 * 1.4, not 1. A minor mark is one dial unit wide on a 220-unit box — 0.45% of
 * the container — which at `w-40` is 0.73 CSS pixels and at `w-56` barely one.
 * Below a pixel the browser resolves the mark by fading it, and the 32% ink
 * ramp is already the palette's quietest, so the two compound into a track that
 * reads as dust rather than as marks. The fix is the mark, not the ink: the
 * ramp values are fixed by the palette (dial 5, tick 32, major 78) and a fourth
 * alpha would be a new palette decision. Widening keeps the track quiet and
 * makes it land on whole pixels.
 */
const MINOR_WIDTH = 1.4

/** Slack for asking whether a sweep closes on itself — `populate`'s own rule. */
const CLOSED_ARC_EPSILON = 1e-9

/** The default pair's hole: every fifth minute belongs to the hour track. */
const EVERY_FIFTH = (value: number) => value % 5 === 0

/**
 * Where the RECT default pair stands its hour bars: inside the minute ring
 * (whose marks end at inset 9), not interleaved with it. On a circle the two
 * tracks share one ring because every fifth minute IS the hour position; on a
 * rect the minute ring is perimeter-placed and the hours are angular, so the
 * two rhythms only meet at 12/3/6/9 — sharing an inset would scatter
 * near-collisions around every other hour. Standing the bars a clear step
 * inward is also simply what the reference face (Meridian) does.
 */
const RECT_MAJOR_INSET = 13

/** A custom mark fills the box it was given, centred, exactly as a numeral does. */
const CENTRED: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}

/**
 * One tick track. Internal: `<Ticks>` is either this once, or twice.
 *
 * Placement defaults to **angular** — a minute at value 5 sits exactly under
 * the hour mark at value 5, so a `skip` carves its hole where a major stands
 * and a hand pointing at a value points at its mark. An angular mark left in
 * its radial default renders as the **radial span** (spec §3, the owner's
 * correction): the segment of the frame ray between the outer inset and the
 * inner one, rotated to the angle itself, width-corrected by `1/cos θ` so
 * oblique marks do not read thin. On a circle that is bit-for-bit the old
 * fixed-length mark; on a rect it is what makes the ring uniform. Perimeter
 * placement — the chemin-de-fer rhythm Task 7's rewrite set aside — is back
 * as the stated alternative, and is what the rect default's minute ring uses.
 *
 * The population itself is the engine's — `resolveTicks` already owns the
 * fencepost rule, the epsilon-matched `skip`, and the runaway-`every` ceiling.
 * This component adds no arithmetic of its own beyond choosing the domain.
 */
function Track({
  count,
  every,
  values,
  from = 0,
  to,
  skip,
  placement = "angular",
  inset = TICK_INSET,
  emphasis = "minor",
  length,
  width,
  orient,
  startAngle = 0,
  sweepAngle = 360,
  className,
  style,
  render,
  ...rest
}: TicksProps) {
  const { outline, boxW, boxH, unstyled } = useFaceContext()
  const major = emphasis === "major"
  const markLength = length ?? (major ? MAJOR_LENGTH : MINOR_LENGTH)
  const markWidth = width ?? (major ? MAJOR_WIDTH : MINOR_WIDTH)
  // The placement's own default orientation: angular marks lie on their ray,
  // perimeter marks stand square to the outline they walk. On a circle the
  // two words are the same direction, which is why nobody misses this knob
  // until a face is shaped.
  const markOrient = orient ?? (placement === "perimeter" ? "edge" : "radial")

  // The three populations are exactly-one-of, the engine's own rule: combining
  // them would need a precedence order, and a precedence order is a thing to
  // remember. Stated rather than silently resolved — `failSoft` throws in
  // development and names the survivor in production.
  const stated = [values !== undefined, count !== undefined, every !== undefined]
  if (stated.filter(Boolean).length > 1) {
    failSoft(
      "mainplate: <Ticks> takes only one of `values`, `count` or `every` — received " +
        `${(["values", "count", "every"] as const).filter((_, i) => stated[i]).join(" and ")}.`,
      "Using `values`, then `count`.",
    )
  }

  // `every` alone cannot be honoured — a step with no upper bound populates one
  // mark and looks like a bug — so it takes the same path rather than degrading
  // in silence.
  if (values === undefined && count === undefined && every !== undefined && to === undefined) {
    failSoft(
      `mainplate: <Ticks every={${every}}> needs a domain to step across — give \`to\` ` +
        "(and `from` when it is not 0), or say `count` instead.",
      "Rendering no marks.",
    )
    return null
  }

  // The domain a bare `count` implies: one unit a step, so the values are
  // 0…count−1 whichever way the fencepost falls. A track then reads in the
  // units its `skip` is written in — `(v) => v % 5 === 0` means every fifth
  // MARK, which is the only thing it could sensibly mean. The fencepost is the
  // engine's own: a closed ring drops the mark that would land on the first,
  // an open sweep keeps both its endpoints, so the step is 1 either way.
  //
  // A bare `values` list has no step to infer from, so its domain simply spans
  // the list: the largest value lands at the end of the sweep, which is what an
  // open scale wants and what `to` is for on a closed one.
  const closed = Math.abs(sweepAngle) >= 360 - CLOSED_ARC_EPSILON
  const implied =
    values !== undefined
      ? Math.max(from, ...values) - from
      : count === undefined
        ? 1
        : Math.max(closed ? count : count - 1, 1)
  const scale: Scale = { min: from, max: to ?? from + implied, startAngle, sweepAngle }

  const skipMarks: Skip | undefined =
    typeof skip === "function"
      ? (ctx) => skip(ctx.value, { value: ctx.value, angle: quantize(ctx.angle), index: ctx.index })
      : skip
  // `<Ticks>` never routes here without a population; the empty tier is the
  // type system's share of that argument rather than a case that happens.
  const input: ResolveInput =
    values !== undefined
      ? { ticks: values.map((value) => ({ value })), skip: skipMarks }
      : count !== undefined
        ? { count, skip: skipMarks }
        : { tiers: every === undefined ? [] : [{ every }], skip: skipMarks }
  const marks = resolveTicks(input, scale)

  // The perimeter walk's inputs, shared by every mark on it: the fraction of
  // a full turn a mark's angle names becomes the same fraction of the inset
  // outline the mark's CENTRE walks. Its quarter points land on the flank
  // centres for any ratio (each quarter is one flank half + one corner + one
  // flank half), so 12/3/6/9 stay where the angular track puts them.
  const centreInset = inset + markLength / 2
  const perimeter = placement === "perimeter" ? outline.length(centreInset) : 0

  return (
    <>
      {marks.map((mark) => {
        const angle = quantize(valueToAngle(mark.value, scale))
        // Three ways a mark becomes a transform, all owned by the geometry
        // module. `inset` names the mark's outer end everywhere, so tracks of
        // different lengths line up along their outer edge:
        // - perimeter: centre at the arc-length point, fixed length;
        // - angular radial: THE SPAN — pointAt(angle, inset)…pointAt(angle,
        //   inset + length), rotation = the angle, width corrected by 1/cosθ
        //   (spec §3; a span already stretches, so its length input is the
        //   inset difference);
        // - angular, any other orient: a fixed-length mark at the ray's point.
        const t =
          placement === "perimeter"
            ? markTransform(
                outline,
                { along: (angle / 360) * perimeter, inset: centreInset },
                { orient: markOrient, width: markWidth, length: markLength, boxW, boxH },
              )
            : markOrient === "radial"
              ? spanTransform(outline, angle, inset, inset + markLength, {
                  width: markWidth,
                  obliquityWidth: true,
                  boxW,
                  boxH,
                })
              : markTransform(
                  outline,
                  { angle, inset: inset + markLength / 2 },
                  { orient: markOrient, width: markWidth, length: markLength, boxW, boxH },
                )
        return (
          <div
            key={mark.index}
            className={className}
            style={{
              ...markStyle(t, true),
              ...(render === undefined ? undefined : CENTRED),
              ...(unstyled || render !== undefined
                ? undefined
                : {
                    borderRadius: 999,
                    background: major ? "var(--mp-tick-major)" : "var(--mp-tick)",
                  }),
              ...style,
            }}
            {...rest}
            data-mp="tick"
          >
            {render?.(mark.value, { value: mark.value, angle, index: mark.index })}
          </div>
        )
      })}
    </>
  )
}

/**
 * A tick track — and, stacked, every tick layout there is.
 *
 * **This is what replaced `tiers`.** The SVG layer merged tiers into one path
 * because a path is one node and later-tier-wins was how two rhythms shared a
 * position. HTML merges nothing: each mark is already its own element, so two
 * `<Ticks>` elements are two tracks, and `skip` is how the lower one gets out
 * of the upper one's way. The classic minute+hour dial, in full:
 *
 * ```tsx
 * <Ticks count={60} skip={(v) => v % 5 === 0} />
 * <Ticks count={12} emphasis="major" />
 * ```
 *
 * — which is what a bare `<Ticks/>` renders on a round face, because the
 * default pair below is exactly that composition and nothing else. On a RECT
 * face the bare default is the other classic instead: a continuous
 * perimeter-placed minute ring with angular hour bars standing inside it (the
 * Meridian layout) — same two tracks, recomposed for the shape, and stated in
 * full in the second branch below. `emphasis` is the whole of the
 * prominence vocabulary: before it existed, a hand-written major track had to
 * restate two private numbers and an internal palette variable (the Task 10
 * freeze finding). There is no collision rule to learn, no tier index, and no
 * way for one track to silently swallow another's mark: what is written is
 * what is drawn, in the order it is written.
 */
export function Ticks({
  variant = "all",
  count,
  every,
  values,
  from,
  to,
  skip,
  length,
  width,
  ...shared
}: TicksProps) {
  // The one thing the sugar reads from the face itself: its silhouette. The
  // default pair is a shape decision — see the two compositions below.
  const { cornerRadius } = useFaceContext()
  const round = cornerRadius === null

  // Anything that states a population is one explicit track; `variant` is only
  // consulted when nothing does.
  if (count !== undefined || every !== undefined || values !== undefined) {
    return (
      <Track
        count={count}
        every={every}
        values={values}
        from={from}
        to={to}
        skip={skip}
        length={length}
        width={width}
        {...shared}
      />
    )
  }

  // The majors first, as the minimal part drew them: they are the marks a
  // consumer's `className` most often means, and DOM order is z-order.
  // `emphasis` sits after the spread: the pair's major track is major by
  // definition, whatever rode in on the sugar's shared props.
  if (round) {
    return (
      <>
        <Track count={variant === "quarters" ? 4 : 12} {...shared} emphasis="major" />
        {variant === "all" ? <Track count={60} skip={EVERY_FIFTH} {...shared} /> : null}
      </>
    )
  }

  // The rect default pair is a different composition, not different marks:
  // angular hour bars standing inside a CONTINUOUS perimeter minute ring —
  // the Meridian layout. No `skip`: the minute ring's rhythm is the
  // perimeter's and the hours' is angular, so carving fifth-minute holes
  // would open gaps nowhere near the bars. The bars keep the outer inset
  // when they are alone (`"quarters"`, and `"all"`'s ring gone) — they only
  // step inward to clear a ring that exists.
  return (
    <>
      <Track
        count={variant === "quarters" ? 4 : 12}
        inset={variant === "all" ? RECT_MAJOR_INSET : TICK_INSET}
        {...shared}
        emphasis="major"
      />
      {variant === "all" ? <Track count={60} placement="perimeter" {...shared} /> : null}
    </>
  )
}

/* --------------------------------------------------------------- Numerals */

export type NumeralVariant = "arabic" | "roman" | "quarters"

/**
 * How a numeral sits on its ray, in the words the owner asked for — `vertical`
 * being what `upright` is called outside horology.
 *
 * The three map onto Task 2's shared `Orient` vocabulary and nothing else: this
 * part writes no trig, and `radial` comes free from the same table. What each
 * one turns is the numeral's **own axis** — the direction its top points —
 * because that is what `Orient` means for every mark on the face:
 *
 * - `upright` — the axis never turns. Rotation is 0 at every position, so every
 *   numeral reads horizontally. The default, and what a Mondaine wears.
 * - `radial` — the axis lies along the ray, so the 3 turns a quarter turn
 *   clockwise and the 6 stands on its head. Because a glyph's baseline is
 *   square to its own axis, this is the layout whose *text* follows the
 *   tangent: the classic wrapped-around-the-dial numeral.
 * - `tangential` — the axis follows the tangent in the direction of travel
 *   (clockwise), which is `edge + 90` in the shared table and exactly
 *   `angle + 90` on a circle. The glyph then reads along the ray, pointing in
 *   at the centre. A deliberate, decorative look — see the numerals task's
 *   report for why the two names read backwards to a typographer.
 */
export type NumeralOrient = "upright" | "tangential" | "radial"

/** The part's vocabulary → the geometry module's. The whole of the mapping. */
const ORIENT: Record<NumeralOrient, Orient> = {
  upright: "upright",
  tangential: "tangent",
  radial: "radial",
}

/**
 * Four as IIII, not IV — the watchmaker's four. Every dial that has ever hung
 * in a station or a jeweller's window uses it: it balances VIII across the
 * face, and the subtractive IV is a printer's convention a dial never adopted.
 */
const ROMAN = ["I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]

/** The numeral track's geometry, in dial units. Private: sizing is CSS. */
const NUMERAL_INSET = 22
/**
 * The rect ring sits deeper, because the rect default TICKS do: its hour bars
 * stand at inset 13–22 (`RECT_MAJOR_INSET`), exactly where the circle parks
 * its numerals. 31 restores the circle's clearance relationship — the bars'
 * inner ends stay ~1 unit outside the glyph extent at every hour, the same
 * gap the circle's ring keeps to its majors — re-judged for the shape task
 * by the clearance test in shape.test.tsx.
 */
const RECT_NUMERAL_INSET = 31
const NUMERAL_WIDTH = 26
const NUMERAL_HEIGHT = 16
const NUMERAL_SIZE = 12

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const QUARTERS = [3, 6, 9, 12]

export type NumeralsProps = {
  /** `"arabic"` is 1–12, `"roman"` the same in IIII form, `"quarters"` keeps 3/6/9/12. @default "arabic" */
  variant?: NumeralVariant
  /** @default "upright" */
  orient?: NumeralOrient
  /**
   * Distance inward from the outline to the numeral box's centre, in dial
   * units. The default clears the default tick geometry's inner ends with
   * room to spare — 22 on a round face, 31 on a rect, whose default hour
   * bars stand deeper; a face with its own tick geometry moves the ring
   * rather than measuring glyphs.
   */
  inset?: number
  className?: string
  /**
   * Replaces each numeral's content. Position, size and rotation stay the
   * engine's — the same division of labour `<Ticks render>` gets — so a custom
   * numeral cannot fall off its ray. The label comes along because `roman` is
   * the part's own spelling, not something a caller can re-derive from `value`.
   */
  render?: (value: number, numeral: { label: string; angle: number }) => ReactNode
} & Omit<ComponentProps<"div">, "children" | "className">

/**
 * The numeral track: hour labels on the hour rays, turned — or not — by one
 * word from the shared orientation vocabulary.
 *
 * Placement is angular, never by perimeter length: III belongs under the 3
 * o'clock ray, which is where the hour hand points, and on a shaped face that
 * is emphatically not where an evenly-spaced perimeter walk lands.
 *
 * **Clearance is a fixed inset, not a measured one** — the numerals task's
 * browser pass decided it. The default ring's ink clears the minute track's
 * inner ends by ~5 dial units at 12/3/6/9 and by ~3 at the widest diagonal
 * label there is (roman VIII at 8 o'clock, on the full 60-mark track): tight,
 * never touching. Measuring rendered glyph boxes — the legacy SVG layer's
 * `clearanceRadius` — would even that gap out, at the cost of a post-mount
 * layout read on a part whose whole claim is that it renders once and never
 * again. Buy that back only when a real face collides; moving `inset` is the
 * answer until then.
 */
export function Numerals({
  variant = "arabic",
  orient = "upright",
  inset,
  className,
  style,
  render,
  ...rest
}: NumeralsProps) {
  const { outline, boxW, boxH, cornerRadius, unstyled } = useFaceContext()
  const values = variant === "quarters" ? QUARTERS : HOURS
  const ringInset = inset ?? (cornerRadius === null ? NUMERAL_INSET : RECT_NUMERAL_INSET)

  return (
    <>
      {values.map((value) => {
        // 12 sits on the 0° ray: the hour hand's own mapping, arrived at the
        // same way. Every numeral is a mark, so every numeral goes through
        // `markTransform` — there is no second placement path here either.
        const angle = (value % 12) * 30
        const t = markTransform(
          outline,
          { angle, inset: ringInset },
          {
            orient: ORIENT[orient],
            width: NUMERAL_WIDTH,
            length: NUMERAL_HEIGHT,
            boxW,
            boxH,
          },
        )
        // `?? String(value)` is unreachable by construction — `values` only
        // ever holds 1–12 — and exists because the index signature says so.
        const label = variant === "roman" ? (ROMAN[value - 1] ?? String(value)) : String(value)
        return (
          <div
            key={value}
            className={className}
            style={{
              ...markStyle(t),
              // Structure, not paint: the box is the anchor and the glyph is
              // centred in it, so a `render` child inherits the same centring
              // the built-in label gets.
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              whiteSpace: "nowrap",
              ...(unstyled
                ? undefined
                : {
                    color: "var(--mp-ink)",
                    // Type size is paint on a numeral track — it is the mark's
                    // whole visual weight, and a default left behind would
                    // fight the `className` that replaced it.
                    fontSize: `${cq(NUMERAL_SIZE, boxW)}cqw`,
                    fontWeight: 500,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }),
              ...style,
            }}
            {...rest}
            data-mp="numeral"
          >
            {render === undefined ? label : render(value, { label, angle })}
          </div>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------- Hand */

export type HandType = "hour" | "minute" | "second"
export type HandVariant = "bar" | "taper" | "line"

/**
 * Per-type geometry, private by plan constraint: reach, counterweight tail,
 * width and the domain a bare hand of that type maps through. `plain` is the
 * untyped hand — a gauge needle before the Gauge wrapper dresses one.
 * `accent` marks the one red element of the design direction.
 */
const PRESETS: Record<
  HandType | "plain",
  {
    length: number
    tail: number
    width: number
    max: number
    accent: boolean
  }
> = {
  hour: { length: 46, tail: 12, width: 6.5, max: 12, accent: false },
  minute: { length: 68, tail: 12, width: 5, max: 60, accent: false },
  second: { length: 74, tail: 22, width: 1.6, max: 60, accent: true },
  plain: { length: 68, tail: 12, width: 5, max: 60, accent: false },
}

/**
 * The same hands on a face with no numerals, reaching into the ring the
 * numerals would have occupied (spec §12: minute 68 → 80). The spike gave one
 * anchor; hour and second follow it proportionally, so the three keep the
 * length relationships the eye reads as a set. Private constants, selected by
 * a wrapper's `numerals` prop — there is no public length prop, by plan
 * constraint, and this is why one is not missed.
 */
const LONG_REACH: Record<HandType | "plain", number> = {
  hour: 54,
  minute: 80,
  second: 86,
  // The needle's own number, and the one that is not proportional: it is set by
  // the gauge's graduation ring rather than by the other hands. 83.5 is where
  // the minor marks' inner ends are (inset 12, length 4.5, on the 100-unit
  // dial), so the tip meets the ring it reads against instead of stopping a few
  // units short of it — which browser-read as a needle that was slightly too
  // small for its face. It stays clear of the majors' inner ends at 80.
  plain: 83.5,
}

/**
 * The stepping cadence's ease: fast out, soft landing — a quartz escapement.
 * Exported without a property so a face's other moving parts — the gauge's
 * sweep fill, which glides on `stroke-dashoffset` rather than on a transform —
 * step to the same duration and curve without restating either.
 */
export const STEP_EASE = "180ms cubic-bezier(0.23, 1, 0.32, 1)"

const TICK_TRANSITION = `transform ${STEP_EASE}`

export type HandProps = {
  /**
   * The reading. A number is controlled; a `Source` is live (zero renders per
   * update). Omit it only as a slot inside `<Clock>`/`<Gauge>`: the wrapper
   * owns the reading and supplies it to whatever fills the slot, which is what
   * lets `<Clock><Hand type="second" className="…"/></Clock>` restyle the
   * seconds hand without also re-wiring it. A bare hand with no value sits at
   * its domain minimum.
   */
  value?: number | Source<number>
  /** Geometry and domain preset. Untyped hands get the minute's geometry over 0-60. */
  type?: HandType
  /** Domain minimum. Beats `source.domain`, which beats the type preset. @default 0 */
  min?: number
  /** Domain maximum. Beats `source.domain`, which beats the type preset. */
  max?: number
  /** Where the domain starts, in degrees from 12 o'clock. @default 0 */
  startAngle?: number
  /** The domain's angular span. @default 360 */
  sweepAngle?: number
  /** @default "bar" */
  variant?: HandVariant
  /**
   * Step once per value with the 180ms transition — which is exactly the case
   * where an absolute 354°→0° write spins backwards, so tick mode also turns
   * on the binder's unwrapping: every step moves by the shortest signed path
   * (59s→0s is +6°; a decreasing reading swings back the short way). @default false
   */
  tick?: boolean
  /**
   * Reach further into the ring a numeral track would have occupied. Set by
   * `<Clock numerals="none">` and by `<Gauge>`, whose face has no numerals at
   * all; the lengths themselves stay private constants. @default false
   */
  long?: boolean
  className?: string
  /** Replaces the shape entirely: the rotating box owns pivot and rotation, children own the look. */
  children?: ReactNode
} & Omit<ComponentProps<"div">, "children" | "className">

/**
 * A hand: a box pivoting on the dial centre, rotation written through a ref.
 *
 * The transform's division of labour is the SSR contract: **render emits the
 * translate only** — the pivot, static and deterministic — and the binder
 * writes `translate rotate(…)` on the client. No value, live or not, ever
 * reaches server HTML, so two server renders are byte-identical while real
 * time moves between them, and hydration has nothing to mismatch.
 */
export function Hand({
  value,
  type,
  min,
  max,
  startAngle = 0,
  sweepAngle = 360,
  variant = "bar",
  tick = false,
  long = false,
  className,
  style,
  children,
  ref,
  ...rest
}: HandProps) {
  const { boxW, unstyled, registerLive } = useFaceContext()
  const kind = type ?? "plain"
  const preset = PRESETS[kind]
  const length = long ? LONG_REACH[kind] : preset.length

  const source = isSource(value) ? value : null
  const controlled = typeof value === "number" ? value : 0

  // §8.10 precedence, prop > `source.domain` > preset — resolved by the one
  // shared helper, so a hand and an arc cannot come to disagree about it.
  const { min: domainMin, max: domainMax } = resolveDomain(
    min,
    max,
    { min: 0, max: preset.max },
    source,
  )

  const total = length + preset.tail
  const pivot = quantize((length / total) * 100)
  const translate = `translate(-50%, -${pivot}%)`

  const read = useMemo(() => {
    const get = source === null ? () => controlled : source.get
    const scale = { min: domainMin, max: domainMax, startAngle, sweepAngle }
    return () => valueToAngle(get(), scale)
  }, [source, controlled, domainMin, domainMax, startAngle, sweepAngle])
  const subscribe = source === null ? null : source.subscribe

  const el = useRef<HTMLDivElement | null>(null)
  const attachRef = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node
      if (typeof ref === "function") ref(node)
      else if (ref !== null && ref !== undefined) ref.current = node
    },
    [ref],
  )

  // ONE accumulator for the hand's whole life. Rebinds happen — a controlled
  // value change re-runs the effect, pause/resume constructs fresh binders —
  // and each fresh binder must continue from the rotation the element is
  // already wearing, or its first write is an absolute angle the armed
  // transition animates backwards through every accumulated lap.
  const accumulator = useRef<{ last: number | null }>({ last: null })

  useEffect(() => {
    const node = el.current
    if (node === null) return
    const options = { translate, unwrap: tick, state: accumulator.current }

    /**
     * Bind, with the mount pose exempted from the stepping transition.
     *
     * A hand's first write is where it *is*, not a step it took. Render emits
     * the translate alone — every hand points at 12 until the binder runs — so
     * with the transition armed that write animates the hand in from 12
     * o'clock over 180ms while the untransitioned hands beside it snap into
     * place, and it replays on every remount. One hand arriving late is read
     * as lag, not as charm, so the first write lands instantly and every step
     * after it animates. The accumulator dates the write: it is null exactly
     * once, before the hand has ever been placed.
     */
    const bind = (to: typeof subscribe) => {
      const armed = node.style.transition
      const mounting = tick && accumulator.current.last === null
      if (mounting) node.style.transition = "none"
      const off = bindRotation(node, read, to, options)
      if (mounting) {
        // Flush the pose against `none` before re-arming, or the restore lands
        // in the same style recalc and the transition runs after all.
        void node.getBoundingClientRect()
        node.style.transition = armed
      }
      return off
    }

    if (subscribe === null) {
      // Controlled: one write per value change, no liveness to manage.
      return bind(null)
    }
    // Live: bind, and register so the face can pause this hand offscreen.
    // Pausing IS unbinding — the unsubscribe rides the source's own refcount
    // down to the engine — and resuming rebinds, whose initial write resyncs
    // to the value as of now (seeded, so within ±180°) rather than replaying
    // the backlog.
    let unbind = bind(subscribe)
    const unregister = registerLive({
      pause: () => unbind(),
      resume: () => {
        unbind = bind(subscribe)
      },
    })
    return () => {
      unregister()
      unbind()
    }
  }, [read, subscribe, translate, tick, registerLive])

  const width = variant === "line" ? Math.min(preset.width, 1.6) : preset.width
  const paint: CSSProperties =
    unstyled || children !== undefined
      ? {}
      : {
          background: preset.accent ? "var(--mp-accent)" : "var(--mp-ink)",
          ...(variant === "taper"
            ? { clipPath: "polygon(8% 100%, 92% 100%, 56% 0%, 44% 0%)" }
            : { borderRadius: 999 }),
          filter: `drop-shadow(0 ${cq(1.6, boxW)}cqw ${cq(3, boxW)}cqw rgb(0 0 0 / 0.2))`,
        }

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        // The same 1px floor the marks wear, and the part that motivated it:
        // a register's line hand computed to a third of a pixel (Task 10).
        width: flooredWidth(cq(width, boxW)),
        height: `${cq(total, boxW)}cqw`,
        transformOrigin: `50% ${pivot}%`,
        transform: translate,
        ...(tick ? { transition: TICK_TRANSITION } : undefined),
        ...paint,
        ...style,
      }}
      {...rest}
      ref={attachRef}
      data-mp="hand"
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------- Cap */

export type CapProps = {
  className?: string
} & Omit<ComponentProps<"div">, "children" | "className">

/** The cap's diameter in dial units. Private: sizing is CSS. */
const CAP_DIAMETER = 9

/** The pivot cover — accent by default, the lollipop's dot. */
export function Cap({ className, style, ...rest }: CapProps) {
  const { boxW, unstyled } = useFaceContext()
  const d = cq(CAP_DIAMETER, boxW)
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${d}cqw`,
        height: `${d}cqw`,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        ...(unstyled
          ? undefined
          : {
              background: "var(--mp-accent)",
              boxShadow: `0 ${cq(0.5, boxW)}cqw ${cq(1, boxW)}cqw rgb(0 0 0 / 0.3)`,
            }),
        ...style,
      }}
      {...rest}
      data-mp="cap"
    />
  )
}
