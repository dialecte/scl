import { findByName, reportAndApply } from '../integration-helpers'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { readRevisionTwin } from '@/v2019C1/test/revision-twins'

import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The element of the template named, by its tag and its name. */
	scope: { tagName: TopologyStructuralTag; name: string }
	/** The refusal of the report: the units it lists, `<tag> <name>`. */
	expectedCandidates?: string[]
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

/** A template of two bays at its first named level, one function each. */
const twoBaysSsd = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="two-bays" uuid="two-bays-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="B1" uuid="b1-uuid" ${id}="source-b1">
					<Function name="Prot" uuid="prot-uuid" ${id}="source-prot"/>
				</Bay>
				<Bay name="B2" uuid="b2-uuid" ${id}="source-b2">
					<Function name="Ctrl" uuid="ctrl-uuid" ${id}="source-ctrl"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('ssd: the scope is the element the consumer names', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the TEMPLATE substation above two named bays: refused with both, nothing written': {
			sourceXml: twoBaysSsd,
			targetXml: projectXml,
			scope: { tagName: 'Substation', name: 'TEMPLATE' },
			expectedCandidates: ['Bay B1', 'Bay B2'],
			unexpectedQueries: ['//default:Bay', '//default:Header/default:SourceFiles'],
		},
		'the second of two named bays: only it is placed, with its function': {
			sourceXml: twoBaysSsd,
			targetXml: projectXml,
			scope: { tagName: 'Bay', name: 'B2' },
			expectedQueries: [
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B2"][@templateUuid="b2-uuid"]/default:Function[@name="Ctrl"]',
			],
			unexpectedQueries: ['//default:Bay[@name="B1"]', '//default:Function[@name="Prot"]'],
		},
		'the TEMPLATE voltage level above two named bays: refused with both': {
			sourceXml: twoBaysSsd,
			targetXml: projectXml,
			scope: { tagName: 'VoltageLevel', name: 'TEMPLATE' },
			expectedCandidates: ['Bay B1', 'Bay B2'],
			unexpectedQueries: ['//default:Bay'],
		},
		'the bay template twin named by its scaffolding: refused with its two voltage levels': {
			sourceXml: readRevisionTwin({ twin: 'twoLevelBayTemplate', revision: 1 }),
			targetXml: projectXml,
			scope: { tagName: 'Substation', name: 'TEMPLATE' },
			expectedCandidates: ['VoltageLevel TEMPLATE_HV', 'VoltageLevel TEMPLATE_MV'],
			unexpectedQueries: ['//default:Function', '//default:VoltageLevel[2]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const scopeRef = await findByName(source.query, testCase.scope)
		const placed = reportAndApply({
			document: target,
			lifecycle: {
				verb: 'ssd',
				sourceQuery: source.query,
				ref: scopeRef,
				anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
				scenario: 'instantiate',
			},
		})
		if (testCase.expectedCandidates) {
			const refusal = toDialecteError(await placed.catch((error: unknown) => error))
			expect(refusal?.code).toBe('SCL2003')
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
