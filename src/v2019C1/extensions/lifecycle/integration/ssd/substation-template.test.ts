import { findByName, reportAndApply } from '../integration-helpers'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ssd as extractSsd } from '@/v2019C1/extensions/lifecycle/extract/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The project substation extracted, by its record id. */
	extracted: string
	/** The element of the extracted template the placement names, by its tag and its name. */
	scope: { tagName: TopologyStructuralTag; name: string }
	/** The refusal of the placement: the units it lists, `<tag> <name>`. */
	expectedCandidates?: string[]
}

/** A project substation of one voltage level, one bay, one function. */
const oneLevelXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" ${id}="project-header"/>
		<Substation name="S1" ${id}="s1">
			<VoltageLevel name="V1" uuid="v1-uuid" ${id}="v1">
				<Voltage unit="V" multiplier="k" ${id}="v1-voltage">110</Voltage>
				<Bay name="B1" uuid="b1-uuid" ${id}="b1">
					<Function name="Prot" uuid="prot-uuid" ${id}="prot"/>
				</Bay>
			</VoltageLevel>
		</Substation>
		<Substation name="P1" ${id}="p1"/>
	</SCL>
`

/** The same substation with a second voltage level. */
const twoLevelsXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" ${id}="project-header"/>
		<Substation name="S1" ${id}="s1">
			<VoltageLevel name="V1" uuid="v1-uuid" ${id}="v1">
				<Voltage unit="V" multiplier="k" ${id}="v1-voltage">110</Voltage>
				<Bay name="B1" uuid="b1-uuid" ${id}="b1">
					<Function name="Prot" uuid="prot-uuid" ${id}="prot"/>
				</Bay>
			</VoltageLevel>
			<VoltageLevel name="V2" uuid="v2-uuid" ${id}="v2">
				<Bay name="B2" uuid="b2-uuid" ${id}="b2">
					<Function name="Ctrl" uuid="ctrl-uuid" ${id}="ctrl"/>
				</Bay>
			</VoltageLevel>
		</Substation>
		<Substation name="P1" ${id}="p1"/>
	</SCL>
`

const emptyXml = /* xml */ `<SCL ${ns} ${id}="extracted-root" version="2007" revision="C" release="5"/>`

/**
 * A substation extracted to an SSD is a template: the substation is the `TEMPLATE` scaffolding, each of its named voltage
 * levels a unit another project instantiates.
 */
describe('extract.ssd of a substation, instantiated', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'one voltage level: the template named, it is placed with its bay and its function': {
			sourceXml: oneLevelXml,
			targetXml: oneLevelXml,
			extracted: 's1',
			scope: { tagName: 'Substation', name: 'TEMPLATE' },
			expectedQueries: [
				'//default:Substation[@name="P1"]/default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]/default:Function[@name="Prot"]',
			],
			unexpectedQueries: ['//default:Substation[@name="TEMPLATE"]'],
		},
		'two voltage levels, the template named: refused with both, nothing placed': {
			sourceXml: twoLevelsXml,
			targetXml: twoLevelsXml,
			extracted: 's1',
			scope: { tagName: 'Substation', name: 'TEMPLATE' },
			expectedCandidates: ['VoltageLevel V1', 'VoltageLevel V2'],
			unexpectedQueries: ['//default:Substation[@name="P1"]/default:VoltageLevel'],
		},
		'two voltage levels, the second named: only it is placed': {
			sourceXml: twoLevelsXml,
			targetXml: twoLevelsXml,
			extracted: 's1',
			scope: { tagName: 'VoltageLevel', name: 'V2' },
			expectedQueries: [
				'//default:Substation[@name="P1"]/default:VoltageLevel[@name="V2"]/default:Bay[@name="B2"]/default:Function[@name="Ctrl"]',
			],
			unexpectedQueries: ['//default:Substation[@name="P1"]/default:VoltageLevel[@name="V1"]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
		project,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const extracted = await openSclDocument({ project, xml: emptyXml, label: 'extracted ssd' })
		await extracted.transaction(async function extractSubstation(tx) {
			await extractSsd(tx, {
				sourceQuery: source.query,
				scopeRef: { tagName: 'Substation', id: testCase.extracted },
				tool: 'TEST',
				who: 'test',
			})
		})

		const ref = await findByName(extracted.query, testCase.scope)
		const anchor = await findByName(target.query, { tagName: 'Substation', name: 'P1' })
		const placed = reportAndApply({
			document: target,
			lifecycle: {
				verb: 'ssd',
				sourceQuery: extracted.query,
				ref,
				anchor,
				scenario: 'instantiate',
			},
		})
		if (testCase.expectedCandidates) {
			const refusal = toDialecteError(await placed.catch((error: unknown) => error))
			expect(refusal?.key).toBe('SSD_SCOPE_AMBIGUOUS')
			const candidates = (refusal?.meta?.candidates ?? []) as { tagName: string; name: string }[]
			expect(candidates.map((candidate) => `${candidate.tagName} ${candidate.name}`)).toEqual(
				testCase.expectedCandidates,
			)
		} else {
			await placed
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
