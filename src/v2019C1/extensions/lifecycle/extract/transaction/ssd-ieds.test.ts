import BayWithIedsXml from './fixtures/ssd-bay-with-ieds.xml?raw'
/// <reference types="vite/client" />
import { ssd } from './ssd'
import { TEMPLATE_IED_SELECTION } from './ssd.constants'

import { toDialecteError } from '@dialecte/core'
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

describe('extract.ssd - which IEDs ride and the file type', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a bay with an S-IED bound to its LNodes, default options → the IED and its access point carried, the LNode bound to the carried LN, file type SSD':
			{
				// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
				sourceXml: BayWithIedsXml,
				targetXml: emptyTarget,
				warningCodes: [],
				warnings: [],
				fileType: 'SSD',
				expectedQueries: [
					'//default:Header[@fileType="SSD"]',
					'//default:IED[@name="S1" and @uuid!="c0000000-0000-4000-8000-000000000001"]',
					'//default:ConnectedAP[@iedName="S1" and @apUuid = //default:IED[@name="S1"]/default:AccessPoint/@uuid]',
					'//default:Function/default:LNode[@iedName="S1" and @lnClass="PTOC" and @lnUuid = //default:IED[@name="S1"]//default:LN[@lnClass="PTOC"]/@uuid]',
				],
				unexpectedQueries: ['//default:IED[@name="Other"]'],
			},
		'the template selection on a bay with a real IED bound too → the real IED not carried, its LNodes released, ied-not-carried lists it with its kind':
			{
				// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
				sourceXml: BayWithIedsXml,
				targetXml: emptyTarget,
				fileType: 'SSD',
				options: { ieds: TEMPLATE_IED_SELECTION },
				warningCodes: ['ied-not-carried'],
				warnings: [
					'ied-not-carried R1 implemented full',
					'ied-not-carried HMI specification shared',
				],
				expectedQueries: [
					'//default:IED[@name="S1"]',
					'//default:Function/default:LNode[@lnClass="PTOC" and @iedName="None" and not(@lnUuid)]',
				],
				unexpectedQueries: ['//default:IED[@name="R1"]', '//default:LNode[@iedName="R1"]'],
			},
		'a carried real IED with fileType by-content → SCD, the IED keeps its source files and lineage and classifies implemented':
			{
				// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
				sourceXml: BayWithIedsXml,
				targetXml: emptyTarget,
				warningCodes: [],
				warnings: [],
				options: { fileType: 'by-content' },
				fileType: 'SCD',
				expectedQueries: [
					'//default:Header[@fileType="SCD"]',
					'//default:IED[@name="R1" and @templateUuid="d1000000-0000-4000-8000-000000000001"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ICD"]',
					'//default:IED[@name="R1"]//default:LN[@lnClass="PTOC" and @templateUuid="d1000000-0000-4000-8000-000000000002"]',
				],
			},
		'a shared S-IED under a selection leaving shared IEDs out → not carried, ied-not-carried with assignment shared':
			{
				// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
				sourceXml: BayWithIedsXml,
				targetXml: emptyTarget,
				fileType: 'SSD',
				options: { ieds: { specification: 'carry', implemented: 'carry', shared: 'leave-out' } },
				warningCodes: ['ied-not-carried'],
				warnings: ['ied-not-carried HMI specification shared'],
				expectedQueries: ['//default:IED[@name="S1"]', '//default:IED[@name="R1"]'],
				unexpectedQueries: ['//default:IED[@name="HMI"]'],
			},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

describe('extract.ssd - an IED list naming an IED not bound to the scope', () => {
	type RefusalCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		expectedRefusal: { key: string }
	}

	const testCases: SclTest.TestCases<RefusalCase> = {
		'an explicit list naming an IED not bound to the scope → refused EXTRACT_IED_NOT_BOUND, nothing written':
			{
				// bay Q01 ties LNodes to S-IED S1, real IED R1 (ICD source file, lineage) and HMI (also tied to bay Q02); Other is tied to nothing
				sourceXml: BayWithIedsXml,
				targetXml: emptyTarget,
				expectedRefusal: { key: 'EXTRACT_IED_NOT_BOUND' },
				expectedQueries: ['/default:SCL[count(*)=0]'],
			},
	}

	async function actRefused({
		source,
		target,
		testCase,
	}: SclTest.ActParams<RefusalCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const extracting = target.transaction(async function extractBay(tx) {
			return ssd(tx, {
				sourceQuery: source.query,
				scopeRef: bay,
				tool: 'TEST',
				who: 'test',
				ieds: [{ tagName: 'IED', id: 'ied-other' }],
			})
		})
		const refused = await extracting.then(
			() => undefined,
			(error: unknown) => error,
		)
		expect({ key: toDialecteError(refused)?.key }).toEqual(testCase.expectedRefusal)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport<RefusalCase>({ testCases, act: actRefused })
})
