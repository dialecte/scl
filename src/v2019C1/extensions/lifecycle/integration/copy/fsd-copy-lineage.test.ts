import { applyCopy, ref } from './copy-helpers'
import instancesXml from './fixtures/instances-of-templates.xml?raw'
import fsdXml from './fixtures/the-templates-fsd.xml?raw'

import { describe, expect } from 'vitest'

import { openSclDocument, runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { SclTest } from '@/v2019C1/test'

// instances-of-templates.xml: S1/VL1/B1 holds F1, an instance of the FSD's function (fsd-f), its SF1 (fsd-sf) and XCBR1
// (fsd-ln); T1, an instance of another template's function (other-f). the-templates-fsd.xml: that FSD.

const F1 = ref('Function', 'f1')
const B1 = ref('Bay', 'b1')

// A copy of an instance is another instance of its template: every element keeps its lineage as copied, wherever it is
// pasted, with a uuid of its own.
describe('fsd copy - the lineage as copied', () => {
	type LineageCase = SclTest.BaseXmlTestCase & { copy: CopyCase }

	const testCases: SclTest.TestCases<LineageCase> = {
		// F1, SF1 and XCBR1 carry the FSD's uuids as their templateUuid
		'F1 beside itself in B1 → F1_1 and what it holds carry their templateUuid as copied, every uuid their own':
			{
				sourceXml: instancesXml,
				copy: { verb: 'fsd', ref: F1, anchor: B1 },
				expectedQueries: [
					'//default:Function[@name="F1_1"][@templateUuid="fsd-f"]/default:SubFunction[@templateUuid="fsd-sf"]/default:LNode[@templateUuid="fsd-ln"]',
				],
				unexpectedQueries: [
					'//default:Function[@name="F1_1"]/descendant-or-self::*[@uuid="f1" or @uuid="sf1" or @uuid="ln1"]',
				],
			},
		// pasted under a function of another template it becomes its subfunction, its lineage still as copied
		'F1 under T1 → a subfunction of T1 carrying its lineage as copied, and so does what it holds': {
			sourceXml: instancesXml,
			copy: { verb: 'fsd', ref: F1, anchor: ref('Function', 't1') },
			expectedQueries: [
				'//default:Function[@name="T1"]/default:SubFunction[@name="F1"][@templateUuid="fsd-f"]/default:SubFunction[@templateUuid="fsd-sf"]/default:LNode[@templateUuid="fsd-ln"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<LineageCase>): Promise<SclTest.ActResult> {
		await expect(applyCopy({ document: source, copy: testCase.copy })).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The copy is an instance the template's update reaches: a report of the FSD over B1 lists the original and the copy.
describe('fsd copy - an instance the update of its template reaches', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// F1 is an instance of the FSD opened beside it
		'F1 copied beside itself, then the FSD reported over B1 → two instances, F1 and F1_1': {
			sourceXml: instancesXml,
		},
	}

	async function act({
		source,
		project,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		const fsd = await openSclDocument({ project, xml: fsdXml, label: 'the-templates' })
		const listed = applyCopy({ document: source, copy: { verb: 'fsd', ref: F1, anchor: B1 } }).then(
			async function thenReportTheTemplate(copied) {
				const report = await source.query.lifecycle.report({
					verb: 'fsd',
					sourceQuery: fsd.query,
					ref: ref('Function', 'fsd-f'),
					anchor: B1,
					scenario: 'template',
				})
				return { copied, instances: report.instances.map((instance) => instance.title).sort() }
			},
		)
		await expect(listed).resolves.toEqual({ copied: 'committed', instances: ['F1', 'F1_1'] })
	}

	runSclTestCases.withoutExport({ testCases, act })
})
