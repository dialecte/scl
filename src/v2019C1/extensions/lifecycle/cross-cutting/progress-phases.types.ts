import type {
	APPLY_PROGRESS_PHASES,
	EXTRACT_PROGRESS_PHASES,
	IED_EXTRACT_PROGRESS_PHASES,
} from './progress-phases.constants'

/** One phase of a progress plan: its key, its caption and its share of the bar (in steps). */
export type ProgressPhase<GenericKey extends string> = {
	key: GenericKey
	label: string
	weight: number
}

/** Moves the plan to the start of a phase and captions it: a phase after the current one only. */
export type EnterPhase<GenericKey extends string> = (key: GenericKey) => void

/** The phases of a plan, in order, and the work that enters them. */
export type ProgressPhasesParams<GenericKey extends string, GenericResult> = {
	phases: readonly ProgressPhase<GenericKey>[]
	run: (enter: EnterPhase<GenericKey>) => Promise<GenericResult>
}

/** A phase of `tx.lifecycle.apply`. */
export type ApplyProgressPhaseKey = (typeof APPLY_PROGRESS_PHASES)[number]['key']

/** A phase of `tx.lifecycle.extract.fsd` / `.asd` / `.ssd`. */
export type ExtractProgressPhaseKey = (typeof EXTRACT_PROGRESS_PHASES)[number]['key']

/** A phase of `tx.lifecycle.extract.ied`. */
export type IedExtractProgressPhaseKey = (typeof IED_EXTRACT_PROGRESS_PHASES)[number]['key']
