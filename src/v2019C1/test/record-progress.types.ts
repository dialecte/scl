import type * as Core from '@dialecte/core'

/** A document whose progress is recorded: its state and its subscription. */
export type ProgressSource = {
	readonly state: { readonly progress: Core.DocumentProgress }
	readonly subscribe: (callback: (terminal: boolean) => void) => () => void
}

/** What a recording saw, each value as it was when the document told of a change. */
export type ProgressRecording = {
	/** Every value seen, a change of loading included (the same value twice then). */
	values: () => Core.DocumentProgress[]
	/** Stops recording. */
	stop: () => void
}

/** What the bar did over a recording. */
export type ProgressSummary = {
	/** The main bar, `current / total`, of each value shown (`null` left out). */
	bars: number[]
	/** How many times the bar went below its value before. */
	backward: number
	/** How many times the bar left (`null`) and came back. */
	resets: number
	/** The captions, each once in a row. */
	labels: string[]
	/** Whether a nested plan showed as the sub-bar. */
	steps: boolean
	/** The last value seen. */
	last: Core.DocumentProgress | undefined
}
