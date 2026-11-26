import BayFrameDataXml from './fixtures/ssd-bay-frame-data.xml?raw'
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

describe('extract.ssd - identity of what the carried IEDs reference', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'references between carried IEDs → repointed onto the copies': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			expectedQueries: [
				'//default:GSE[@cbName="G1" and @cbUuid = //default:IED[@name="S1"]//default:GSEControl[@name="G1"]/@uuid]',
				'//default:IEDName[.="HMI" and @apUuid = //default:IED[@name="HMI"]/default:AccessPoint/@uuid]',
				'//default:ClientLN[@iedName="HMI" and @lnUuid = //default:IED[@name="HMI"]//default:LN[@lnClass="IHMI" and @inst="1"]/@uuid]',
			],
		},
		'the template selection → the shared subnetwork holds only the carried IED connection': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			options: { ieds: TEMPLATE_IED_SELECTION },
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			expectedQueries: [
				'//default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="S1"]',
			],
		},
		'the template link broken → a carried IED keeps its lineage': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			options: { templateLink: 'break' },
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			expectedQueries: [
				'//default:IED[@name="R1" and @templateUuid="d1000000-0000-4000-8000-000000000001"]',
			],
		},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

describe('extract.ssd - data and inputs naming an IED not carried', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a frame LNode bound to an IED not carried with data → its data kept, the mapping cleared': {
			// breaker QA1 holds an LNode bound to X with mapped data and a type nothing else uses; Y, bound in function PROT, has two inputs naming X by uuid only
			sourceXml: BayFrameDataXml,
			targetXml: emptyTarget,
			options: { ieds: [{ tagName: 'IED', id: 'ied-y' }] },
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			expectedQueries: [
				'//default:ConductingEquipment/default:LNode[@iedName="None"]/default:Private/v2019C1:DOS[@name="Pos" and not(@mappedLnUuid)]',
			],
		},
		'a frame LNode whose type nothing carried uses → its type written': {
			// breaker QA1 holds an LNode bound to X with mapped data and a type nothing else uses; Y, bound in function PROT, has two inputs naming X by uuid only
			sourceXml: BayFrameDataXml,
			targetXml: emptyTarget,
			options: { ieds: [{ tagName: 'IED', id: 'ied-y' }] },
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			expectedQueries: [
				'//default:LNodeType[@id="XCBR_Only_Type"]/default:DO[@name="Pos" and @type="DPC_Only_Type"]',
				'//default:DOType[@id="DPC_Only_Type"]',
			],
		},
		'an input naming an IED not carried by uuid only → reduced or left out, never kept without a source':
			{
				// breaker QA1 holds an LNode bound to X with mapped data and a type nothing else uses; Y, bound in function PROT, has two inputs naming X by uuid only
				sourceXml: BayFrameDataXml,
				targetXml: emptyTarget,
				options: { ieds: [{ tagName: 'IED', id: 'ied-y' }] },
				fileType: 'SSD',
				warningCodes: ['external-input', 'input-unbound', 'input-removed'],
				warnings: ['input-unbound extref-uuid-with-address', 'input-removed extref-uuid-only'],
				expectedQueries: ['//default:ExtRef[@intAddr="PosIn" and not(@lnUuid)]'],
				unexpectedQueries: ['//default:ExtRef[@desc="breaker position again"]'],
			},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

describe('extract.ssd - a carried real IED in the file', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a carried real IED → classified implemented in the file written': {
			// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
			sourceXml: BayWithIedsXml,
			targetXml: emptyTarget,
			fileType: 'SSD',
			warningCodes: [],
			warnings: [],
			expectedQueries: ['//default:IED[@name="R1"]'],
		},
	}

	async function actClassified(params: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const result = await act(params)
		if (!params.target) throw new Error('target required')
		const classifications = await params.target.query.lifecycle.classifyIeds()
		expect(classifications.map(({ name, kind }) => `${name} ${kind}`).sort()).toEqual([
			'HMI specification',
			'R1 implemented',
			'S1 specification',
		])
		return result
	}

	runSclTestCases.withExport<TestCase>({ testCases, act: actClassified })
})
