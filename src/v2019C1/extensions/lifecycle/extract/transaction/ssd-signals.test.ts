import BaySignalsXml from './fixtures/ssd-bay-signals.xml?raw'
/// <reference types="vite/client" />
import { ssd } from './ssd'

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

describe('extract.ssd - signals and addresses of the carried IEDs', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a specified input implemented by an input of a carried IED → its implementation repointed onto the copy':
			{
				// breaker QA1 holds an LNode bound to S whose input is implemented by S's ExtRef and one bound to O implemented by O's; S has an input from O naming O's GOOSE, an output to O, a sampled value control with its address and minimum SCD files
				sourceXml: BaySignalsXml,
				targetXml: emptyTarget,
				options: { ieds: [{ tagName: 'IED', id: 'ied-s' }] },
				fileType: 'SSD',
				warningCodes: [],
				warnings: [],
				expectedQueries: [
					'//v2019C1:SourceRef[@input="TripIn" and @extRefUuid = //default:IED[@name="S"]//default:ExtRef/@uuid]',
				],
			},
		'a specified input implemented by an input of an IED not carried → kept without its implementation':
			{
				// breaker QA1 holds an LNode bound to S whose input is implemented by S's ExtRef and one bound to O implemented by O's; S has an input from O naming O's GOOSE, an output to O, a sampled value control with its address and minimum SCD files
				sourceXml: BaySignalsXml,
				targetXml: emptyTarget,
				options: { ieds: [{ tagName: 'IED', id: 'ied-s' }] },
				fileType: 'SSD',
				warningCodes: [],
				warnings: [],
				expectedQueries: ['//v2019C1:SourceRef[@input="BlockIn" and not(@extRefUuid)]'],
			},
		'an input from an IED not carried naming its control block → the source names kept, the control block names left out':
			{
				// breaker QA1 holds an LNode bound to S whose input is implemented by S's ExtRef and one bound to O implemented by O's; S has an input from O naming O's GOOSE, an output to O, a sampled value control with its address and minimum SCD files
				sourceXml: BaySignalsXml,
				targetXml: emptyTarget,
				options: { ieds: [{ tagName: 'IED', id: 'ied-s' }] },
				fileType: 'SSD',
				warningCodes: ['external-input'],
				warnings: ['external-input extref-from-o', 'external-input extctrl-to-o'],
				expectedQueries: [
					'//default:ExtRef[@iedName="O" and @ldInst="LD1" and @lnClass="GGIO" and @doName="Ind" and @serviceType="GOOSE" and not(@srcLDInst) and not(@srcPrefix) and not(@srcLNClass) and not(@srcCBName)]',
				],
			},
		'an output to an IED not carried → its names kept, its uuid cleared, listed': {
			// breaker QA1 holds an LNode bound to S whose input is implemented by S's ExtRef and one bound to O implemented by O's; S has an input from O naming O's GOOSE, an output to O, a sampled value control with its address and minimum SCD files
			sourceXml: BaySignalsXml,
			targetXml: emptyTarget,
			options: { ieds: [{ tagName: 'IED', id: 'ied-s' }] },
			fileType: 'SSD',
			warningCodes: ['external-input'],
			warnings: ['external-input extref-from-o', 'external-input extctrl-to-o'],
			expectedQueries: [
				'//default:ExtCtrl[@iedName="O" and @lnClass="GGIO" and @doName="Ind" and not(@lnUuid)]',
			],
		},
		'a carried IED with minimum SCD files → kept': {
			// breaker QA1 holds an LNode bound to S whose input is implemented by S's ExtRef and one bound to O implemented by O's; S has an input from O naming O's GOOSE, an output to O, a sampled value control with its address and minimum SCD files
			sourceXml: BaySignalsXml,
			targetXml: emptyTarget,
			options: { ieds: [{ tagName: 'IED', id: 'ied-s' }] },
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			expectedQueries: [
				'//default:IED[@name="S"]/default:MinRequestedSCDFiles/default:SclFileReference[@fileName="Project"]',
			],
		},
		'an SSD by default → the sampled value address left out with the connection address': {
			// breaker QA1 holds an LNode bound to S whose input is implemented by S's ExtRef and one bound to O implemented by O's; S has an input from O naming O's GOOSE, an output to O, a sampled value control with its address and minimum SCD files
			sourceXml: BaySignalsXml,
			targetXml: emptyTarget,
			options: { ieds: [{ tagName: 'IED', id: 'ied-s' }] },
			fileType: 'SSD',
			warningCodes: ['address-not-carried'],
			warnings: ['address-not-carried cap-s', 'address-not-carried smv-s'],
			expectedQueries: ['//default:SMV[@cbName="SV1"]'],
			unexpectedQueries: ['//default:SMV/default:Address', '//default:ConnectedAP/default:Address'],
		},
		'an SCD by default → its addresses kept, a complete SCD': {
			// breaker QA1 holds an LNode bound to S whose input is implemented by S's ExtRef and one bound to O implemented by O's; S has an input from O naming O's GOOSE, an output to O, a sampled value control with its address and minimum SCD files
			sourceXml: BaySignalsXml,
			targetXml: emptyTarget,
			options: { ieds: [{ tagName: 'IED', id: 'ied-s' }], fileType: 'SCD' },
			fileType: 'SCD',
			warningCodes: ['address-not-carried', 'scd-incomplete'],
			warnings: [],
			expectedQueries: [
				'//default:ConnectedAP[@iedName="S"]/default:Address',
				'//default:SMV[@cbName="SV1"]/default:Address',
			],
		},
		'an SCD with addresses left out on request → written without them and told it is not a complete SCD':
			{
				// breaker QA1 holds an LNode bound to S whose input is implemented by S's ExtRef and one bound to O implemented by O's; S has an input from O naming O's GOOSE, an output to O, a sampled value control with its address and minimum SCD files
				sourceXml: BaySignalsXml,
				targetXml: emptyTarget,
				options: { ieds: [{ tagName: 'IED', id: 'ied-s' }], fileType: 'SCD', addresses: 'drop' },
				fileType: 'SCD',
				warningCodes: ['address-not-carried', 'scd-incomplete'],
				warnings: ['address-not-carried cap-s', 'address-not-carried smv-s', 'scd-incomplete'],
				unexpectedQueries: ['//default:ConnectedAP/default:Address'],
			},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
