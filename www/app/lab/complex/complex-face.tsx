"use client"

/**
 * The complex face — Task 10's chronograph, every feature of the faces layer
 * composed into one component. LAB SCRATCH, not library code: this file is the
 * API-freeze stress, and `src/mainplate/faces/integration.test.tsx` pins it.
 *
 * What is on it, and which stress each element re-proves:
 *
 * - a tachymeter ring: `values`-driven marks plus `render`ed labels (3600/t,
 *   the classic whole-quotient set), the labels wrapped to their rays
 *   (`orient="radial"` — the orientation every real tachymeter uses, because a
 *   wrapped label spends one line-height of radius where an upright or
 *   tangential one spends its whole diagonal);
 * - the minute track + hour markers as two stacked `<Ticks>` with `skip` —
 *   including the date cut: minutes 14–16 and the 3 o'clock hour mark are
 *   carved out for the window, which is `skip` doing real chronograph work;
 * - upright numerals where the time is read (the Mondaine bar), the 3/6/9
 *   dropped by `render` because complications own those rays;
 * - two nested `<Complication size>` registers, each with its own ticks,
 *   labels and hand mapping through its OWN domain: running seconds 0–60 at
 *   9h, a 30-minute counter 0–30 at 6h (domains arrive via `source.domain`,
 *   §8.10 — no register states a `min`/`max` prop);
 * - the counter's 10/20/30 turned `orient="tangent"` — the decorative
 *   radiating engraving of vintage counters, and the one place on a maximal
 *   face the tangential orientation earned its keep (the freeze report says
 *   more about that);
 * - the animated date window at 3h, a content-mode complication;
 * - two `<Arc>`s on the one shared SVG layer: a static track and a live
 *   elapsed fill sweeping the centre ring once a minute;
 * - five hands, three domains (0–12, 0–60, 0–30), three engines: the wall
 *   clock via `useWatchSource`, and the two chronograph counters the caller
 *   drives through `createSource`.
 *
 * Light ground, ink + the one warm red (the chronograph's own reading: centre
 * hand, elapsed fill, caps), per the design direction.
 */
import type { Source } from "@/mainplate/core"
import { Arc, Cap, Complication, Dial, Hand, Mainplate, Numerals, Ticks } from "@/mainplate/faces"
import { DateWindow } from "@/mainplate/faces/date-window"
import { useWatchSource } from "@/mainplate/time"

/**
 * The tachymeter's stations, in seconds: every t whose 3600/t is whole, from
 * 360 units/h down to 60. A non-uniform scale is exactly what `values` exists
 * for — no `count`/`every` can state it. (The scale once started at t=9 —
 * 400 — but at 6° from its neighbour the two three-digit labels collide at
 * every face size; the browser pass cut it.)
 */
const TACHY = [10, 12, 15, 18, 20, 24, 30, 36, 45, 60] as const

/** The date cut: minutes 14–16 belong to the window, as does the 3h marker. */
const DATE_CUT = (v: number) => v % 5 === 0 || (v >= 14 && v <= 16)

/** The rays the complications own — their numerals come off the track. */
const DROPPED = new Set([3, 6, 9])

export type ComplexFaceProps = {
  /** Elapsed chronograph seconds, 0–60 — the centre hand and the fill. */
  elapsedSeconds: Source<number>
  /** Elapsed chronograph minutes, 0–30 — the 6 o'clock counter. */
  elapsedMinutes: Source<number>
  /** The day of month in the window at 3 o'clock. */
  date: number
  /** IANA timezone for the timekeeping hands. @default the viewer's */
  timezone?: string
  className?: string
}

export function ComplexFace({
  elapsedSeconds,
  elapsedMinutes,
  date,
  timezone,
  className,
}: ComplexFaceProps) {
  const clock = useWatchSource({ timezone })
  return (
    <Mainplate label="Chronograph" className={className}>
      <Dial />

      {/* The shared SVG layer hoists to here — above the dial, under every
          mark. Track in ink, elapsed fill in the accent; the fill's domain is
          the source's own (0–60), so it laps the ring once a minute. */}
      <Arc from={0} to={60} min={0} max={60} inset={70} width={1.2} data-arc="elapsed-track" />
      <Arc
        from={0}
        to={elapsedSeconds}
        inset={70}
        width={3}
        stroke="var(--mp-accent)"
        data-arc="elapsed-fill"
      />

      {/* The tachymeter: marks and labels are two tracks over one `values`
          list, so they cannot drift apart. Labels wrap to their rays. */}
      <Ticks values={TACHY} from={0} to={60} inset={2} length={4} width={1.4} data-tachy-mark="" />
      <Ticks
        values={TACHY}
        from={0}
        to={60}
        inset={7}
        length={9}
        width={16}
        orient="radial"
        render={(t) => String(3600 / t)}
        style={{
          fontSize: "2.9cqw",
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: "var(--mp-numeral)",
        }}
        data-tachy-label=""
      />

      {/* The classic pair, moved inward under the tachymeter, with the date
          cut carved out of both tracks. The hour track is the hand-written
          major track the Task 7 deferral is judged on: length, width and ramp
          all restated by hand. */}
      <Ticks count={60} skip={DATE_CUT} inset={18} data-minute-track="" />
      <Ticks
        count={12}
        skip={[3]}
        inset={18}
        length={9}
        width={2.4}
        style={{ background: "var(--mp-tick-major)" }}
        data-hour-track=""
      />

      {/* Upright where the time is read; 3/6/9 ceded to the complications. */}
      <Numerals inset={36} render={(v) => (DROPPED.has(v) ? null : v)} />

      {/* Running seconds, 9 o'clock: a whole face in 40 parent units. Its
          hand's 0–60 domain is `clock.second`'s own — nothing restated. */}
      <Complication at="9h" inset={48} size={40} data-register="seconds">
        <Dial />
        <Ticks count={12} inset={6} length={12} width={5} />
        <Ticks
          values={[15, 30, 45, 60]}
          from={0}
          to={60}
          inset={24}
          length={16}
          width={26}
          // Stated, not defaulted: a track's marks default to `edge`, which is
          // right for a bar and sideways for text — the browser pass caught
          // these labels lying along the ring.
          orient="upright"
          render={(v) => String(v)}
          style={{ fontSize: "11cqw", fontWeight: 500, color: "var(--mp-numeral)" }}
        />
        <Hand value={clock.second} variant="line" long />
        <Cap />
      </Complication>

      {/* The 30-minute counter, 6 o'clock: its own 0–30 domain via
          `source.domain`, its own `every` track, its radiating labels. */}
      <Complication at="6h" inset={48} size={40} data-register="counter">
        <Dial />
        <Ticks every={3} from={0} to={30} inset={6} length={12} width={5} />
        <Ticks
          values={[10, 20, 30]}
          from={0}
          to={30}
          inset={24}
          length={16}
          width={22}
          orient="tangent"
          render={(v) => String(v)}
          style={{ fontSize: "10cqw", fontWeight: 500, color: "var(--mp-numeral)" }}
        />
        <Hand value={elapsedMinutes} long />
        <Cap />
      </Complication>

      {/* The date, 3 o'clock: positioned content on the outer face — no size,
          no nested context, the window's cqw resolve against the face box. */}
      <Complication at="3h" inset={30} data-date="">
        <DateWindow value={date} />
      </Complication>

      {/* Time in ink, the chronograph in red: three domains on one pivot. */}
      <Hand value={clock.hour} type="hour" />
      <Hand value={clock.minute} type="minute" />
      <Hand value={elapsedSeconds} type="second" />
      <Cap />
    </Mainplate>
  )
}
