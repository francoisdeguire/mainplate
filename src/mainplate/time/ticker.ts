/**
 * The shared clock: one engine for every live face on a page.
 * May import: core/ (nothing needed yet). Must not import: react.
 */

/**
 * How often a subscriber wants to hear from the clock. `"glide"` is a rAF
 * frame — a sweeping seconds hand. `"tick"` is once per second boundary — a
 * quartz step. The distinction lives here rather than at the hand because only
 * the scheduler can turn "once a second" into actually sleeping between
 * boundaries (§9.3, §9.10); a hand quantising a rAF feed would leave the loop
 * running at 60fps for nothing.
 */
export type Cadence = "glide" | "tick"

/**
 * The engine behind every time source. One instance drives any number of
 * subscribers from a single rAF loop — the reason twenty live faces on one
 * docs page cost one frame callback, not twenty (§9.7).
 */
export type Ticker = {
  /**
   * Hear from the clock at the given cadence. Returns the teardown; the last
   * teardown stops the engine entirely, and a later subscribe restarts it.
   */
  subscribe(cadence: Cadence, cb: () => void): () => void
  /**
   * The current epoch milliseconds — the moment of the latest notification
   * while the engine runs, so every subscriber in one frame reads the same
   * coherent instant; a fresh `Date.now()` while it is idle, so a stopped
   * ticker never serves a stale clock.
   */
  now(): number
  /**
   * Hard reset: cancel all scheduled work, detach the visibility listener,
   * and forget every subscriber. The escape hatch for tests and for tearing
   * down a custom ticker — per-consumer lifecycle is the teardown returned
   * from `subscribe`. Idempotent, and the ticker is reusable afterwards.
   */
  stop(): void
}

const MS_PER_SECOND = 1000

/**
 * Build a standalone engine. Exists apart from the singleton so tests — and a
 * future context provider — can run an isolated clock; everything real shares
 * {@link getTicker}.
 */
export function createTicker(): Ticker {
  const subs: Record<Cadence, Set<() => void>> = { glide: new Set(), tick: new Set() }

  let rafId: number | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let listening = false
  // The latest notification's timestamp. Refreshed from `Date.now()` at every
  // wake — never advanced by adding a step, because accumulated deltas drift
  // and a hidden tab would come back replaying the past (§9.9).
  let current = 0
  // Which second `current` fell in, so the shared rAF loop can spot a boundary
  // crossing for its tick subscribers without a second timer.
  let lastSecond = 0

  function notify(cadence: Cadence) {
    for (const cb of subs[cadence]) cb()
  }

  /** One screen frame: re-arm first so a throwing subscriber cannot kill the loop. */
  function frame() {
    rafId = requestAnimationFrame(frame)
    current = Date.now()
    notify("glide")
    if (subs.tick.size > 0) {
      const second = Math.floor(current / MS_PER_SECOND)
      if (second !== lastSecond) {
        lastSecond = second
        notify("tick")
      }
    }
  }

  /** Sleep until the next second boundary — the whole point of the tick cadence. */
  function armTimeout() {
    const delay = MS_PER_SECOND - (Date.now() % MS_PER_SECOND)
    timeoutId = setTimeout(boundary, delay)
  }

  /** A second boundary while sleeping: stamp the moment, notify, re-arm from fresh time. */
  function boundary() {
    timeoutId = null
    current = Date.now()
    lastSecond = Math.floor(current / MS_PER_SECOND)
    notify("tick")
    armTimeout()
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") {
      // Park the engine; registrations survive the nap.
      reconcile()
      return
    }
    // Resync on return: the first visible value is elapsed real time, not a
    // replay of the backlog — recomputing from Date.now() makes catching up a
    // single stamp rather than a queue.
    current = Date.now()
    lastSecond = Math.floor(current / MS_PER_SECOND)
    notify("glide")
    notify("tick")
    reconcile()
  }

  /**
   * Converge scheduling on the current facts — who is subscribed, whether the
   * page is visible — instead of hand-managing transitions at every call site.
   * Idempotence of subscribe/unsubscribe/stop falls out: re-running against
   * unchanged facts changes nothing.
   */
  function reconcile() {
    const hasSubs = subs.glide.size > 0 || subs.tick.size > 0
    const hasDocument = typeof document !== "undefined"

    if (hasDocument) {
      if (hasSubs && !listening) {
        document.addEventListener("visibilitychange", onVisibility)
        listening = true
      } else if (!hasSubs && listening) {
        document.removeEventListener("visibilitychange", onVisibility)
        listening = false
      }
    }

    const running = hasSubs && !(hasDocument && document.visibilityState === "hidden")
    // Glide needs every frame, so its loop runs and tick rides it at boundary
    // crossings — one loop for both cadences (§9.10). Only a tick-only ticker
    // earns the sleeping timer.
    const wantRaf = running && subs.glide.size > 0
    const wantTimeout = running && subs.glide.size === 0

    if (!wantRaf && rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (!wantTimeout && timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (wantRaf && rafId === null) {
      current = Date.now()
      lastSecond = Math.floor(current / MS_PER_SECOND)
      rafId = requestAnimationFrame(frame)
    }
    if (wantTimeout && timeoutId === null) {
      current = Date.now()
      lastSecond = Math.floor(current / MS_PER_SECOND)
      armTimeout()
    }
  }

  return {
    now() {
      return rafId !== null || timeoutId !== null ? current : Date.now()
    },
    subscribe(cadence: Cadence, cb: () => void) {
      subs[cadence].add(cb)
      reconcile()
      return () => {
        subs[cadence].delete(cb)
        reconcile()
      }
    },
    stop() {
      subs.glide.clear()
      subs.tick.clear()
      reconcile()
    },
  }
}

let singleton: Ticker | null = null

/**
 * The default shared instance, created on first use — never at module scope,
 * because this file must import cleanly on a server where `window`, `document`
 * and `requestAnimationFrame` do not exist (§17). Every `useWatchSource` on a
 * page lands here, which is what makes "one rAF for all subscribers" true
 * across components that have never heard of each other.
 */
export function getTicker(): Ticker {
  if (singleton === null) singleton = createTicker()
  return singleton
}
