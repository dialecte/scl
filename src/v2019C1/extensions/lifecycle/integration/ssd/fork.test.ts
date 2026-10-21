import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'
import { readRevisionTwin } from '@/v2019C1/test/revision-twins'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type ForkTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The groups of the first fork's report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
	/** Then forked again in turn: each time from the newer revision as this XML gives it, or as the source stands. */
	nextForks: { sourceXml?: string; editSource?: (tx: Scl.Transaction) => Promise<void> }[]
}

const projectVoltageLevel = {
	tagName: 'VoltageLevel',
	id: 'project-voltage-level',
} as Scl.Ref<'VoltageLevel'>

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

const feederSsd = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<Function name="Prot" uuid="prot-uuid" ${id}="source-prot"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('ssd fork: the newer revision of the same file, its uuids kept', () => {
	const testCases: SclTest.TestCases<ForkTestCase> = {
		'a function the newer revision gained keeps its uuid; the forks after add nothing': {
			sourceXml: feederSsd,
			targetXml: projectXml,
			expectedGroups: ['added Bay', 'added Function'],
			nextForks: [
				{
					editSource: async (tx) => {
						await tx.addChild({ tagName: 'Bay', id: 'source-feeder' } as Scl.Ref<'Bay'>, {
							tagName: 'Function',
							attributes: { name: 'Ctrl', uuid: 'ctrl-uuid' },
						})
					},
				},
				{},
			],
			expectedQueries: [
				'//default:Bay[@uuid="feeder-uuid"]/default:Function[@name="Prot"][@uuid="prot-uuid"]',
				'//default:Bay[@uuid="feeder-uuid"]/default:Function[@name="Ctrl"][@uuid="ctrl-uuid"]',
				// the file is listed in the project's Header, once: the forks after the first reconcile
				'//default:Header/default:SourceFiles/default:SclFileReference[@fileUuid="feeder-file-uuid"]',
			],
			unexpectedQueries: [
				'(//default:SclFileReference)[2]',
				'//*[@templateUuid]',
				'//default:Bay[2]',
				'//default:Function[@name="Ctrl"][2]',
				'//default:Function[starts-with(@name, "Ctrl_")]',
			],
		},
		'a bay template of two levels forked into a project level, then its next revision: the gained dataflow once, with its uuids':
			{
				sourceXml: readRevisionTwin({ twin: 'twoLevelBayTemplate', revision: 1 }),
				targetXml: projectXml,
				expectedGroups: [
					'added Application',
					'added Application',
					'added Function',
					'added Function',
					'added VoltageLevel',
				],
				nextForks: [{ sourceXml: readRevisionTwin({ twin: 'twoLevelBayTemplate', revision: 2 }) }],
				allowInvalidOutput: {
					reason:
						'only the first named level of the template is placed, and its category is copied whole: its reference to the function of the level left out names nothing',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				expectedQueries: [
					// the signal role and the two inputs the second revision gained on the level placed
					'//v2019C1:SignalRole[@uuid="00000000-0000-4000-8000-000000000428"]',
					'//v2019C1:SourceRef[@uuid="00000000-0000-4000-8000-000000000429"]',
					'//v2019C1:SourceRef[@uuid="00000000-0000-4000-8000-000000000430"]',
					// the elements of the first revision, with their uuids
					'//v2019C1:Application[@name="Breaker_App"][@uuid="00000000-0000-4000-8000-000000000412"]',
					'//default:Function[@name="Breaker_Fn"][@uuid="00000000-0000-4000-8000-000000000417"]',
				],
				unexpectedQueries: [
					'(//v2019C1:SignalRole[@uuid="00000000-0000-4000-8000-000000000428"])[2]',
					'(//v2019C1:SourceRef[@uuid="00000000-0000-4000-8000-000000000429"])[2]',
					'(//v2019C1:Application[@name="Breaker_App"])[2]',
					'(//default:Function[@name="Breaker_Fn"])[2]',
				],
			},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<ForkTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		// the scope is the file's unit, resolved from the file: `ref` names its substation
		const lifecycleFrom = async (sourceQuery: Scl.Query): Promise<LifecycleTarget> => {
			const [substation] = await sourceQuery.getRecordsByTagName('Substation')
			return {
				verb: 'ssd',
				sourceQuery,
				ref: { tagName: 'Substation', id: substation.id },
				anchor: projectVoltageLevel,
				scenario: 'fork',
			}
		}

		const { report } = await reportAndApply({
			document: target,
			lifecycle: await lifecycleFrom(source.query),
		})
		expect(listGroups(report)).toEqual(testCase.expectedGroups)

		for (const next of testCase.nextForks) {
			if (next.editSource) await source.transaction(next.editSource)
			const revision = next.sourceXml
				? await openSclDocument({ project, xml: next.sourceXml, label: 'next revision' })
				: source
			await reportAndApply({ document: target, lifecycle: await lifecycleFrom(revision.query) })
		}

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
