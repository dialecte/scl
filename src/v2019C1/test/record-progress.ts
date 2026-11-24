import type { ProgressRecording, ProgressSource, ProgressSummary } from './record-progress.types'
import type * as Core from '@dialecte/core'

/**
 * Records the progress a document reports: a copy of `state.progress` each time the document tells of a change (core
 * tells of every progress write, synchronously).
 *
 * @intent assert the progress bar a transaction shows, check a progress plan never moves backward in a test
 */
export function recordProgress(params: { document: ProgressSource }): ProgressRecording {
	const { document } = params
	const values: Core.DocumentProgress[] = []
	const stop = document.subscribe(function noteProgress() {
		values.push(copyProgress({ progress: document.state.progress }))
	})
	return {
		values: function recorded() {
			return [...values]
		},
		stop,
	}
}

/** What the main bar did over recorded values: its fractions, backward moves, resets and captions. */
export function summarizeProgress(params: { values: Core.DocumentProgress[] }): ProgressSummary {
	const bars: number[] = []
	const labels: string[] = []
	let backward = 0
	let resets = 0
	let shownBefore = false
	let previous: Core.DocumentProgress = null
	let steps = false
	for (const value of params.values) {
		if (value === null) {
			previous = null
			continue
		}
		if (previous === null && shownBefore) resets++
		const bar = value.total > 0 ? value.current / value.total : 0
		if (bars.length > 0 && bar < bars[bars.length - 1]) backward++
		bars.push(bar)
		if (labels.at(-1) !== value.label) labels.push(value.label)
		if (value.step) steps = true
		shownBefore = true
		previous = value
	}
	return { bars, backward, resets, labels, steps, last: params.values.at(-1) }
}

function copyProgress(params: { progress: Core.DocumentProgress }): Core.DocumentProgress {
	const { progress } = params
	if (!progress) return null
	return { ...progress, step: progress.step ? { ...progress.step } : null }
}
