import { firstOfClass } from '../build/open-value-rules'
import projectTypeMissing from './fixtures/stage-isd/project-type-missing.xml?raw'
import shell from './fixtures/stage-isd/shell.xml?raw'
import { stageIsd } from './stage-isd'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** Contract: an LNode whose type the project lacks is refused before anything is staged. */
describe('stageIsd - an LNode naming no LNodeType', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'PTRC1 names PTRC_X, a type the project lacks → SPECIFICATION_STAGE_REFUSED type-missing naming PTRC1, nothing written':
			{
				// project-type-missing: as project.xml, PTRC1’s lnType PTRC_X names no LNodeType
				sourceXml: projectTypeMissing,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scratch"/>`,
				expectedQueries: ['/default:SCL[count(*)=0]'],
			},
	}

	async function act({
		project: workspace,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await workspace.importFile(
			new File([shell], 'shell.scd', { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const shellDocument = workspace.openDocument(imported.documentId)
		const refused = await target
			.transaction(async function stage(tx) {
				return stageIsd(tx, {
					sourceQuery: source.query,
					lnodes: ['ptoc1', 'ptrc1', 'lln0'].map((lnode) => ({ tagName: 'LNode', id: lnode })),
					shell: { query: shellDocument.query, ied: { tagName: 'IED', id: 'shell-ied' } },
					iedName: 'R',
					build: { openValues: { lnType: firstOfClass } },
				})
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		const reported = toDialecteError(refused)
		expect({ key: reported?.key, meta: reported?.meta }).toMatchObject({
			key: 'SPECIFICATION_STAGE_REFUSED',
			meta: { reason: 'type-missing', stage: 'stageIsd', ref: { tagName: 'LNode', id: 'ptrc1' } },
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
