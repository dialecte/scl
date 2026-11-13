import { IMPORT_PROGRESS_INTERVAL_MS } from '@dialecte/core'

import type { ImportStepProgress } from './import-step-progress.types'
import type { SclImportStep } from '@/v2019C1/constants/import-steps.types'
import type { AfterImportContext, ImportStepReport } from '@dialecte/core'

/**
 * The steps of one `afterImport`, told through `context`. A long step tells its count once per
 * `IMPORT_PROGRESS_INTERVAL_MS` (the interval core keeps reports at) and, on the same clock, lets the queue run: an
 * abort sent while the step runs lands between two chunks, and the step throws it. Without a context the steps run
 * as they did: nothing told, nothing waited for.
 */
export function createImportStepProgress(params: {
	context: AfterImportContext | undefined
}): ImportStepProgress {
	const { context } = params

	function tell(report: ImportStepReport): void {
		context?.report(report)
	}

	function checkAbort(): void {
		context?.signal.throwIfAborted()
	}

	async function run<Result>(params: {
		step: SclImportStep
		total?: number
		run: () => Result | Promise<Result>
	}): Promise<Result> {
		const { step, total } = params
		checkAbort()
		tell(total === undefined ? { step } : { step, done: 0, total })
		const result = await params.run()
		if (total !== undefined) tell({ step, done: total, total })
		return result
	}

	async function each<Item>(params: {
		step: SclImportStep
		items: Iterable<Item>
		total: number
		visit: (item: Item) => void | Promise<void>
	}): Promise<void> {
		const { step, items, total, visit } = params
		checkAbort()
		tell({ step, done: 0, total })
		let done = 0
		let toldDone = 0
		let toldAt = performance.now()
		for (const item of items) {
			const visiting = visit(item)
			if (visiting) await visiting
			done++
			if (!context || performance.now() - toldAt < IMPORT_PROGRESS_INTERVAL_MS) continue
			tell({ step, done, total })
			toldDone = done
			await yieldToQueue()
			checkAbort()
			toldAt = performance.now()
		}
		// the last count once: unless the last chunk already told it (a step of no item has told its 0)
		if (done > 0 && toldDone !== done) tell({ step, done, total })
	}

	return { run, each }
}

/**
 * Let the realm's queue run (an abort sent to the worker) before going on: a macrotask through a `MessageChannel`,
 * with no timer clamp. Exists in pages, workers and Node.
 */
function yieldToQueue(): Promise<void> {
	return new Promise(function waitForTurn(resolve) {
		const channel = new MessageChannel()
		channel.port1.addEventListener('message', function resume() {
			channel.port1.close()
			resolve()
		})
		channel.port1.start()
		channel.port2.postMessage(null)
	})
}
