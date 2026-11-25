import { applyCopy, ref } from './copy-helpers'
import functionXml from './fixtures/a-function-to-copy.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase, CopyParams } from './copy-helpers.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// a-function-to-copy.xml: S1/VL1/B1 holds C1 (naming F1), V1 (applying to F1), node L1 and F1 (f1): its behaviour FB naming
// XCBR1 of SF1, its file reference, PTRC1 (ln1, bound to P1, its Block input naming F2's CSWI1), CSWI1 (ln4, bound to
// S_IED), SF1 holding XCBR1 (ln3), its breaker QA1 on L1. B2 holds F2 (CSWI1, ln2); B3 holds nothing.

const F1 = ref('Function', 'f1')
const B1 = ref('Bay', 'b1')
const B2 = ref('Bay', 'b2')

const TO_B2: CopyCase = { verb: 'fsd', ref: F1, anchor: B2 }
const BESIDE_ITSELF: CopyCase = { verb: 'fsd', ref: F1, anchor: B1 }

/** The copy of F1 under B2. */
const COPY_IN_B2 = '//default:Bay[@name="B2"]/default:Function[@name="F1"]'
/** The uuids of F1 and what it holds: none of them is carried by its copy. */
const SOURCE_UUIDS = ['f1', 'sf1', 'ln1', 'ln3', 'ln4']

