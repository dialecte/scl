import type { ProgressPhasesParams } from './progress-phases.types'
import type * as Core from '@dialecte/core'

/**
 * Runs `run` inside one progress plan of weighted, labelled phases: the plan has as many steps as the phases weigh,
 * `enter` moves it to the start of a phase (the phases before it completed, one not entered jumped over) and captions
 * it. The plans of the ops run inside a phase (a clone, a type import) nest under it: their progress is the sub-bar,
 * so the main bar only moves forward. Once `run` ends the plan is filled and closed; on a throw it is closed (`endPlan`,
 * in a `finally`) and the error goes on as thrown. A caller's own open plan holds this one nested.
 */
export async function withProgressPhases<GenericKey extends string, GenericResult>(
	tx: { readonly progress: Core.ProgressReporter },
	params: ProgressPhasesParams<GenericKey, GenericResult>,
): Promise<GenericResult> {
	const { phases, run } = params
	// a phase is a whole number of steps, at least one: one of none, or of a fraction, would leave a later phase off its step
	const unweighable = phases.find(function weighsNoWholeStep(phase) {
		return !Number.isInteger(phase.weight) || phase.weight < 1
	})
	if (unweighable) {
		throw new Error(
			`progress phase "${unweighable.key}" weighs ${unweighable.weight}: a whole number of steps, at least 1`,
		)
	}
	const total = phases.reduce(function addWeight(sum, phase) {
		return sum + phase.weight
	}, 0)
	// `nextStep` closes the step before it: after `advances` calls, `advances - 1` steps are completed
	let advances = 0
	let entered = -1

	function advanceTo(target: { completed: number; label?: string }): void {
		while (advances < target.completed) {
			tx.progress.nextStep()
			advances++
		}
		tx.progress.nextStep(target.label)
		advances++
	}

	function enter(key: GenericKey): void {
		const index = phases.findIndex(function isPhase(phase) {
			return phase.key === key
		})
		if (index <= entered) {
			throw new Error(`progress phase "${key}" entered after a later phase, or unknown`)
		}
		entered = index
		const completed = phases.slice(0, index).reduce(function addWeight(sum, phase) {
			return sum + phase.weight
		}, 0)
		advanceTo({ completed, label: phases[index].label })
	}

	tx.progress.plan({ steps: total, label: phases[0]?.label })
	try {
		const result = await run(enter)
		advanceTo({ completed: total })
		return result
	} finally {
		tx.progress.endPlan()
	}
}
