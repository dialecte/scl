import { reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// The logical node of a piece of equipment a bay template places is compared by the type it names too: a type the
// template changed reaches the placed bay through the import of its closure, decided with the equipment's group.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The groups of the update are declined. */
	declined?: boolean
	/** The type changes the update's report lists on the breaker's logical node. */
	expectedTypeChanges: { name: string; before?: string; after?: string }[]
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

/** A bay template whose breaker holds a logical node of the breaker type. */
const feederSsd = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-uuid" ${id}="source-breaker">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_Type" uuid="breaker-lnode-uuid" ${id}="source-breaker-lnode"/>
					</ConductingEquipment>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="source-types">
			<LNodeType id="XCBR_Type" lnClass="XCBR" ${id}="source-breaker-type">
				<DO name="Pos" type="DPC_Type" ${id}="source-position"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="source-position-type">
				<DA name="stVal" bType="Dbpos" fc="ST" ${id}="source-position-value"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

const placedBreaker = '//default:Bay[@name="Feeder"]/default:ConductingEquipment/default:LNode'

describe('ssd update: the type of an equipment logical node is compared by what it holds', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the breaker type gaining a data object: listed, and brought under its id': {
			sourceXml: feederSsd,
			targetXml: projectXml,
			expectedTypeChanges: [{ name: 'lnType', before: 'XCBR_Type', after: 'XCBR_Type' }],
			expectedQueries: [
				`${placedBreaker}[@lnType="XCBR_Type"]`,
				'//default:LNodeType[@id="XCBR_Type"]/default:DO[@name="BlkOpn"]',
			],
			unexpectedQueries: ['//default:LNodeType[2]'],
		},
		'… declined: the breaker keeps its type': {
			sourceXml: feederSsd,
			targetXml: projectXml,
			declined: true,
			expectedTypeChanges: [{ name: 'lnType', before: 'XCBR_Type', after: 'XCBR_Type' }],
			expectedQueries: [`${placedBreaker}[@lnType="XCBR_Type"]`],
			unexpectedQueries: ['//default:DO[@name="BlkOpn"]', '//default:LNodeType[2]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await reportAndApply({
			document: target,
			lifecycle: feederTarget({ sourceQuery: source.query, scenario: 'instantiate' }),
		})
		await source.transaction(async function addABlockingDataObject(tx) {
			await tx.addChild(
				{ tagName: 'LNodeType', id: 'source-breaker-type' } as Scl.Ref<'LNodeType'>,
				{
					tagName: 'DO',
					attributes: { name: 'BlkOpn', type: 'DPC_Type' },
				},
			)
		})
		const { report } = await reportAndApply({
			document: target,
			lifecycle: feederTarget({ sourceQuery: source.query, scenario: 'template' }),
			decide: testCase.declined ? declineEvery : undefined,
		})
		const typeChanges = allGroups(report).flatMap((group) =>
			[group.primary, ...group.companions].flatMap((node) => node.typeChanges ?? []),
		)
		expect(typeChanges).toEqual(testCase.expectedTypeChanges)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The bay of the template placed, or updated, in the project's voltage level. */
function feederTarget(params: {
	sourceQuery: Scl.Query
	scenario: LifecycleScenario
}): LifecycleTarget {
	const { sourceQuery, scenario } = params
	return {
		verb: 'ssd',
		sourceQuery,
		ref: { tagName: 'Bay', id: 'source-feeder' },
		anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
		scenario,
	}
}

/** Every group of a report declined. */
function declineEvery(reported: DiffReport): DecisionMap {
	return new Map(allGroups(reported).map((group) => [group.id, 'skip' as const]))
}
