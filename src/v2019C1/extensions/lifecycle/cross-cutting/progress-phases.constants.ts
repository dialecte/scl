import type { ProgressPhase } from './progress-phases.types'

/** The phases of `tx.lifecycle.apply`, weighted by the time each takes (the write is most of it). */
export const APPLY_PROGRESS_PHASES = [
	{ key: 'check', label: 'Checking the report…', weight: 1 },
	{ key: 'write', label: 'Writing the template…', weight: 17 },
	{ key: 'release', label: 'Releasing implementation links…', weight: 1 },
	{ key: 'consumer', label: 'Running the consumer step…', weight: 1 },
] as const satisfies readonly ProgressPhase<string>[]

/** The phases of `tx.lifecycle.extract.fsd` / `.asd` / `.ssd`, weighted by the time each takes (the copy is most of it). */
export const EXTRACT_PROGRESS_PHASES = [
	{ key: 'header', label: 'Starting the file…', weight: 1 },
	{ key: 'copy', label: 'Copying the scope…', weight: 15 },
	{ key: 'identity', label: 'Linking copied elements…', weight: 3 },
	{ key: 'cleanup', label: 'Cleaning up…', weight: 1 },
] as const satisfies readonly ProgressPhase<string>[]

/** The phases of `tx.lifecycle.extract.ied`, weighted by the time each takes (the write is most of it). */
export const IED_EXTRACT_PROGRESS_PHASES = [
	{ key: 'check', label: 'Checking the IED…', weight: 1 },
	{ key: 'read', label: 'Reading the IED…', weight: 4 },
	{ key: 'write', label: 'Writing the export…', weight: 15 },
] as const satisfies readonly ProgressPhase<string>[]
