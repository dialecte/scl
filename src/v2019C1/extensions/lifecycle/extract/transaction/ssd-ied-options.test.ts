import BayWithIedsXml from './fixtures/ssd-bay-with-ieds.xml?raw'
/// <reference types="vite/client" />
import { ssd } from './ssd'
import { TEMPLATE_IED_SELECTION } from './ssd.constants'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ExtractOptions, ExtractWarning, SsdExtractOptions } from './extract.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`
const bay = { tagName: 'Bay', id: 'q01' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	options?: SsdExtractOptions & ExtractOptions
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
		case 'input-unbound':
		case 'input-removed':
			return `${warning.code} ${warning.source.id}`
		default:
			return warning.code
	}
}

describe('extract.ssd - option values', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fileType SCD given with no real IED carried → an SCD, its addresses kept': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			options: { ieds: TEMPLATE_IED_SELECTION, fileType: 'SCD' },
			fileType: 'SCD',
			warningCodes: ['address-not-carried'],
			warnings: [],
			expectedQueries: [
				'//default:Header[@fileType="SCD"]',
				'//default:ConnectedAP[@iedName="S1"]/default:Address',
			],
		},
		'fileType by-content with no real IED carried → an SSD': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			options: { ieds: TEMPLATE_IED_SELECTION, fileType: 'by-content' },
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			expectedQueries: ['//default:Header[@fileType="SSD"]'],
		},
		'an empty IED list → no IED carried, every bound LNode released': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			options: { ieds: [] },
			fileType: 'SSD',
			warningCodes: ['ied-not-carried'],
			warnings: [
				'ied-not-carried S1 specification full',
				'ied-not-carried R1 implemented full',
				'ied-not-carried HMI specification shared',
			],
			expectedQueries: ['//default:Function/default:LNode[@lnClass="PTOC" and @iedName="None"]'],
			unexpectedQueries: ['//default:IED', '//default:Communication', '//default:LNode[@lnUuid]'],
		},
		'a rule leaving specification IEDs out → only the real IED carried': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			options: { ieds: { specification: 'leave-out', implemented: 'carry', shared: 'carry' } },
			fileType: 'SSD',
			warningCodes: ['ied-not-carried'],
			warnings: [
				'ied-not-carried S1 specification full',
				'ied-not-carried HMI specification shared',
			],
			expectedQueries: ['//default:IED[@name="R1"]'],
			unexpectedQueries: ['//default:IED[@name="S1"]', '//default:IED[@name="HMI"]'],
		},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
