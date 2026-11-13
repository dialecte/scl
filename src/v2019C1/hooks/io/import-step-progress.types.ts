import type { SclImportStep } from '@/v2019C1/constants/import-steps.types'

/**
 * How `afterImport` tells its steps: each through the context core hands it, the abort checked as each starts and
 * between the chunks of a long one. Without a context, nothing is told and nothing waits.
 */
export type ImportStepProgress = {
	/**
	 * A step run at once: checks the abort, tells `done: 0` out of `total` (the step alone when it has no count), runs
	 * it, then tells `done: total`.
	 */
	run<Result>(params: {
		step: SclImportStep
		total?: number
		run: () => Result | Promise<Result>
	}): Promise<Result>
	/**
	 * A step visiting `items`, `total` of them: checks the abort, tells `done: 0`, then once per core's progress
	 * interval tells how many are done, lets the queue run (the abort can land) and checks the abort; tells
	 * `done: total` at the end.
	 */
	each<Item>(params: {
		step: SclImportStep
		items: Iterable<Item>
		total: number
		visit: (item: Item) => void | Promise<void>
	}): Promise<void>
}
