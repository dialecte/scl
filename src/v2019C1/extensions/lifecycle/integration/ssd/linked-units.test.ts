import { findByName, listGroups, reportAndApply } from '../integration-helpers'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'
import { readRevisionTwin } from '@/v2019C1/test/revision-twins'

import type { Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type {
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The element of the template named, by its tag and its name. */
	scope: { tagName: TopologyStructuralTag; name: string }
	/** The project element the placement starts from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The units the report says it acts on, by name; none when it acts on the element named alone. */
	expectedUnits?: string[]
	/** The refusal of the report: the candidates it lists, `<name> + <linked names>`. */
	expectedCandidates?: string[]
	/** Then updated from the template's second revision, or from `newerXml`: the groups of that report. */
	expectedUpdateGroups?: string[]
	newerXml?: string
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`
const projectSubstation = {
	tagName: 'Substation',
	id: 'project-substation',
} as Scl.Ref<'Substation'>

const levelProjectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`
const projectVoltageLevel = {
	tagName: 'VoltageLevel',
	id: 'project-voltage-level',
} as Scl.Ref<'VoltageLevel'>

/**
 * Bays of one voltage level: the breaker of `B2` on a node of `B1`; `B3`, when asked, of its own. Application `A3`
 * and its function `F3` sit in `B3`, or in `B1` when asked.
 */
function baysXml(params: { linked: boolean; third: boolean; applicationIn?: 'B1' | 'B3' }): string {
	const { linked, third, applicationIn = 'B3' } = params
	const terminal = linked
		? `<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/B1/L1" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="B1" cNodeName="L1" ${id}="terminal-2"/>`
		: ''
	const application = /* xml */ `
		<Private type="eIEC61850-6-100" ${id}="application-private">
			<eIEC61850-6-100:Application name="A3" type="DCS" uuid="a3-uuid" ${id}="application-3">
				<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="role-3">
					<eIEC61850-6-100:FunctionRoleContent ${id}="role-content-3">
						<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/${applicationIn}/F3" functionUuid="f3-uuid" ${id}="function-ref-3"/>
					</eIEC61850-6-100:FunctionRoleContent>
				</eIEC61850-6-100:FunctionRole>
			</eIEC61850-6-100:Application>
		</Private>
	`
	const applicationFunction = `<Function name="F3" uuid="f3-uuid" ${id}="function-3"/>`
	const thirdBay = third
		? /* xml */ `
			<Bay name="B3" uuid="b3-uuid" ${id}="bay-3">
				${applicationIn === 'B3' ? application : ''}
				<ConductingEquipment name="QA1" type="CBR" uuid="qa3-uuid" ${id}="equipment-3"/>
				${applicationIn === 'B3' ? applicationFunction : ''}
				<Function name="Own3" uuid="own3-uuid" ${id}="own-function-3"/>
			</Bay>
		`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="source">
			<Header id="bays" uuid="bays-file-uuid" version="0" revision="1" ${id}="source-header"/>
			<Substation name="TEMPLATE" ${id}="source-substation">
				<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
					<Bay name="B1" uuid="b1-uuid" ${id}="bay-1">
						${applicationIn === 'B1' ? application : ''}
						<ConductingEquipment name="QA1" type="CBR" uuid="qa1-uuid" ${id}="equipment-1">
							<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/B1/L1" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="B1" cNodeName="L1" ${id}="terminal-1"/>
						</ConductingEquipment>
						<ConnectivityNode name="L1" pathName="TEMPLATE/TEMPLATE/B1/L1" uuid="node-uuid" ${id}="node-1"/>
						${applicationIn === 'B1' ? applicationFunction : ''}
					</Bay>
					<Bay name="B2" uuid="b2-uuid" ${id}="bay-2">
						<ConductingEquipment name="QA1" type="CBR" uuid="qa2-uuid" ${id}="equipment-2">
							${terminal}
						</ConductingEquipment>
					</Bay>
					${thirdBay}
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

/** The terminal of the medium-voltage breaker names the node placed from the high-voltage level. */
const TWIN_TERMINAL_ON_ITS_NODE =
	'//default:VoltageLevel[@templateUuid="00000000-0000-4000-8000-000000000520"]//default:Terminal[@cNodeUuid = //default:ConnectivityNode[@templateUuid="00000000-0000-4000-8000-000000000517"]/@uuid]'

// Units of the first named level joined by a reference are one element: placed together, each level where the Map
// step puts it; units with no reference between them still wait for a choice.
describe('ssd: units linked by a reference are one element', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the two levels of the transformer template, its scaffolding named: placed together, the terminal on its node':
			{
				sourceXml: readRevisionTwin({ twin: 'linkedLevelsTemplate', revision: 1 }),
				targetXml: projectXml,
				scope: { tagName: 'Substation', name: 'TEMPLATE' },
				anchor: projectSubstation,
				expectedUnits: ['TEMPLATE_HV', 'TEMPLATE_MV'],
				expectedQueries: [
					'//default:Substation[@name="S1"]/default:VoltageLevel[@templateUuid="00000000-0000-4000-8000-000000000510"]',
					'//default:Substation[@name="S1"]/default:VoltageLevel[@templateUuid="00000000-0000-4000-8000-000000000520"]',
					TWIN_TERMINAL_ON_ITS_NODE,
				],
				unexpectedQueries: ['//default:Substation[2]', '//default:*[@substationName="TEMPLATE"]'],
			},
		'… its medium-voltage level named: the high-voltage level comes with it': {
			sourceXml: readRevisionTwin({ twin: 'linkedLevelsTemplate', revision: 1 }),
			targetXml: projectXml,
			scope: { tagName: 'VoltageLevel', name: 'TEMPLATE_MV' },
			anchor: projectSubstation,
			expectedUnits: ['TEMPLATE_HV', 'TEMPLATE_MV'],
			expectedQueries: [TWIN_TERMINAL_ON_ITS_NODE],
			unexpectedQueries: ['//default:Substation[2]'],
		},
		'… then its second revision: the breaker change is listed and written, nothing placed twice': {
			sourceXml: readRevisionTwin({ twin: 'linkedLevelsTemplate', revision: 1 }),
			targetXml: projectXml,
			scope: { tagName: 'Substation', name: 'TEMPLATE' },
			anchor: projectSubstation,
			expectedUnits: ['TEMPLATE_HV', 'TEMPLATE_MV'],
			expectedUpdateGroups: ['modified ConductingEquipment'],
			expectedQueries: [
				'//default:ConductingEquipment[@templateUuid="00000000-0000-4000-8000-000000000522"][@desc="rev2"]',
				TWIN_TERMINAL_ON_ITS_NODE,
			],
			unexpectedQueries: [
				'(//default:VoltageLevel[@templateUuid="00000000-0000-4000-8000-000000000520"])[2]',
			],
		},
		'two bays linked by a terminal: placed together, the terminal on the node placed': {
			sourceXml: baysXml({ linked: true, third: false }),
			targetXml: levelProjectXml,
			scope: { tagName: 'Bay', name: 'B2' },
			anchor: projectVoltageLevel,
			expectedUnits: ['B1', 'B2'],
			expectedQueries: [
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]',
				'//default:Bay[@name="B2"]//default:Terminal[@cNodeUuid = //default:ConnectivityNode[@templateUuid="node-uuid"]/@uuid][@bayName="B1"]',
			],
			unexpectedQueries: [
				'//default:VoltageLevel[2]',
				'//default:Terminal[@cNodeUuid="node-uuid"]',
			],
		},
		'two bays with no reference between them, their scaffolding named: refused with both': {
			sourceXml: baysXml({ linked: false, third: false }),
			targetXml: levelProjectXml,
			scope: { tagName: 'VoltageLevel', name: 'TEMPLATE' },
			anchor: projectVoltageLevel,
			expectedCandidates: ['B1', 'B2'],
			unexpectedQueries: ['//default:Bay'],
		},
		'three bays, two linked, their scaffolding named: refused with two candidates': {
			sourceXml: baysXml({ linked: true, third: true }),
			targetXml: levelProjectXml,
			scope: { tagName: 'VoltageLevel', name: 'TEMPLATE' },
			anchor: projectVoltageLevel,
			expectedCandidates: ['B1 + B2', 'B3'],
			unexpectedQueries: ['//default:Bay'],
		},
		'… one of the linked pair named: the pair placed, the third bay left out': {
			sourceXml: baysXml({ linked: true, third: true }),
			targetXml: levelProjectXml,
			scope: { tagName: 'Bay', name: 'B1' },
			anchor: projectVoltageLevel,
			expectedUnits: ['B1', 'B2'],
			expectedQueries: [
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]',
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B2"]',
			],
			unexpectedQueries: [
				'//default:Bay[@name="B3"]',
				'//default:VoltageLevel[2]',
				'//default:Function',
				'//v2019C1:Application',
			],
		},
		'an application of the pair moved to the third bay: the update of the pair removes it': {
			sourceXml: baysXml({ linked: true, third: true, applicationIn: 'B1' }),
			newerXml: baysXml({ linked: true, third: true, applicationIn: 'B3' }),
			targetXml: levelProjectXml,
			scope: { tagName: 'Bay', name: 'B1' },
			anchor: projectVoltageLevel,
			expectedUnits: ['B1', 'B2'],
			expectedUpdateGroups: ['removed Application', 'removed Function'],
			unexpectedQueries: [
				'//default:Bay[@name="B3"]',
				'//v2019C1:Application',
				'//default:Function',
			],
		},
		'… the third bay named: it alone, the report naming no other unit': {
			sourceXml: baysXml({ linked: true, third: true }),
			targetXml: levelProjectXml,
			scope: { tagName: 'Bay', name: 'B3' },
			anchor: projectVoltageLevel,
			expectedQueries: [
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B3"]/default:Function[@name="F3"]',
			],
			unexpectedQueries: ['//default:Bay[@name="B1"]', '//default:Bay[@name="B2"]'],
		},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const ref = await findByName(source.query, testCase.scope)
		const placement = scopeTarget({
			sourceQuery: source.query,
			ref,
			anchor: testCase.anchor,
			scenario: 'instantiate',
		})
		const placed = reportAndApply({ document: target, lifecycle: placement })
		if (testCase.expectedCandidates) {
			const refusal = toDialecteError(await placed.catch((error: unknown) => error))
			expect(refusal?.key).toBe('SSD_SCOPE_AMBIGUOUS')
			expect(describeCandidates(refusal?.meta?.candidates)).toEqual(testCase.expectedCandidates)
			return { assertOn: 'target' }
		}
		const { report } = await placed
		expect(await namesOf({ query: source.query, units: report.scopeUnits })).toEqual(
			testCase.expectedUnits,
		)

		if (testCase.expectedUpdateGroups) {
			const newer = await openSclDocument({
				project,
				xml: testCase.newerXml ?? readRevisionTwin({ twin: 'linkedLevelsTemplate', revision: 2 }),
				label: 'next revision',
			})
			const newerRef = await findByName(newer.query, testCase.scope)
			const update = scopeTarget({
				sourceQuery: newer.query,
				ref: newerRef,
				anchor: testCase.anchor,
				scenario: 'template',
			})
			const { report: updated } = await reportAndApply({ document: target, lifecycle: update })
			expect(listGroups(updated)).toEqual(testCase.expectedUpdateGroups)
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The SSD target of a level of the template, placed or updated from the project element given. */
function scopeTarget(params: {
	sourceQuery: Scl.Query
	ref: Scl.Ref<TopologyStructuralTag>
	anchor: Scl.Ref<Scl.ElementsOf>
	scenario: LifecycleScenario
}): LifecycleTarget {
	const { sourceQuery, ref, anchor, scenario } = params
	return { verb: 'ssd', sourceQuery, ref, anchor, scenario }
}

/** The names of the units a report acts on, read in the template. */
async function namesOf(params: {
	query: Scl.Query
	units: readonly { tagName: string; id?: string }[] | undefined
}): Promise<string[] | undefined> {
	const { query, units } = params
	if (!units) return undefined
	const names: string[] = []
	for (const unit of units) {
		const ref = { tagName: unit.tagName, id: unit.id } as Scl.Ref<Scl.ElementsOf>
		names.push((await query.any.getAttribute(ref, { name: 'name' })) ?? '')
	}
	return names
}

/** Each candidate of a refusal as `<name> + <linked names>`. */
function describeCandidates(candidates: unknown): string[] {
	const list = (candidates ?? []) as { name: string; linked: { name: string }[] }[]
	return list.map((candidate) =>
		[candidate.name, ...candidate.linked.map((unit) => unit.name)].join(' + '),
	)
}

const twoLevelsProjectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
			<VoltageLevel name="V2" ${id}="project-other-voltage-level"/>
		</Substation>
	</SCL>
`
const projectOtherVoltageLevel = {
	tagName: 'VoltageLevel',
	id: 'project-other-voltage-level',
} as Scl.Ref<'VoltageLevel'>

type LeftOutCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The third bay is placed on its own first, in this project level. */
	thirdPlacedIn?: Scl.Ref<Scl.ElementsOf>
	/** The groups of the update of the pair, after the template changed every breaker. */
	expectedUpdateGroups: string[]
	/** The update lists no level to place (no level mapping to decide). */
	expectedNoGainedLevel: boolean
}

// The units a chosen element does not hold are out of its scope on every write: placement, update, removal.
describe('ssd: a unit the chosen element does not hold stays out of it', () => {
	const testCases: SclTest.TestCases<LeftOutCase> = {
		'the pair updated: the third bay is neither listed nor placed, nor what it holds': {
			sourceXml: baysXml({ linked: true, third: true }),
			targetXml: twoLevelsProjectXml,
			expectedUpdateGroups: ['modified ConductingEquipment', 'modified ConductingEquipment'],
			expectedNoGainedLevel: true,
			expectedQueries: ['//default:Bay[@name="B2"]/default:ConductingEquipment[@desc="rev2"]'],
			unexpectedQueries: [
				'//default:Bay[@name="B3"]',
				'//default:Function',
				'//v2019C1:Application',
			],
		},
		'the third bay placed on its own in another level first: the pair lands where it is asked, the third is left as it is':
			{
				sourceXml: baysXml({ linked: true, third: true }),
				targetXml: twoLevelsProjectXml,
				thirdPlacedIn: projectOtherVoltageLevel,
				expectedUpdateGroups: ['modified ConductingEquipment', 'modified ConductingEquipment'],
				expectedNoGainedLevel: true,
				expectedQueries: [
					'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]',
					'//default:VoltageLevel[@name="V2"]/default:Bay[@name="B3"]/default:ConductingEquipment[not(@desc)]',
				],
				unexpectedQueries: ['//default:VoltageLevel[@name="V2"]/default:Bay[@name="B1"]'],
			},
		'the third bay placed on its own in the same level first: the update of the pair leaves it as it is':
			{
				sourceXml: baysXml({ linked: true, third: true }),
				targetXml: twoLevelsProjectXml,
				thirdPlacedIn: projectVoltageLevel,
				expectedUpdateGroups: ['modified ConductingEquipment', 'modified ConductingEquipment'],
				expectedNoGainedLevel: true,
				expectedQueries: [
					'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B3"]/default:ConductingEquipment[not(@desc)]',
					'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B3"]/default:Function[@name="Own3"]',
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<LeftOutCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const pair = await findByName(source.query, { tagName: 'Bay', name: 'B1' })
		if (testCase.thirdPlacedIn) {
			const third = await findByName(source.query, { tagName: 'Bay', name: 'B3' })
			const alone = scopeTarget({
				sourceQuery: source.query,
				ref: third,
				anchor: testCase.thirdPlacedIn,
				scenario: 'instantiate',
			})
			await reportAndApply({ document: target, lifecycle: alone })
		}
		const placement = scopeTarget({
			sourceQuery: source.query,
			ref: pair,
			anchor: projectVoltageLevel,
			scenario: 'instantiate',
		})
		await reportAndApply({ document: target, lifecycle: placement })
		await source.transaction(describeEveryBreaker)
		const update = scopeTarget({
			sourceQuery: source.query,
			ref: pair,
			anchor: projectVoltageLevel,
			scenario: 'template',
		})
		const { report } = await reportAndApply({ document: target, lifecycle: update })
		expect(listGroups(report)).toEqual(testCase.expectedUpdateGroups)
		// the instance's two bays are held, and no other bay is to be placed
		const bayMappings = report.mappings.filter((mapping) => mapping.tagName === 'Bay')
		expect(bayMappings.length === 2 && bayMappings.every((mapping) => mapping.locked)).toBe(
			testCase.expectedNoGainedLevel,
		)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The newer revision: every breaker of the template described. */
async function describeEveryBreaker(tx: Scl.Transaction): Promise<void> {
	for (const breaker of await tx.getRecordsByTagName('ConductingEquipment')) {
		await tx.update(
			{ tagName: 'ConductingEquipment', id: breaker.id },
			{ attributes: { desc: 'rev2' } },
		)
	}
}

// The instantiate verb called on its own reads the scope the same way: the chosen element and nothing else.
describe('instantiate.ssd called on its own with a unit of a linked pair', () => {
	type DirectCase = SclTest.BaseXmlTestCase & { targetXml: string; leftOut?: string[] }
	const testCases: SclTest.TestCases<DirectCase> = {
		'the pair placed, the third bay and what it holds left out': {
			sourceXml: baysXml({ linked: true, third: true }),
			targetXml: levelProjectXml,
			expectedQueries: [
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]',
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B2"]',
			],
			unexpectedQueries: [
				'//default:Bay[@name="B3"]',
				'//default:Function',
				'//v2019C1:Application',
			],
		},
		'what the caller leaves out stays out of the pair': {
			sourceXml: baysXml({ linked: true, third: true }),
			targetXml: levelProjectXml,
			leftOut: ['equipment-1'],
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:ConnectivityNode[@name="L1"]',
				'//default:Bay[@name="B2"]/default:ConductingEquipment[@name="QA1"]',
			],
			unexpectedQueries: [
				'//default:Bay[@name="B1"]/default:ConductingEquipment',
				'//default:Bay[@name="B3"]',
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<DirectCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const pair = await findByName(source.query, { tagName: 'Bay', name: 'B1' })
		await target.transaction(async function placeThePair(tx) {
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: pair,
				targetParent: projectVoltageLevel,
				leftOut: testCase.leftOut && new Set(testCase.leftOut),
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
