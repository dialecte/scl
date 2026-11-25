import applicationNamingF1 from './fixtures/application-naming-f1-and-a-variable-of-f3.xml?raw'
import cidRealIedBesideAnother from './fixtures/cid-real-ied-beside-another.xml?raw'
import selectedIedWithSelfReferences from './fixtures/selected-ied-with-self-references.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import {
	EXTRACT_PROGRESS_PHASES,
	IED_EXTRACT_PROGRESS_PHASES,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.constants'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'
import { recordProgress, summarizeProgress } from '@/v2019C1/test/record-progress'

import type { Config, Scl } from '@/v2019C1/config'
import type { ProgressPhase } from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.types'
import type * as Core from '@dialecte/core'

const emptyTargetXml = /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="root"/>`

/** One extract entry, run on the first element of its scope's tag in the source. */
type ExtractCase = {
	sourceXml: string
	phases: readonly ProgressPhase<string>[]
	scopeTag: 'Bay' | 'Function' | 'Application' | 'IED'
	extract: (
		tx: Scl.Transaction,
		params: { sourceQuery: Core.Query<Config>; scope: Scl.Ref<Scl.ElementsOf> },
	) => Promise<unknown>
}

const CASES: Record<string, ExtractCase> = {
	ssd: {
		// a bay holding a function and an application composing it: the copy clones a frame, types and satellites
		sourceXml: applicationNamingF1,
		phases: EXTRACT_PROGRESS_PHASES,
		scopeTag: 'Bay',
		extract: async function extractSsd(tx, { sourceQuery, scope }) {
			return await tx.lifecycle.extract.ssd({
				sourceQuery,
				scopeRef: scope as Scl.Ref<'Bay'>,
				tool: 'TEST',
				who: 'test',
			})
		},
	},
	fsd: {
		// a bay holding a function and an application composing it: the copy clones a frame, types and satellites
		sourceXml: applicationNamingF1,
		phases: EXTRACT_PROGRESS_PHASES,
		scopeTag: 'Function',
		extract: async function extractFsd(tx, { sourceQuery, scope }) {
			return await tx.lifecycle.extract.fsd({
				sourceQuery,
				functionRef: scope as Scl.Ref<'Function'>,
				tool: 'TEST',
				who: 'test',
			})
		},
	},
	asd: {
		// a bay holding a function and an application composing it: the copy clones a frame, types and satellites
		sourceXml: applicationNamingF1,
		phases: EXTRACT_PROGRESS_PHASES,
		scopeTag: 'Application',
		extract: async function extractAsd(tx, { sourceQuery, scope }) {
			return await tx.lifecycle.extract.asd({
				sourceQuery,
				applicationRef: scope as Scl.Ref<'Application'>,
				tool: 'TEST',
				who: 'test',
			})
		},
	},
	ied: {
		// one specification IED with its types and its own control blocks: the write clones the IED and its type closure
		sourceXml: selectedIedWithSelfReferences,
		phases: IED_EXTRACT_PROGRESS_PHASES,
		scopeTag: 'IED',
		extract: async function extractIed(tx, { sourceQuery, scope }) {
			return await tx.lifecycle.extract.ied({
				sourceQuery,
				iedRef: scope as Scl.Ref<'IED'>,
				fileType: 'ISD',
				kind: 'instance',
				inputs: 'none',
				issuer: 'TEST_ISSUER',
				tool: 'TEST',
				who: 'test',
			})
		},
	},
	cid: {
		// an implemented IED beside another: the CID path reads and writes the selected one
		sourceXml: cidRealIedBesideAnother,
		phases: IED_EXTRACT_PROGRESS_PHASES,
		scopeTag: 'IED',
		extract: async function extractCid(tx, { sourceQuery }) {
			return await tx.lifecycle.extract.ied({
				sourceQuery,
				fileType: 'CID',
				iedRef: { tagName: 'IED', id: 'selected-ied' } as Scl.Ref<'IED'>,
				interactingIeds: 'none',
				tool: 'TEST',
				who: 'test',
			})
		},
	},
}

function labelsOf(params: { phases: readonly ProgressPhase<string>[] }): string[] {
	return params.phases.map(function labelOf(phase) {
		return phase.label
	})
}

/** The captions of the extract's own phases, each once in the order shown, the nested ops' captions left out. */
function phaseLabels(params: {
	labels: string[]
	phases: readonly ProgressPhase<string>[]
}): string[] {
	const own = new Set(labelsOf({ phases: params.phases }))
	return params.labels.filter(function isNewPhase(label, index, labels) {
		const before = labels.slice(0, index).findLast(function isPhase(earlier) {
			return own.has(earlier)
		})
		return own.has(label) && label !== before
	})
}

async function openExtract(params: { extractCase: ExtractCase }) {
	const { source, target } = await createSclTestProject({
		sourceXml: params.extractCase.sourceXml,
		targetXml: emptyTargetXml,
	})
	if (!target) throw new Error('target required')
	const sourceQuery = source.document.query as Core.Query<Config>
	const [scopeRecord] = await sourceQuery.getRecordsByTagName(params.extractCase.scopeTag)
	const scope = { tagName: scopeRecord.tagName, id: scopeRecord.id } as Scl.Ref<Scl.ElementsOf>
	return { document: target.document, sourceQuery, scope }
}

describe('tx.lifecycle.extract - one progress plan, forward only', () => {
	for (const [entry, extractCase] of Object.entries(CASES)) {
		it(`extract.${entry} in prepare → one main plan, never backward nor reset, the phases in order, null after`, async () => {
			const { document, sourceQuery, scope } = await openExtract({ extractCase })
			const recording = recordProgress({ document })
			const prepared = await document.prepare(async function extract(tx) {
				await extractCase.extract(tx, { sourceQuery, scope })
			})
			recording.stop()
			prepared.discard()
			const summary = summarizeProgress({ values: recording.values() })

			expect(summary.resets).toBe(0)
			expect(summary.backward).toBe(0)
			expect(phaseLabels({ labels: summary.labels, phases: extractCase.phases })).toEqual(
				labelsOf({ phases: extractCase.phases }),
			)
			// the clones and type imports show as the sub-bar
			expect(summary.steps).toBe(true)
			expect(summary.bars.at(-1)).toBe(1)
			expect(document.state.progress).toBeNull()
		})

		it(`extract.${entry} in a transaction → the extract's plan never backward nor reset, then the commit's own plan, null after`, async () => {
			const { document, sourceQuery, scope } = await openExtract({ extractCase })
			const recording = recordProgress({ document })
			await document.transaction(async function extract(tx) {
				await extractCase.extract(tx, { sourceQuery, scope })
			})
			recording.stop()
			const summary = summarizeProgress({ values: recording.values() })

			expect(summary.resets).toBe(1)
			expect(summary.backward).toBe(1)
			expect(document.state.progress).toBeNull()
		})
	}

	it('extract.ied of an IED the source does not hold, caught in the prepare body → refused, progress null once caught', async () => {
		const { document, sourceQuery } = await openExtract({ extractCase: CASES.ied })
		let refusal: unknown
		let afterCatch: unknown = 'not read'
		const prepared = await document.prepare(async function extract(tx) {
			try {
				await CASES.ied.extract(tx, {
					sourceQuery,
					scope: { tagName: 'IED', id: 'not-held' } as Scl.Ref<Scl.ElementsOf>,
				})
			} catch (error) {
				refusal = toDialecteError(error)
			}
			afterCatch = document.state.progress
		})
		prepared.discard()

		expect((refusal as { key?: string } | undefined)?.key).toBe('ELEMENT_NOT_FOUND')
		expect(afterCatch).toBeNull()
	})
})
