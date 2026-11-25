import { applyCopy, ref } from './copy-helpers'
import applicationsXml from './fixtures/applications-to-copy.xml?raw'
import instancesXml from './fixtures/instances-of-templates.xml?raw'
import asdXml from './fixtures/the-templates-asd.xml?raw'

import { describe, expect } from 'vitest'

import { openSclDocument, runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { SclTest } from '@/v2019C1/test'

// applications-to-copy.xml: S1/VL1/B1 holds the role R allocating F1; A1 composing F1 (ROOT, also naming V2) and F2 (SUB),
// allocated to R; V2 applying to F1; F1, F2, F3. B2 holds nothing. VL1 itself: A3 composing H1, which sits under VL1.
// instances-of-templates.xml: A1 (asd-a, first placed from first-a) composing G1 (asd-g); the-templates-asd.xml: that ASD.

const A1 = ref('Application', 'a1')
const B1 = ref('Bay', 'b1')
const B2 = ref('Bay', 'b2')

/** The copy of A1 in B2. */
const A1_IN_B2 = '//default:Bay[@name="B2"]/default:Private/v2019C1:Application[@name="A1"]'

// An application is copied with every function it composes, all of them pasted under the anchor; what the copy names
// inside names the copies, a role outside is reused, the originals untouched.
describe('asd copy - the copy written', () => {
	type CopiedCase = SclTest.BaseXmlTestCase & { copy: CopyCase }

	const testCases: SclTest.TestCases<CopiedCase> = {
		// A1 composes F1 and F2, both in B1; B2 holds nothing
		'A1 to B2 → A1 in B2 composing copies of F1 and F2 under B2, each its own uuid; the originals untouched':
			{
				sourceXml: applicationsXml,
				copy: { verb: 'asd', ref: A1, anchor: B2 },
				expectedQueries: [
					`${A1_IN_B2}[not(@uuid="a1")]`,
					'//default:Bay[@name="B2"]/default:Function[@name="F1"][not(@uuid="f1")]/default:LNode[not(@uuid="ln1")]',
					'//default:Bay[@name="B2"]/default:Function[@name="F2"][not(@uuid="f2")]',
					`${A1_IN_B2}//v2019C1:FunctionRef[@function="S1/VL1/B2/F1"][@functionUuid = //default:Bay[@name="B2"]/default:Function[@name="F1"]/@uuid]`,
					`${A1_IN_B2}//v2019C1:FunctionRef[@function="S1/VL1/B2/F2"][@functionUuid = //default:Bay[@name="B2"]/default:Function[@name="F2"]/@uuid]`,
					'//default:Bay[@name="B1"]/default:Private/v2019C1:Application[@uuid="a1"]//v2019C1:FunctionRef[@functionUuid="f1"]',
				],
				unexpectedQueries: [
					`${A1_IN_B2}//v2019C1:FunctionRef[@functionUuid="f1" or @functionUuid="f2"]`,
				],
			},
		// R, outside A1, allocates F1; A1 is allocated to R
		'A1 to B2 → R reused, allocating the copy of F1 too; no second role': {
			sourceXml: applicationsXml,
			copy: { verb: 'asd', ref: A1, anchor: B2 },
			expectedQueries: [
				'//v2019C1:AllocationRole[@uuid="r"]/v2019C1:FunctionRef[@function="S1/VL1/B2/F1"][@functionUuid = //default:Bay[@name="B2"]/default:Function[@name="F1"]/@uuid]',
				'//v2019C1:AllocationRole[@uuid="r"]/v2019C1:FunctionRef[@functionUuid="f1"]',
				`${A1_IN_B2}/v2019C1:AllocationRoleRef[@allocationRoleUuid="r"]`,
			],
			unexpectedQueries: [
				'(//v2019C1:AllocationRole)[2]',
				'//v2019C1:AllocationRole[@uuid="r"]/v2019C1:FunctionRef[3]',
			],
		},
		// V2 applies to F1 and A1's ROOT names it
		'A1 to B2 → V2, which ROOT names, copied applying to the copy of F1, named by the copy of A1': {
			sourceXml: applicationsXml,
			copy: { verb: 'asd', ref: A1, anchor: B2 },
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:Private/v2019C1:Variable[@name="V2"][not(@uuid="v2")]/v2019C1:VariableApplyTo[@element="S1/VL1/B2/F1"]',
				`${A1_IN_B2}//v2019C1:VariableRef[@variableUuid = //default:Bay[@name="B2"]/default:Private/v2019C1:Variable[@name="V2"]/@uuid]`,
				'//default:Bay[@name="B1"]/default:Private/v2019C1:Variable[@uuid="v2"]/v2019C1:VariableApplyTo[@elementUuid="f1"]',
			],
		},
		// B1 holds A1, F1 and F2 already
		'A1 beside itself in B1 → A1_1 composing F1_1 and F2_1, never the originals': {
			sourceXml: applicationsXml,
			copy: { verb: 'asd', ref: A1, anchor: B1 },
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Private/v2019C1:Application[@name="A1_1"]//v2019C1:FunctionRef[@function="S1/VL1/B1/F1_1"]',
				'//default:Bay[@name="B1"]/default:Private/v2019C1:Application[@name="A1_1"]//v2019C1:FunctionRef[@function="S1/VL1/B1/F2_1"]',
				'//default:Bay[@name="B1"]/default:Function[@name="F1_1"]',
				'//default:Bay[@name="B1"]/default:Function[@name="F2_1"]',
			],
			unexpectedQueries: [
				'//v2019C1:Application[@name="A1_1"]//v2019C1:FunctionRef[@functionUuid="f1" or @functionUuid="f2"]',
			],
		},
		// H1 sits under VL1, its one parent: the copy lands under the anchor itself
		'A3 to B2 → H1 copied under B2 itself, A3 in the Private of B2': {
			sourceXml: applicationsXml,
			copy: { verb: 'asd', ref: ref('Application', 'a3'), anchor: B2 },
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:Function[@name="H1"][not(@uuid="h1")]',
				'//default:Bay[@name="B2"]/default:Private/v2019C1:Application[@name="A3"]//v2019C1:FunctionRef[@function="S1/VL1/B2/H1"]',
			],
			unexpectedQueries: ['//default:VoltageLevel[@name="VL1"]/default:Function[2]'],
		},
		// A1 (asd-a, first-a) composes G1 (asd-g), both instances of the ASD
		'A1 of an ASD beside itself → A1_1 and G1_1 carry their lineage as copied': {
			sourceXml: instancesXml,
			copy: { verb: 'asd', ref: A1, anchor: B1 },
			expectedQueries: [
				'//v2019C1:Application[@name="A1_1"][@templateUuid="asd-a"][@originUuid="first-a"][not(@uuid="a1")]',
				'//default:Function[@name="G1_1"][@templateUuid="asd-g"]/default:LNode[@templateUuid="asd-gln"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<CopiedCase>): Promise<SclTest.ActResult> {
		await expect(applyCopy({ document: source, copy: testCase.copy })).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The copy of an application of an ASD is an instance the update of that ASD reaches.
describe('asd copy - an instance the update of its template reaches', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// A1 (asd-a) composes G1 in B1; the ASD is opened beside it
		'A1 copied beside itself, then the ASD reported over B1 → two instances, A1 and A1_1': {
			sourceXml: instancesXml,
		},
	}

	async function act({
		source,
		project,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		const asd = await openSclDocument({ project, xml: asdXml, label: 'the-templates' })
		const listed = applyCopy({ document: source, copy: { verb: 'asd', ref: A1, anchor: B1 } }).then(
			async function thenReportTheTemplate(copied) {
				const report = await source.query.lifecycle.report({
					verb: 'asd',
					sourceQuery: asd.query,
					ref: ref('Application', 'asd-a'),
					anchor: B1,
					scenario: 'template',
				})
				const applications = report.instances.filter(
					(instance) => instance.tree.tagName === 'Application',
				)
				return { copied, instances: applications.map((instance) => instance.title).sort() }
			},
		)
		await expect(listed).resolves.toEqual({ copied: 'committed', instances: ['A1', 'A1_1'] })
	}

	runSclTestCases.withoutExport({ testCases, act })
})
