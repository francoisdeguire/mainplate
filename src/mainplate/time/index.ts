/**
 * mainplate time — the wall clock as `Source`s.
 *
 * The public surface is the hook and its option types. The ticker underneath
 * is deliberately not exported: it is a scheduler with its own cadence-keyed
 * pub-sub, and consumers must only ever meet the `Source` seam — `time/` is
 * that seam's first implementation, not a second mechanism.
 */

export type { Cadence } from "./ticker"
export type { WatchSourceOptions, WatchSources } from "./use-watch-source"
export { useWatchSource } from "./use-watch-source"
