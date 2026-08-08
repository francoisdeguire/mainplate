"use client"

import { type ReactNode, useMemo, useState } from "react"
import {
  type Align,
  circleOutline,
  Mainplate,
  type Orient,
  rectOutline,
  Ticks,
} from "@/mainplate/core"
import { LabNav, ScratchNotice } from "../nav"

const ALIGNS = ["inside", "center", "outside"] as const satisfies readonly Align[]
const ORIENTS = ["radial", "tangential", "edge", "upright"] as const satisfies readonly Orient[]
const KINDS = ["circle", "rect"] as const

const PLATE = "oklch(0.21 0.006 285)"
const EDGE = "oklch(0.34 0.008 285)"
const GUIDE = "oklch(0.3 0.008 285)"
const MARK = "oklch(0.8 0.13 78)"

export default function Playground() {
  const [kind, setKind] = useState<(typeof KINDS)[number]>("circle")
  const [ratio, setRatio] = useState(1)
  const [radius, setRadius] = useState(0)
  const [size, setSize] = useState(300)
  // Both start where the library's own defaults start: clipping on, and so
  // padding at 0. Reserving room outside the outline while clipping is on is
  // the one combination <Mainplate> warns about, and a playground that opens
  // in a warned state teaches the warning is noise.
  const [padding, setPadding] = useState(0)
  const [clip, setClip] = useState(true)
  const [count, setCount] = useState(12)
  const [inset, setInset] = useState(8)
  const [length, setLength] = useState(12)
  const [width, setWidth] = useState(2)
  const [offset, setOffset] = useState(0)
  const [align, setAlign] = useState<Align>("center")
  const [orient, setOrient] = useState<Orient>("radial")
  const [startAngle, setStartAngle] = useState(0)
  const [sweepAngle, setSweepAngle] = useState(360)
  const [min, setMin] = useState(0)
  const [max, setMax] = useState(12)

  // Memoised on the descriptor's own fields, not on an inline literal:
  // <Mainplate> memoises `outline` on identity, so a fresh object every render
  // would rebuild the outline and invalidate the frame context every time.
  const outline = useMemo(
    () => (kind === "circle" ? circleOutline() : rectOutline({ ratio, radius })),
    [kind, ratio, radius],
  )

  const declaration =
    kind === "circle"
      ? ""
      : `const OUTLINE = { kind: "rect", ratio: ${ratio}, radius: ${radius} }\n\n`

  // What <Mainplate> would default `padding` to at the current `clip`, so the
  // pane can leave the prop out when it would change nothing.
  const defaultPadding = clip ? 0 : 10

  const snippet =
    declaration +
    [
      "<Mainplate",
      `  size={${size}}`,
      ...(padding === defaultPadding ? [] : [`  padding={${padding}}`]),
      // Only the off state is written out: `clip` defaults to true, and the
      // pane is meant to show what you would actually type.
      ...(clip ? [] : ["  clip={false}"]),
      kind === "circle" ? '  outline="circle"' : "  outline={OUTLINE}",
      `  min={${min}}`,
      `  max={${max}}`,
      `  startAngle={${startAngle}}`,
      `  sweepAngle={${sweepAngle}}`,
      ">",
      "  <Ticks",
      `    count={${count}}`,
      `    inset={${inset}}`,
      `    length={${length}}`,
      `    width={${width}}`,
      `    offset={${offset}}`,
      `    align="${align}"`,
      `    orient="${orient}"`,
      "  />",
      "</Mainplate>",
    ].join("\n")

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-sm font-medium tracking-wide uppercase opacity-60">
        mainplate lab — playground
      </h1>
      <LabNav current="/lab/playground" />
      <ScratchNotice />

      <div className="mt-8 grid gap-10 lg:grid-cols-[19rem_1fr]">
        <div className="flex flex-col gap-5">
          <Group title="outline">
            <Choice label="kind" value={kind} options={KINDS} onChange={setKind} />
            <Slider
              label="ratio"
              value={ratio}
              min={0.3}
              max={2.5}
              step={0.01}
              disabled={kind !== "rect"}
              onChange={setRatio}
            />
            <Slider
              label="radius"
              value={radius}
              min={0}
              max={80}
              disabled={kind !== "rect"}
              onChange={setRadius}
            />
          </Group>

          <Group title="frame">
            <Slider label="size" value={size} min={120} max={460} step={10} onChange={setSize} />
            <Slider label="padding" value={padding} min={0} max={48} onChange={setPadding} />
            {/* Pull `inset` to 0 with align="outside" to watch this earn its
                keep: the marks leave the outline, and clipping eats them. */}
            <Toggle label="clip" value={clip} onChange={setClip} />
            <Slider
              label="startAngle"
              value={startAngle}
              min={-180}
              max={180}
              onChange={setStartAngle}
            />
            <Slider
              label="sweepAngle"
              value={sweepAngle}
              min={0}
              max={360}
              onChange={setSweepAngle}
            />
            <Slider label="min" value={min} min={-100} max={100} onChange={setMin} />
            <Slider label="max" value={max} min={-100} max={200} onChange={setMax} />
          </Group>

          <Group title="ticks">
            <Slider label="count" value={count} min={0} max={120} onChange={setCount} />
            <Slider label="inset" value={inset} min={0} max={90} onChange={setInset} />
            <Slider label="length" value={length} min={0} max={60} onChange={setLength} />
            <Slider label="width" value={width} min={0.2} max={14} step={0.2} onChange={setWidth} />
            <Slider
              label="offset"
              value={offset}
              min={-20}
              max={20}
              step={0.5}
              onChange={setOffset}
            />
            <Choice label="align" value={align} options={ALIGNS} onChange={setAlign} />
            <Choice label="orient" value={orient} options={ORIENTS} onChange={setOrient} />
          </Group>
        </div>

        <div className="flex flex-wrap items-start gap-8">
          <div className="shrink-0">
            <Mainplate
              size={size}
              padding={padding}
              outline={outline}
              clip={clip}
              min={min}
              max={max}
              startAngle={startAngle}
              sweepAngle={sweepAngle}
              label="Playground face"
            >
              <path d={outline.path()} fill={PLATE} stroke={EDGE} strokeWidth={0.8} />
              <path
                d={outline.path(inset)}
                fill="none"
                stroke={GUIDE}
                strokeWidth={0.6}
                strokeDasharray="3 4"
              />
              <Ticks
                count={count}
                inset={inset}
                length={length}
                width={width}
                offset={offset}
                align={align}
                orient={orient}
                fill={MARK}
              />
              {/* Origin is the frame centre, so a bare <circle> is a centre cap. */}
              <circle r={2.5} fill={MARK} />
            </Mainplate>
            <p className="mt-3 max-w-[36ch] text-xs text-dim">
              The dashed path is <code>outline.path(inset)</code> — where the marks are anchored.
            </p>
          </div>

          <div className="min-w-[24rem] flex-1">
            <h2 className="text-xs font-medium tracking-wide text-dim uppercase">live jsx</h2>
            <pre className="mt-2 overflow-x-auto border border-line bg-plate p-4 text-xs leading-relaxed">
              <code>{snippet}</code>
            </pre>
            <p className="mt-3 text-xs text-dim">
              Copyable as-is. The descriptor is hoisted in the snippet on purpose:{" "}
              <code>&lt;Mainplate&gt;</code> memoises <code>outline</code> on identity, so an inline
              object literal rebuilds the frame on every parent render.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-line p-3">
      <h2 className="mb-2 text-xs font-medium tracking-wide text-dim uppercase">{title}</h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label
      className={`grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs ${
        disabled ? "opacity-35" : ""
      }`}
    >
      <span className="text-dim">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-accent"
      />
      <span className="text-right tabular-nums">{value}</span>
    </label>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs">
      <span className="text-dim">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 justify-self-start accent-accent"
      />
    </label>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}) {
  return (
    <label className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs">
      <span className="text-dim">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="border border-line bg-surface px-2 py-1 text-ink"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