// A copy is written and committed in the document it is copied in: every element a uuid of its own, the lineage as
// copied, the references inside naming the copy, the original untouched.
describe('fsd copy - the copy written', () => {
	type CopiedCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		decide?: CopyParams['decide']
	}

	const testCases: SclTest.TestCases<CopiedCase> = {
		// F1 holds SF1 (XCBR1) and FB naming XCBR1; B2 holds F2
		'F1 to B2 → copied under B2, every uuid its own, no lineage written, its behaviour naming the copied XCBR1':
			{
				sourceXml: functionXml,
				copy: TO_B2,
				expectedQueries: [
					`${COPY_IN_B2}/default:SubFunction[@name="SF1"]/default:LNode[@lnClass="XCBR"]`,
					`${COPY_IN_B2}//v2019C1:OutputVar[@varName="pos"][@lnodeUuid = ${COPY_IN_B2}/default:SubFunction/default:LNode/@uuid]`,
					'//default:Bay[@name="B1"]/default:Function[@name="F1"][@uuid="f1"]',
				],
				unexpectedQueries: [
					...SOURCE_UUIDS.map((uuid) => `${COPY_IN_B2}/descendant-or-self::*[@uuid="${uuid}"]`),
					`${COPY_IN_B2}/descendant-or-self::*[@templateUuid]`,
				],
			},
		// F1 holds its file reference feeder.fsd; the document has no Header
		'F1 to B2 → its file reference copied as it is, none added, no Header written': {
			sourceXml: functionXml,
			copy: TO_B2,
			expectedQueries: [
				`${COPY_IN_B2}/default:Private/v2019C1:FunctionSclRef/v2019C1:SclFileReference[@fileName="feeder.fsd"][@fileType="FSD"]`,
			],
			unexpectedQueries: [
				`${COPY_IN_B2}/default:Private/v2019C1:FunctionSclRef[2]`,
				'//default:Header',
			],
		},
		// B1 holds F1
		'F1 beside itself in B1 → the copy numbered F1_1, the original kept as F1': {
			sourceXml: functionXml,
			copy: BESIDE_ITSELF,
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="F1_1"]',
				'//default:Bay[@name="B1"]/default:Function[@name="F1"][@uuid="f1"]',
			],
			unexpectedQueries: ['//default:Bay[@name="B1"]/default:Function[@name="F1"][2]'],
		},
		// B2 holds F2 already
		'F1 to B2 renamed F2, a name B2 holds → numbered F2_1, never refused': {
			sourceXml: functionXml,
			copy: TO_B2,
			decide: renameTheCopy('F2'),
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:Function[@name="F2_1"]/default:SubFunction[@name="SF1"]',
				'//default:Bay[@name="B2"]/default:Function[@name="F2"][@uuid="f2"]',
			],
		},
		// C1, in B1, classifies F1
		'F1 to B2 → C1 classifies the copy too: one reference added to it, no second category': {
			sourceXml: functionXml,
			copy: TO_B2,
			expectedQueries: [
				'//v2019C1:FunctionCategory[@uuid="c1"]/v2019C1:FunctionCatRef[@function="S1/VL1/B2/F1"]',
				'//v2019C1:FunctionCategory[@uuid="c1"]/v2019C1:FunctionCatRef[@function="S1/VL1/B1/F1"][@functionUuid="f1"]',
			],
			unexpectedQueries: [
				'(//v2019C1:FunctionCategory)[2]',
				'//v2019C1:FunctionCategory[@uuid="c1"]/v2019C1:FunctionCatRef[3]',
			],
		},
		// V1, in B1, applies to F1
		'F1 to B2 → V1 copied with it, applying to the copy; the original V1 still applies to F1': {
			sourceXml: functionXml,
			copy: TO_B2,
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:Private/v2019C1:Variable[@name="V1"][not(@uuid="v1")]/v2019C1:VariableApplyTo[@element="S1/VL1/B2/F1"][@elementUuid = //default:Bay[@name="B2"]/default:Function[@name="F1"]/@uuid]',
				'//default:Bay[@name="B1"]/default:Private/v2019C1:Variable[@uuid="v1"]/v2019C1:VariableApplyTo[@elementUuid="f1"]',
			],
			unexpectedQueries: ['//default:Bay[@name="B2"]//v2019C1:VariableApplyTo[@elementUuid="f1"]'],
		},
		// V1, in B1, applies to F1; B1 holds V1 already
		'F1 beside itself in B1 → V1 copied as V1_1, applying to F1_1': {
			sourceXml: functionXml,
			copy: BESIDE_ITSELF,
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Private/v2019C1:Variable[@name="V1_1"]/v2019C1:VariableApplyTo[@element="S1/VL1/B1/F1_1"]',
			],
		},
		// F1's Block input names F2's CSWI1; its breaker QA1 sits on B1's L1
		'F1 to B2 → its Block input still names F2 and its breaker the node L1 of B1, as written': {
			sourceXml: functionXml,
			copy: TO_B2,
			expectedQueries: [
				`${COPY_IN_B2}//v2019C1:SourceRef[@input="Block"][@sourceLNodeUuid="ln2"][@source="S1/VL1/B2/F2/CSWI1.Pos"]`,
				`${COPY_IN_B2}/default:ConductingEquipment[@name="QA1"]/default:Terminal[@cNodeUuid="n1"][@connectivityNode="S1/VL1/B1/L1"]`,
			],
		},
		// the committed F1 is copied: the copy under SF1 holds SF1 once, not itself again
		'F1 under its own SF1 → one copy of F1 as it is committed, as a subfunction of SF1': {
			sourceXml: functionXml,
			copy: { verb: 'fsd', ref: F1, anchor: ref('SubFunction', 'sf1') },
			expectedQueries: [
				'//default:Function[@uuid="f1"]/default:SubFunction[@name="SF1"]/default:SubFunction[@name="F1"]/default:SubFunction[@name="SF1"]',
			],
			unexpectedQueries: [
				'//default:SubFunction[@name="F1"]//default:SubFunction[@name="F1"]',
				'//default:Bay[@name="B1"]/default:Function[2]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<CopiedCase>): Promise<SclTest.ActResult> {
		await expect(
			applyCopy({ document: source, copy: testCase.copy, decide: testCase.decide }),
		).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A parent the definition does not let a function sit under is refused before anything is written.
describe('fsd copy - an anchor no function sits under', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase & { copy: CopyCase }> = {
		// XCBR1 (ln3) is an LNode of F1's SF1
		'F1 under the LNode XCBR1 → INVALID_PARENT_CHILD, nothing written': {
			sourceXml: functionXml,
			copy: { verb: 'fsd', ref: F1, anchor: ref('LNode', 'ln3') },
			unexpectedQueries: [
				'//default:LNode/default:Function',
				'//default:LNode/default:SubFunction',
				'(//default:Function[@name="F1"])[2]',
				'//default:SubFunction[@name="F1"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase & { copy: CopyCase }>): Promise<SclTest.ActResult> {
		await expect(applyCopy({ document: source, copy: testCase.copy })).resolves.toBe(
			'INVALID_PARENT_CHILD',
		)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The consumer types a name for the copied function in the report's group placing it. */
function renameTheCopy(name: string): NonNullable<CopyParams['decide']> {
	return function decideTheName(report: DiffReport) {
		const group = report.instances
			.flatMap((instance) => instance.groups)
			.find((candidate) => candidate.primary.tagName === 'Function' && candidate.change === 'added')
		return new Map(group ? [[group.id, { action: 'accept' as const, values: { name } }]] : [])
	}
}
