import { withProgressPhases } from './progress-phases'

import { describe, expect, it } from 'vitest'

import { ALL_XMLNS_NAMESPACES, createSclTestProject } from '@/v2019C1/test'
import { recordProgress, summarizeProgress } from '@/v2019C1/test/record-progress'

import type { ProgressPhase } from './progress-phases.types'

const sourceXml = /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Header id="phases"/></SCL>`

type Key = 'first' | 'middle' | 'last'

const PHASES: readonly ProgressPhase<Key>[] = [
	{ key: 'first', label: 'First…', weight: 1 },
	{ key: 'middle', label: 'Middle…', weight: 3 },
	{ key: 'last', label: 'Last…', weight: 1 },
]

describe('withProgressPhases - one plan of weighted, labelled phases', () => {
	it('phases with nested plans between them → the main bar only moves forward to its total, each phase captioned, the nested plan as the sub-bar, null after', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const recording = recordProgress({ document: source.document })
		const prepared = await source.document.prepare(async function body(tx) {
			await withProgressPhases(tx, {
				phases: PHASES,
				run: async function phases(enter) {
					enter('first')
					tx.progress.plan({ steps: 2 })
					tx.progress.nextStep()
					tx.progress.nextStep()
					tx.progress.endPlan()
					enter('middle')
					tx.progress.plan({ steps: 2, label: 'Nested…' })
					tx.progress.nextStep()
					tx.progress.endPlan()
					enter('last')
				},
			})
		})
		prepared.discard()
		recording.stop()
		const summary = summarizeProgress({ values: recording.values() })

		expect(summary.backward).toBe(0)
		expect(summary.resets).toBe(0)
		expect(summary.labels).toEqual(['First…', 'Middle…', 'Nested…', 'Middle…', 'Last…'])
		expect(summary.steps).toBe(true)
		expect(summary.bars).toContain(1 / 5)
		expect(summary.bars).toContain(4 / 5)
		expect(summary.bars.at(-1)).toBe(1)
		expect(source.document.state.progress).toBeNull()
	})

	it('a phase not entered → jumped over, the bar still forward', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const recording = recordProgress({ document: source.document })
		const prepared = await source.document.prepare(async function body(tx) {
			await withProgressPhases(tx, {
				phases: PHASES,
				run: async function phases(enter) {
					enter('first')
					enter('last')
				},
			})
		})
		prepared.discard()
		recording.stop()
		const summary = summarizeProgress({ values: recording.values() })

		expect(summary.backward).toBe(0)
		expect(summary.labels).toEqual(['First…', 'Last…'])
		expect(summary.bars).toContain(4 / 5)
		expect(source.document.state.progress).toBeNull()
	})

	it('a phase entered after a later one → refused, progress null after', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const preparing = source.document.prepare(async function body(tx) {
			await withProgressPhases(tx, {
				phases: PHASES,
				run: async function phases(enter) {
					enter('middle')
					enter('first')
				},
			})
		})

		await expect(preparing).rejects.toThrow('first')
		expect(source.document.state.progress).toBeNull()
	})

	it('a phase weighing nothing → refused before any plan, progress null after', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const preparing = source.document.prepare(async function body(tx) {
			await withProgressPhases(tx, {
				phases: [...PHASES, { key: 'empty', label: 'Empty…', weight: 0 }],
				run: async function phases() {},
			})
		})

		await expect(preparing).rejects.toThrow('"empty" weighs 0')
		expect(source.document.state.progress).toBeNull()
	})

	it('a phase weighing a fraction of a step → refused before any plan, progress null after', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const preparing = source.document.prepare(async function body(tx) {
			await withProgressPhases(tx, {
				phases: [...PHASES, { key: 'half', label: 'Half…', weight: 1.5 }],
				run: async function phases() {},
			})
		})

		await expect(preparing).rejects.toThrow('"half" weighs 1.5')
		expect(source.document.state.progress).toBeNull()
	})

	it('a throw from the work caught in the prepare body → the error caught, progress null once caught', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const thrown = new Error('refused inside the phases')
		let caught: unknown
		let afterCatch: unknown = 'not read'
		const prepared = await source.document.prepare(async function body(tx) {
			try {
				await withProgressPhases(tx, {
					phases: PHASES,
					run: async function phases(enter) {
						enter('middle')
						throw thrown
					},
				})
			} catch (error) {
				caught = error
			}
			afterCatch = source.document.state.progress
		})
		prepared.discard()

		expect(caught).toBe(thrown)
		expect(afterCatch).toBeNull()
	})

	it('a throw from the work caught under a caller plan → the caller plan back on top as it was', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		let afterCatch: unknown = 'not read'
		const prepared = await source.document.prepare(async function body(tx) {
			tx.progress.plan({ steps: 2, label: 'Caller…' })
			tx.progress.nextStep()
			try {
				await withProgressPhases(tx, {
					phases: PHASES,
					run: async function phases(enter) {
						enter('last')
						throw new Error('refused inside the phases')
					},
				})
			} catch {
				// the caller goes on
			}
			afterCatch = source.document.state.progress
			tx.progress.endPlan()
		})
		prepared.discard()

		expect(afterCatch).toEqual({ current: 0, total: 2, label: 'Caller…', step: null })
	})

	it('a throw between nested plans, under prepare → the same error, progress null after', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const thrown = new Error('refused between phases')
		const preparing = source.document.prepare(async function body(tx) {
			await withProgressPhases(tx, {
				phases: PHASES,
				run: async function phases(enter) {
					enter('first')
					throw thrown
				},
			})
		})

		await expect(preparing).rejects.toThrow(thrown.message)
		expect(source.document.state.progress).toBeNull()
	})

	it('a nested plan whose op throws, under prepare → the same error, progress null after (core 0.15: prepare clears progress on a throw)', async () => {
		const { source } = await createSclTestProject({ sourceXml })
		const thrown = new Error('refused inside a nested op')
		const preparing = source.document.prepare(async function body(tx) {
			await withProgressPhases(tx, {
				phases: PHASES,
				run: async function phases(enter) {
					enter('first')
					// a nested op that opened its plan, then threw before closing it
					tx.progress.plan({ steps: 3, label: 'Nested…' })
					tx.progress.nextStep()
					throw thrown
				},
			})
		})

		await expect(preparing).rejects.toThrow(thrown.message)
		expect(source.document.state.progress).toBeNull()
	})
})
