/** Identity attributes excluded from a structural signature by default. */
export const DEFAULT_IGNORED_ATTRIBUTES: readonly string[] = ['id', 'uuid']

/** No attribute skipped: what a tag without uuid reference pairs folds. */
export const NO_SKIP: ReadonlySet<string> = new Set()

/** The perf span (`dev.perf`) around the lookups of the references of one tree a signature folds in. */
export const RESOLVE_REFERENCES_PERF_SPAN = 'scl::elementSignature::resolveReferences'
