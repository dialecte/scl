import BayWithIedsXml from './fixtures/ssd-bay-with-ieds.xml?raw'
/// <reference types="vite/client" />
import { ssd } from './ssd'
import { TEMPLATE_IED_SELECTION } from './ssd.constants'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ExtractWarning, SsdExtractOptions } from './extract.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`
const bay = { tagName: 'Bay', id: 'q01' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	options?: SsdExtractOptions
	/** The warnings of the codes listed in `warningCodes`, described as `<code> <what>`. */
	warnings: string[]
	/** Codes as written by the extract, including retired ones a case proves absent. */
	warningCodes: readonly string[]
	fileType: 'SSD' | 'SCD'
}

async function act({
	source,
	target,
	testCase,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	const result = await target.transaction(async function extractBay(tx) {
		return ssd(tx, {
			sourceQuery: source.query,
			scopeRef: bay,
			tool: 'TEST',
			who: 'test',
			...testCase.options,
		})
	})
	const codes = new Set<string>(testCase.warningCodes)
	const described = result.warnings
		.filter((warning) => codes.has(warning.code))
		.map(describeWarning)
	expect({ fileType: result.fileType, warnings: described.sort() }).toEqual({
		fileType: testCase.fileType,
		warnings: [...testCase.warnings].sort(),
	})
	return { assertOn: 'target' }
}

/** A warning as `<code> <what it names>`. */
function describeWarning(warning: ExtractWarning): string {
	switch (warning.code) {
		case 'ied-not-carried':
			return `${warning.code} ${warning.name} ${warning.kind} ${warning.assignment}`
		case 'external-input':
		case 'address-not-carried':
		case 'ied-reference-left-out':
			return `${warning.code} ${warning.source.id}`
		default:
			return warning.code
	}
}

describe('extract.ssd - LNodes of the frame', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a frame LNode under equipment bound to a carried IED with data → written bound with its data':
			{
				// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
				sourceXml: BayWithIedsXml,
				targetXml: emptyTarget,
				fileType: 'SSD',
				warningCodes: [],
				warnings: [],
				expectedQueries: [
					'//default:ConductingEquipment[@name="QA1"]/default:LNode[@iedName="S1" and @lnClass="XCBR" and @lnUuid = //default:IED[@name="S1"]//default:LN[@lnClass="XCBR"]/@uuid]/default:Private/v2019C1:DOS[@name="Pos"]',
					'//default:DataTypeTemplates/default:LNodeType[@id="XCBR_Type"]',
				],
			},
		'a frame LNode bound to an IED not carried → written released': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			options: { ieds: TEMPLATE_IED_SELECTION },
			expectedQueries: [
				'//default:ConductingEquipment[@name="QA1"]/default:LNode[@lnClass="XCBR" and @iedName="None" and not(@lnUuid)]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="R1"]'],
		},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
