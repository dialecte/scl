import BayFrameMappedDataXml from './fixtures/ssd-bay-frame-mapped-data.xml?raw'
/// <reference types="vite/client" />
import { ssd } from './ssd'

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

describe('extract.ssd - frame data mapped to another logical node', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a frame LNode bound to a carried IED with data mapped elsewhere in it → the mapping repointed onto the copy':
			{
				// breaker QA1 holds an LNode bound to S and one bound to X, each with its data Pos mapped to Ind of its IED's GGIO1, not its default
				sourceXml: BayFrameMappedDataXml,
				targetXml: emptyTarget,
				options: { ieds: [{ tagName: 'IED', id: 'ied-s' }] },
				fileType: 'SSD',
				warningCodes: [],
				warnings: [],
				expectedQueries: [
					'//default:ConductingEquipment/default:LNode[@iedName="S"]/default:Private/v2019C1:DOS[@name="Pos" and @mappedDoName="Ind" and @mappedLnUuid = //default:IED[@name="S"]//default:LN[@lnClass="GGIO"]/@uuid]',
				],
			},
		'a frame LNode bound to an IED not carried with data mapped elsewhere in it → its data kept, the mapping cleared':
			{
				// breaker QA1 holds an LNode bound to S and one bound to X, each with its data Pos mapped to Ind of its IED's GGIO1, not its default
				sourceXml: BayFrameMappedDataXml,
				targetXml: emptyTarget,
				options: { ieds: [{ tagName: 'IED', id: 'ied-s' }] },
				fileType: 'SSD',
				warningCodes: [],
				warnings: [],
				expectedQueries: [
					'//default:ConductingEquipment/default:LNode[@iedName="None"]/default:Private/v2019C1:DOS[@name="Pos" and not(@mappedLnUuid) and not(@mappedDoName)]',
				],
			},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
