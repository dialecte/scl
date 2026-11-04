/** The perf span (`dev.perf`) around the commit pass that removes the types a transaction left unused. */
export const UNUSED_TYPES_PERF_SPAN = 'scl::beforeCommit::unusedTypes'

/** The perf span of the reads that find the types a round judges, inside {@link UNUSED_TYPES_PERF_SPAN}. */
export const UNUSED_TYPES_RESOLVE_PERF_SPAN = `${UNUSED_TYPES_PERF_SPAN}::resolve`

/** The perf span of the reads of the elements naming those types, inside {@link UNUSED_TYPES_PERF_SPAN}. */
export const UNUSED_TYPES_REFERRERS_PERF_SPAN = `${UNUSED_TYPES_PERF_SPAN}::referrers`
