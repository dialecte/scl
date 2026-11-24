import isdTemplate from '../integration/ied/fixtures/isd-template-of-a-bay-controller.xml?raw'
import projectSouth from '../integration/ied/fixtures/project-south-with-relay-r1-and-bay-q01-to-place-into.xml?raw'
import applicationWithAFunction from './fixtures/application-with-a-function.xml?raw'
import bayWithAFunction from './fixtures/bay-with-a-function.xml?raw'
import functionWithABreaker from './fixtures/function-with-a-breaker.xml?raw'
import projectWithBayB1 from './fixtures/project-with-bay-b1.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { APPLY_PROGRESS_PHASES } from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.constants'
import { createSclTestProject } from '@/v2019C1/test'
import { recordProgress, summarizeProgress } from '@/v2019C1/test/record-progress'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type * as Core from '@dialecte/core'

/** A template placed into a project, and how to name what it places. */
type PlacementCase = {
	templateXml: string
	/** The file name the template is imported under: its extension tells the kind of file. */
	templateFileName: string
	projectXml: string
	target: (params: {
		source: Core.Query<Config>
		project: Core.Query<Config>
	}) => Promise<LifecycleTarget>
}

const bayB1 = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const CASES: Record<string, PlacementCase> = {
	fsd: {
		templateFileName: 'template.fsd',
		templateXml: functionWithABreaker,
		projectXml: projectWithBayB1,
		target: async function fsd({ source }) {
			return {
				verb: 'fsd',
				scenario: 'instantiate',
				sourceQuery: source,
				ref: { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>,
				anchor: bayB1,
			}
		},
	},
	asd: {
		templateFileName: 'template.asd',
		templateXml: applicationWithAFunction,
		projectXml: projectWithBayB1,
		target: async function asd({ source }) {
			return {
				verb: 'asd',
				scenario: 'instantiate',
				sourceQuery: source,
				ref: { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>,
				anchor: bayB1,
			}
		},
	},
	ssd: {
		templateFileName: 'template.ssd',
		templateXml: bayWithAFunction,
		projectXml: projectWithBayB1,
		target: async function ssd({ source }) {
			return {
				verb: 'ssd',
				scenario: 'instantiate',
				sourceQuery: source,
				ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
				anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
			}
		},
	},
	ied: {
		templateFileName: 'template.isd',
		templateXml: isdTemplate,
		projectXml: projectSouth,
		target: async function ied({ source, project }) {
			const [iedRecord] = await source.getRecordsByTagName('IED')
			const root = await project.getRoot()
			return {
				verb: 'ied',
				sourceQuery: source,
				ref: { tagName: 'IED', id: iedRecord.id },
				anchor: { tagName: 'SCL', id: root.id },
			}
		},
	},
}

const PHASE_LABELS = [
	'Checking the report…',
	'Writing the template…',
	'Releasing implementation links…',
]

async function openPlacement(params: { placement: PlacementCase }) {
	const { placement } = params
	const { project, source } = await createSclTestProject({ sourceXml: placement.projectXml })
	const file = new File([placement.templateXml], placement.templateFileName, { type: 'text/xml' })
	// the template keeps the record ids its XML names, as a test fixture does
	const [entry] = await project.import([file], { useCustomRecordsIds: true })
	if (entry.status === 'failed') throw entry.error
	const template = project.openDocument(entry.documentId).query as Core.Query<Config>
	const lifecycle = await placement.target({ source: template, project: source.document.query })
	const report = await source.document.query.lifecycle.report(lifecycle)
	return { document: source.document, lifecycle, report }
}

const APPLY_LABELS = new Set<string>(
	APPLY_PROGRESS_PHASES.map(function labelOf(phase) {
		return phase.label
	}),
)

/** The captions of apply's own phases, each once in the order shown, the nested ops' captions left out. */
function phaseLabels(params: { labels: string[] }): string[] {
	return params.labels.filter(function isNewPhase(label, index, labels) {
		const before = labels.slice(0, index).findLast(function isPhase(earlier) {
			return APPLY_LABELS.has(earlier)
		})
		return APPLY_LABELS.has(label) && label !== before
	})
}

describe('tx.lifecycle.apply - one progress plan, forward only', () => {
	for (const [verb, placement] of Object.entries(CASES)) {
		it(`${verb} placed in prepare → one main plan from the first value to the end, never backward nor reset, the phases in order, null after`, async () => {
			const { document, lifecycle, report } = await openPlacement({ placement })
			const recording = recordProgress({ document })
			const prepared = await document.prepare(async function place(tx) {
				await tx.lifecycle.apply({ ...lifecycle, report })
			})
			recording.stop()
			prepared.discard()
			const summary = summarizeProgress({ values: recording.values() })

			expect(summary.resets).toBe(0)
			expect(summary.backward).toBe(0)
			expect(phaseLabels({ labels: summary.labels })).toEqual(PHASE_LABELS)
			// the clones and type imports show as the sub-bar
			expect(summary.steps).toBe(true)
			expect(summary.bars.at(-1)).toBe(1)
			expect(document.state.progress).toBeNull()
		})

		it(`${verb} placed in a transaction → apply's plan never backward nor reset, then the commit's own plan, null after`, async () => {
			const { document, lifecycle, report } = await openPlacement({ placement })
			const recording = recordProgress({ document })
			await document.transaction(async function place(tx) {
				await tx.lifecycle.apply({ ...lifecycle, report })
			})
			recording.stop()
			const summary = summarizeProgress({ values: recording.values() })

			// the commit runs after the body returns: its plan is the one reset
			expect(summary.resets).toBe(1)
			expect(summary.backward).toBe(1)
			expect(document.state.progress).toBeNull()
		})
	}

	it('fsd placed under a caller plan in the transaction body → apply and the commit nest under it, no reset, null after', async () => {
		const { document, lifecycle, report } = await openPlacement({ placement: CASES.fsd })
		const recording = recordProgress({ document })
		await document.transaction(async function place(tx) {
			tx.progress.plan({ steps: 1, label: 'Placing…' })
			tx.progress.nextStep()
			await tx.lifecycle.apply({ ...lifecycle, report })
		})
		recording.stop()
		const summary = summarizeProgress({ values: recording.values() })

		expect(summary.resets).toBe(0)
		expect(summary.backward).toBe(0)
		expect(document.state.progress).toBeNull()
	})

	it('a report made for another target, in prepare → the same refusal, progress null after', async () => {
		const { document, lifecycle, report } = await openPlacement({ placement: CASES.fsd })
		const functionPlacement = lifecycle as Extract<LifecycleTarget, { verb: 'fsd' }>
		const preparing = document.prepare(async function place(tx) {
			await tx.lifecycle.apply({
				...functionPlacement,
				anchor: { tagName: 'Bay', id: 'not-the-anchor' } as Scl.Ref<'Bay'>,
				report,
			})
		})

		const refusal = await preparing.then(
			function prepared() {
				return undefined
			},
			function refused(error: unknown) {
				return toDialecteError(error)
			},
		)
		expect(refusal?.key).toBe('REPORT_TARGET_MISMATCH')
		expect(document.state.progress).toBeNull()
	})

	it('a report needing decisions and none given, in prepare → the report back, nothing written, progress null after', async () => {
		const { document, lifecycle, report } = await openPlacement({ placement: CASES.fsd })
		// the not-decided track reads the flag only: what the report lists is never reached
		const waiting = { ...report, needsDecisions: true }
		let result: unknown
		const prepared = await document.prepare(async function place(tx) {
			result = await tx.lifecycle.apply({ ...lifecycle, report: waiting })
		})
		const written = prepared.operations.length
		prepared.discard()

		expect(result).toEqual({ report: waiting, instances: { verb: 'fsd', functions: [] } })
		expect(written).toBe(0)
		expect(document.state.progress).toBeNull()
	})

	it('a consumer step that opens a plan and throws, in prepare → the same error, progress null after (core 0.15: prepare clears progress on a throw)', async () => {
		const { document, lifecycle, report } = await openPlacement({ placement: CASES.fsd })
		const thrown = new Error('the consumer step refused')
		const preparing = document.prepare(async function place(tx) {
			await tx.lifecycle.apply({
				...lifecycle,
				report,
				resolution: {
					afterApply: async function refuse(stepTx) {
						stepTx.progress.plan({ steps: 2, label: 'Consumer…' })
						stepTx.progress.nextStep()
						throw thrown
					},
				},
			})
		})

		await expect(preparing).rejects.toThrow(thrown.message)
		expect(document.state.progress).toBeNull()
	})

	it('a consumer step given → its phase captioned after the release', async () => {
		const { document, lifecycle, report } = await openPlacement({ placement: CASES.fsd })
		const recording = recordProgress({ document })
		const prepared = await document.prepare(async function place(tx) {
			await tx.lifecycle.apply({
				...lifecycle,
				report,
				resolution: { afterApply: async function nothing() {} },
			})
		})
		recording.stop()
		prepared.discard()
		const summary = summarizeProgress({ values: recording.values() })

		expect(phaseLabels({ labels: summary.labels })).toEqual([
			...PHASE_LABELS,
			'Running the consumer step…',
		])
		expect(summary.backward).toBe(0)
	})
})
