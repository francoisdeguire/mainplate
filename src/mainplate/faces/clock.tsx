"use client"

/**
 * `<Clock>` — the tier-1 analog clock.
 * May import: core, time, faces/*.
 *
 * Ten props, none required, plus slots. Everything below this line is prop
 * translation: which parts exist, and what each hand reads. The face itself —
 * root, palette, sizing, placement, liveness — is `<Face>`'s, shared verbatim
 * with `<Gauge>`. There is no geometry in this file, and no place to put any.
 *
 * Two shapes of clock, split at the top so hooks stay unconditional: a live
 * clock calls `useWatchSource`, a frozen one calls nothing at all. `time` is
 * therefore not "a clock that stopped" — it never starts, subscribes to no
 * engine, and costs nothing per frame.
 */
import { type ComponentProps, type ReactNode, useMemo } from "react"
import type { Source } from "../core"
import { useWatchSource } from "../time"
import { createWallClock, fieldValue } from "../time/wall-clock"
import { Complication } from "./complication"
import { Face, type FaceSlot, handSlot, partSlot } from "./face"
import type { FaceShape } from "./mainplate"
import { Cap, Dial, Hand, Numerals, type NumeralVariant, Ticks } from "./parts"

/** What the three hands read — numbers when frozen, `Source`s when live. */
type Readings = {
  hour: number | Source<number>
  minute: number | Source<number>
  second: number | Source<number>
}

export type ClockProps = {
  /** One CSS color; the whole palette derives from it in CSS. @default the inherited `currentColor` */
  color?: string
  /** Fixed time — deterministic for docs, tests and screenshots. Omit for live. */
  time?: Date
  /** IANA timezone, resolved through `Intl`. @default the viewer's */
  timezone?: string
  /** `"sweep"` glides, `"tick"` steps once per second, `"none"` omits the hand. @default "sweep" */
  second?: "sweep" | "tick" | "none"
  /**
   * The numeral track: 1–12, the same in roman IIII form, 3/6/9/12, or none at
   * all. It also selects the hand-reach preset it implies — a face with no
   * numerals gives the ring back to the hands (spec §12). Orientation is the
   * slot's: `<Clock><Numerals orient="radial"/></Clock>`. @default "arabic"
   */
  numerals?: NumeralVariant | "none"
  /** `"all"` is the minute track with hour majors; `"quarters"` keeps 12/3/6/9. @default "all" */
  ticks?: "all" | "quarters" | "none"
  /** Face shape. Circle-only rendering until the shape task; passed through today. @default "circle" */
  shape?: FaceShape
  /** Accessible name. Static — §14.1 forbids announcing the time. @default "Analog clock" */
  label?: string
  /** Full structure, zero default paint; slots own everything. @default false */
  unstyled?: boolean
  className?: string
  /** Slots: a part here replaces its default, keeping the clock's own reading. */
  children?: ReactNode
} & Omit<ComponentProps<"div">, "children" | "className" | "aria-label">

/** The props once the wrapper's defaults are resolved — what the body works from. */
type ResolvedClock = Omit<ClockProps, "time" | "timezone" | "second" | "numerals" | "ticks"> & {
  second: NonNullable<ClockProps["second"]>
  numerals: NonNullable<ClockProps["numerals"]>
  ticks: NonNullable<ClockProps["ticks"]>
}

/** The parts a clock is, in z-order. The only clock-specific code there is. */
function ClockFace({
  readings,
  second,
  numerals,
  ticks,
  children,
  ...root
}: { readings: Readings } & ResolvedClock) {
  // Spec §12: the hands take back the ring the numerals would have occupied.
  const long = numerals === "none"

  const slots: FaceSlot[] = [partSlot("dial", <Dial />)]
  if (ticks !== "none") slots.push(partSlot("ticks", <Ticks variant={ticks} />))
  if (numerals !== "none") slots.push(partSlot("numerals", <Numerals variant={numerals} />))
  slots.push(
    handSlot("hand:hour", { value: readings.hour, type: "hour", long }, undefined, "hour"),
    handSlot("hand:minute", { value: readings.minute, type: "minute", long }, undefined, "minute"),
  )
  if (second !== "none") {
    slots.push(
      handSlot(
        "hand:second",
        // `tick` is both halves of the stepping hand: the transition and the
        // binder's shortest-path unwrapping, which is what keeps :59 → :00
        // from spinning the long way back.
        { value: readings.second, type: "second", tick: second === "tick", long },
        undefined,
        "second",
      ),
    )
  }
  // `"top"`: the pivot cover stays above anything a consumer adds — and above
  // the hands, which are themselves above what a consumer adds.
  slots.push(partSlot("cap", <Cap />, "top"))

  return (
    <Face slots={slots} {...root}>
      {children}
    </Face>
  )
}

/** The live clock: five stable `Source`s, one shared engine, zero renders per tick. */
function LiveClock({
  timezone,
  second,
  ...rest
}: { timezone: string | undefined } & ResolvedClock) {
  // `useWatchSource` reads its options once, by design — the wrapper above
  // remounts this component when they change, which is what makes `timezone`
  // and `second` behave like the ordinary reactive props they look like.
  const clock = useWatchSource({ timezone, second: second === "tick" ? "tick" : "glide" })
  return (
    <ClockFace
      readings={{ hour: clock.hour, minute: clock.minute, second: clock.second }}
      second={second}
      {...rest}
    />
  )
}

/** The frozen clock: one decomposition, three numbers, nothing subscribed. */
function StaticClock({
  time,
  timezone,
  second,
  ...rest
}: { time: Date; timezone: string | undefined } & ResolvedClock) {
  const wallOf = useMemo(() => createWallClock(timezone, "<Clock>"), [timezone])
  const wall = wallOf(time.getTime())
  // The same decomposition the live clock runs, at a chosen instant: hour and
  // minute always fractional, the seconds hand truncated exactly when a
  // stepping hand would show the truncated value. A frozen face therefore
  // lands on a pose the live face genuinely passes through.
  return (
    <ClockFace
      readings={{
        hour: fieldValue("hour", wall, "glide"),
        minute: fieldValue("minute", wall, "glide"),
        second: fieldValue("second", wall, second === "tick" ? "tick" : "glide"),
      }}
      second={second}
      {...rest}
    />
  )
}

/**
 * An analog clock. Live by default, frozen with `time`, themed with `color`,
 * sized with CSS (`className="w-40"` — there is no size prop).
 *
 * SSR is deterministic by construction: the hands render translate-only, so
 * the server emits the 10:09:36 marketing pose's markup no matter what time
 * it is, and the binder writes the real rotation after hydration.
 */
export function Clock({
  time,
  timezone,
  second = "sweep",
  numerals = "arabic",
  ticks = "all",
  label = "Analog clock",
  ...rest
}: ClockProps) {
  const shared = { second, numerals, ticks, label, ...rest }
  return time === undefined ? (
    <LiveClock key={`${timezone ?? ""}|${second}`} timezone={timezone} {...shared} />
  ) : (
    <StaticClock time={time} timezone={timezone} {...shared} />
  )
}

/** The slots, namespaced for discovery: `<Clock.Hand type="second" …/>`. */
Clock.Dial = Dial
Clock.Ticks = Ticks
Clock.Numerals = Numerals
Clock.Hand = Hand
Clock.Cap = Cap
// Not a slot — always a free child — but discovered the same way (spec §2).
Clock.Complication = Complication
