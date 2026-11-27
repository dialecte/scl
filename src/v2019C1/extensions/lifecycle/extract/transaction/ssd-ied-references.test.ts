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

describe('extract.ssd - references, communication and addresses of the carried IEDs', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a carried IED input naming an IED not carried → names kept, uuid twins cleared, external-input listed':
			{
				// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
				sourceXml: BayWithIedsXml,
				targetXml: emptyTarget,
				fileType: 'SSD',
				warningCodes: ['external-input'],
				warnings: ['external-input extref-other'],
				expectedQueries: [
					'//default:ExtRef[@iedName="Other" and @ldInst="LD1" and @lnClass="PTOC" and @doName="Op" and not(@lnUuid)]',
					'//default:ExtRef[@iedName="R1" and @lnUuid = //default:IED[@name="R1"]//default:LN[@lnClass="PTOC"]/@uuid]',
				],
			},
		'a carried IED client list naming an IED not carried → removed, ied-reference-left-out': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			fileType: 'SSD',
			options: { ieds: TEMPLATE_IED_SELECTION },
			warningCodes: ['ied-reference-left-out'],
			warnings: ['ied-reference-left-out clientln-hmi', 'ied-reference-left-out iedname-hmi'],
			unexpectedQueries: ['//default:ClientLN[@iedName="HMI"]', '//default:IEDName[.="HMI"]'],
		},
		'default addresses → Address of ConnectedAP, GSE and SMV dropped, address-not-carried listed': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			fileType: 'SSD',
			warningCodes: ['address-not-carried'],
			warnings: [
				'address-not-carried cap-s1',
				'address-not-carried gse-s1',
				'address-not-carried cap-r1',
				'address-not-carried cap-hmi',
			],
			expectedQueries: ['//default:ConnectedAP[@iedName="S1"]/default:GSE[@cbName="G1"]'],
			unexpectedQueries: ['//default:ConnectedAP/default:Address', '//default:GSE/default:Address'],
		},
		'addresses keep → Address kept': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			fileType: 'SSD',
			options: { addresses: 'keep' },
			warningCodes: ['address-not-carried'],
			warnings: [],
			expectedQueries: [
				'//default:ConnectedAP[@iedName="S1"]/default:Address/default:P[@type="IP" and .="10.0.0.1"]',
				'//default:GSE[@cbName="G1"]/default:Address/default:P[@type="APPID"]',
			],
		},
		'two carried IEDs on one SubNetwork → one SubNetwork holding both access points, a SubNetwork with no carried access point left out':
			{
				// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
				sourceXml: BayWithIedsXml,
				targetXml: emptyTarget,
				fileType: 'SSD',
				warningCodes: [],
				warnings: [],
				expectedQueries: [
					'/default:SCL/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][default:ConnectedAP[@iedName="S1"]][default:ConnectedAP[@iedName="R1"]]',
				],
				unexpectedQueries: [
					'//default:SubNetwork[@name="ProcessBus"]',
					'//default:ConnectedAP[@iedName="Other"]',
				],
			},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
