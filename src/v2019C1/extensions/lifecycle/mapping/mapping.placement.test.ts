import { describe, expect } from 'vitest'

import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { DecisionMapping, ReportMapping } from './mapping.types'
import type { Scl } from '@/v2019C1/config'
import type { DecisionMap, DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const STRUCTURAL_TAGS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS

const sourceSubstationRef = { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>
const substationRef = { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>
const voltageLevelRef = {
	tagName: 'VoltageLevel',
	id: 'voltage-level-t',
} as Scl.Ref<'VoltageLevel'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const substation = { ref: substationRef, title: 'S1', path: 'S1' }
const voltageLevel = { ref: voltageLevelRef, title: 'V1', path: 'S1/V1' }
const bay = { ref: bayRef, title: 'B1', path: 'S1/V1/B1' }

// A bay typical: the bay "Feeder" and its function, below TEMPLATE levels.
const bayTypicalXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="Feeder" uuid="bay-source-uuid" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project with one substation, one voltage level and one bay.
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same project with a second voltage level, empty.
const twoVoltageLevelsXml = projectXml.replace(
	'</VoltageLevel>',
	`</VoltageLevel>
			<VoltageLevel name="V2" ${id}="second-voltage-level-t"/>`,
)

// A project whose substation has no voltage level yet.
const noVoltageLevelXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t"/>
	</SCL>
`

const secondVoltageLevelRef = {
	tagName: 'VoltageLevel',
	id: 'second-voltage-level-t',
} as Scl.Ref<'VoltageLevel'>
const secondVoltageLevel = { ref: secondVoltageLevelRef, title: 'V2', path: 'S1/V2' }

// A bay typical with equipment: the function of the bay "Feeder" trips its breaker.
const equippedBayTypicalXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="Feeder" desc="Typical feeder" uuid="bay-source-uuid" ${id}="bay-s">
					<ConductingEquipment name="QA1" type="CBR" desc="Typical breaker" uuid="breaker-source-uuid" ${id}="breaker-s"/>
					<ConductingEquipment name="QC1" type="DIS" uuid="disconnector-source-uuid" ${id}="disconnector-s"/>
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
						<Private type="eIEC61850-6-100" ${id}="function-private-s">
							<eIEC61850-6-100:PowerSystemRelations ${id}="relations-s">
								<eIEC61850-6-100:PowerSystemRelation name="Trips" relation="TEMPLATE/TEMPLATE/Feeder/QA1" relationUuid="breaker-source-uuid" uuid="relation-source-uuid" ${id}="relation-s"/>
							</eIEC61850-6-100:PowerSystemRelations>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project whose bay "B1" has its own description and already holds a breaker "QA1".
const equippedProjectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" desc="Project bay" uuid="bay-project-uuid" ${id}="bay-t">
					<ConductingEquipment name="QA1" type="CBR" desc="Project breaker" uuid="breaker-project-uuid" ${id}="breaker-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A voltage level typical: the voltage level "E1" is the unit, with its bay "Q1" below it.
const voltageLevelTypicalXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="E1" uuid="voltage-level-source-uuid" ${id}="voltage-level-s">
				<Bay name="Q1" uuid="bay-source-uuid" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project that already holds a voltage level "E1" and, in it, a bay "Q1".
const sameNamesProjectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="E1" ${id}="voltage-level-t">
				<Bay name="Q1" desc="Project bay" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const sameNameVoltageLevel = { ref: voltageLevelRef, title: 'E1', path: 'S1/E1' }
const sameNameBay = { ref: bayRef, title: 'Q1', path: 'S1/E1/Q1' }

/** What the report lists for the levels of the voltage level typical, started from the substation. */
const voltageLevelTypicalLevels: ReportMapping[] = [
	{
		id: 'substation-s',
		tagName: 'Substation',
		mapping: { existing: substationRef },
		reason: 'anchor',
		ambiguous: false,
		selectable: true,
		locked: false,
		candidates: [substation],
	},
	{
		id: 'voltage-level-s',
		tagName: 'VoltageLevel',
		mapping: { create: { name: 'E1_1' } },
		reason: 'none',
		ambiguous: false,
		selectable: true,
		locked: false,
		candidates: [sameNameVoltageLevel],
		dependsOn: 'substation-s',
	},
	{
		id: 'bay-s',
		tagName: 'Bay',
		mapping: { create: { name: 'Q1' } },
		reason: 'none',
		ambiguous: false,
		selectable: true,
		locked: false,
		candidates: [],
		dependsOn: 'voltage-level-s',
	},
]

// A project in which the bay typical was already placed once, in the first of its two voltage levels.
const placedOnceXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="Feeder" uuid="placed-bay-uuid" templateUuid="bay-source-uuid" ${id}="bay-t">
					<Function name="Prot" uuid="placed-function-uuid" templateUuid="function-source-uuid" ${id}="function-t"/>
				</Bay>
			</VoltageLevel>
			<VoltageLevel name="V2" ${id}="second-voltage-level-t"/>
		</Substation>
	</SCL>
`
const placedBay = { ref: bayRef, title: 'Feeder', path: 'S1/V1/Feeder' }

/** What the report lists for the levels of the bay typical placed from a click on the voltage level. */
const fromTheClickedVoltageLevel: ReportMapping[] = [
	{
		id: 'substation-s',
		tagName: 'Substation',
		mapping: { existing: substationRef },
		reason: 'anchor',
		ambiguous: false,
		selectable: true,
		locked: false,
		candidates: [substation],
	},
	{
		id: 'voltage-level-s',
		tagName: 'VoltageLevel',
		mapping: { existing: voltageLevelRef },
		reason: 'anchor',
		ambiguous: false,
		selectable: true,
		locked: false,
		candidates: [voltageLevel],
		dependsOn: 'substation-s',
	},
	{
		id: 'bay-s',
		tagName: 'Bay',
		mapping: { create: { name: 'Feeder' } },
		reason: 'none',
		ambiguous: false,
		selectable: true,
		locked: false,
		candidates: [bay],
		dependsOn: 'voltage-level-s',
	},
]

/** A report node and every node below it. */
function flattenNodes(node: DiffNode): DiffNode[] {
	return [node, ...node.children.flatMap(flattenNodes)]
}

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The project element the user started from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices, by source record id. */
	chosen?: [string, DecisionMapping][]
	/** `instantiate` unless the consumer asked for an update of a project holding no instance yet. */
	scenario?: 'template'
	/** The name the consumer gives the placed unit in the review, after the mapping. */
	namedInReview?: string
	expected: {
		/** What the report lists for the levels of the template, top-down. */
		placement: ReportMapping[]
		/** Every bay of the project once applied, by path. */
		bays: string[]
		/**
		 * What the report announces for the levels of the template and what they hold of their own:
		 * the change, the element, and the element of the project it lands on when there is one — not
		 * looked at when left out.
		 */
		frame?: string[]
		/** Every function of the project once applied, by path. */
		functions: string[]
		/** Every piece of equipment of the project once applied: its path and description — none when left out. */
		equipment?: string[]
		/** What every relation of a function to the power system points at once applied, by path — none when left out. */
		relations?: string[]
		/** The description of the project's bay "B1" once applied — not looked at when left out. */
		bayDescription?: string
		/**
		 * The levels the applied report says were created, each read from its mapping, by path — not
		 * looked at when left out.
		 */
		createdLevels?: string[]
		/**
		 * The kind of level the consumer has to choose a landing for: the report asks for a decision,
		 * an apply without decisions writes nothing and an apply without that choice is refused.
		 */
		undecided?: string
		/**
		 * What the report says of the name of the placed unit, the one the review lets the consumer
		 * edit: whether the engine had to change it, and to what — not looked at when left out.
		 */
		unitName?: { conflict: boolean; suggestedValue: string | undefined }
	}
}

describe('placement mapping — where the levels of an SSD land', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the click is on a voltage level → each TEMPLATE level is mapped onto the level of the click, the bay is created there':
			{
				sourceXml: bayTypicalXml,
				targetXml: projectXml,
				anchor: voltageLevelRef,
				expected: {
					placement: fromTheClickedVoltageLevel,
					frame: ['added Bay Feeder'],
					bays: ['S1/V1/B1', 'S1/V1/Feeder'],
					functions: ['S1/V1/Feeder/Prot'],
				},
			},
		'an update is asked on a project that holds no instance yet → it is a first placement: the levels are listed and followed alike':
			{
				sourceXml: bayTypicalXml,
				targetXml: projectXml,
				anchor: voltageLevelRef,
				scenario: 'template',
				expected: {
					placement: fromTheClickedVoltageLevel,
					frame: ['added Bay Feeder'],
					bays: ['S1/V1/B1', 'S1/V1/Feeder'],
					functions: ['S1/V1/Feeder/Prot'],
				},
			},
		'the click is on the substation, which has one voltage level → that one is the only one there is: mapped onto it':
			{
				sourceXml: bayTypicalXml,
				targetXml: projectXml,
				anchor: substationRef,
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{ ...fromTheClickedVoltageLevel[1], reason: 'only' },
						fromTheClickedVoltageLevel[2],
					],
					bays: ['S1/V1/B1', 'S1/V1/Feeder'],
					functions: ['S1/V1/Feeder/Prot'],
				},
			},
		'the click is on the substation, which has two voltage levels → none is picked: the consumer has to choose, and nothing is written until then':
			{
				sourceXml: bayTypicalXml,
				targetXml: twoVoltageLevelsXml,
				anchor: substationRef,
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{
							...fromTheClickedVoltageLevel[1],
							mapping: undefined,
							reason: 'none',
							ambiguous: true,
							candidates: [voltageLevel, secondVoltageLevel],
						},
						// where the bay lands follows from the voltage level: not known yet
						{ ...fromTheClickedVoltageLevel[2], mapping: undefined, candidates: [] },
					],
					undecided: 'VoltageLevel',
					bays: ['S1/V1/B1'],
					functions: [],
				},
			},
		'… and the consumer has a voltage level created → created, named after its kind, and the bay below it':
			{
				sourceXml: bayTypicalXml,
				targetXml: twoVoltageLevelsXml,
				anchor: substationRef,
				chosen: [['voltage-level-s', { create: {} }]],
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{
							...fromTheClickedVoltageLevel[1],
							mapping: { create: { name: 'VoltageLevel' } },
							reason: 'decision',
							candidates: [voltageLevel, secondVoltageLevel],
						},
						{ ...fromTheClickedVoltageLevel[2], candidates: [] },
					],
					bays: ['S1/V1/B1', 'S1/VoltageLevel/Feeder'],
					functions: ['S1/VoltageLevel/Feeder/Prot'],
				},
			},
		'… and the consumer maps the voltage level onto the second one → the bay is created there': {
			sourceXml: bayTypicalXml,
			targetXml: twoVoltageLevelsXml,
			anchor: substationRef,
			chosen: [['voltage-level-s', { existing: secondVoltageLevelRef }]],
			expected: {
				placement: [
					fromTheClickedVoltageLevel[0],
					{
						...fromTheClickedVoltageLevel[1],
						mapping: { existing: secondVoltageLevelRef },
						reason: 'decision',
						candidates: [voltageLevel, secondVoltageLevel],
					},
					{ ...fromTheClickedVoltageLevel[2], candidates: [] },
				],
				bays: ['S1/V1/B1', 'S1/V2/Feeder'],
				functions: ['S1/V2/Feeder/Prot'],
			},
		},
		'the click is on a voltage level, the consumer maps it onto the other one → the placement follows the choice, not the click':
			{
				sourceXml: bayTypicalXml,
				targetXml: twoVoltageLevelsXml,
				anchor: voltageLevelRef,
				chosen: [['voltage-level-s', { existing: secondVoltageLevelRef }]],
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{
							...fromTheClickedVoltageLevel[1],
							mapping: { existing: secondVoltageLevelRef },
							reason: 'decision',
							candidates: [voltageLevel, secondVoltageLevel],
						},
						{ ...fromTheClickedVoltageLevel[2], candidates: [] },
					],
					bays: ['S1/V1/B1', 'S1/V2/Feeder'],
					functions: ['S1/V2/Feeder/Prot'],
				},
			},
		'the substation has no voltage level → one is created, named after its kind, and the bay below it':
			{
				sourceXml: bayTypicalXml,
				targetXml: noVoltageLevelXml,
				anchor: substationRef,
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{
							...fromTheClickedVoltageLevel[1],
							mapping: { create: { name: 'VoltageLevel' } },
							reason: 'none',
							candidates: [],
						},
						{ ...fromTheClickedVoltageLevel[2], candidates: [] },
					],
					bays: ['S1/VoltageLevel/Feeder'],
					functions: ['S1/VoltageLevel/Feeder/Prot'],
					createdLevels: ['S1/VoltageLevel', 'S1/VoltageLevel/Feeder'],
				},
			},
		'… and the consumer names the voltage level → created under that name': {
			sourceXml: bayTypicalXml,
			targetXml: noVoltageLevelXml,
			anchor: substationRef,
			chosen: [['voltage-level-s', { create: { name: '110kV' } }]],
			expected: {
				placement: [
					fromTheClickedVoltageLevel[0],
					{
						...fromTheClickedVoltageLevel[1],
						mapping: { create: { name: '110kV' } },
						reason: 'decision',
						candidates: [],
					},
					{ ...fromTheClickedVoltageLevel[2], candidates: [] },
				],
				bays: ['S1/110kV/Feeder'],
				functions: ['S1/110kV/Feeder/Prot'],
			},
		},
		'the voltage level already has a bay of that name → the bay is created under the next free name':
			{
				sourceXml: bayTypicalXml.replaceAll('Feeder', 'B1'),
				targetXml: projectXml,
				anchor: voltageLevelRef,
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						fromTheClickedVoltageLevel[1],
						{ ...fromTheClickedVoltageLevel[2], mapping: { create: { name: 'B1_1' } } },
					],
					bays: ['S1/V1/B1', 'S1/V1/B1_1'],
					functions: ['S1/V1/B1_1/Prot'],
				},
			},
		'the consumer maps the bay onto a bay of the project → the function lands in it, the equipment it lacks is added, what it holds is left as it is':
			{
				sourceXml: equippedBayTypicalXml,
				targetXml: equippedProjectXml,
				anchor: voltageLevelRef,
				chosen: [['bay-s', { existing: bayRef }]],
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						fromTheClickedVoltageLevel[1],
						{
							...fromTheClickedVoltageLevel[2],
							mapping: { existing: bayRef },
							reason: 'decision',
						},
					],
					frame: [
						'unchanged Bay Feeder = S1/V1/B1',
						'unchanged ConductingEquipment QA1 = S1/V1/B1/QA1',
						'added ConductingEquipment QC1',
					],
					bays: ['S1/V1/B1'],
					functions: ['S1/V1/B1/Prot'],
					equipment: ['S1/V1/B1/QA1 (Project breaker)', 'S1/V1/B1/QC1 ()'],
					relations: ['S1/V1/B1/QA1'],
					bayDescription: 'Project bay',
				},
			},
		'a voltage level typical, the project holds a voltage level and a bay of those names → both are created, under free names':
			{
				sourceXml: voltageLevelTypicalXml,
				targetXml: sameNamesProjectXml,
				anchor: substationRef,
				expected: {
					placement: voltageLevelTypicalLevels,
					frame: ['added VoltageLevel E1', 'added Bay Q1'],
					bays: ['S1/E1/Q1', 'S1/E1_1/Q1'],
					functions: ['S1/E1_1/Q1/Prot'],
				},
			},
		'… the consumer maps the voltage level onto the project one → its bay is still a new bay, under a free name':
			{
				sourceXml: voltageLevelTypicalXml,
				targetXml: sameNamesProjectXml,
				anchor: substationRef,
				chosen: [['voltage-level-s', { existing: voltageLevelRef }]],
				expected: {
					placement: [
						voltageLevelTypicalLevels[0],
						{
							...voltageLevelTypicalLevels[1],
							mapping: { existing: voltageLevelRef },
							reason: 'decision',
						},
						{
							...voltageLevelTypicalLevels[2],
							mapping: { create: { name: 'Q1_1' } },
							candidates: [sameNameBay],
						},
					],
					frame: ['unchanged VoltageLevel E1 = S1/E1', 'added Bay Q1'],
					bays: ['S1/E1/Q1', 'S1/E1/Q1_1'],
					functions: ['S1/E1/Q1_1/Prot'],
					bayDescription: 'Project bay',
				},
			},
		'… and the consumer maps the bay onto the project one too → the function lands in it, no level is created':
			{
				sourceXml: voltageLevelTypicalXml,
				targetXml: sameNamesProjectXml,
				anchor: substationRef,
				chosen: [
					['voltage-level-s', { existing: voltageLevelRef }],
					['bay-s', { existing: bayRef }],
				],
				expected: {
					placement: [
						voltageLevelTypicalLevels[0],
						{
							...voltageLevelTypicalLevels[1],
							mapping: { existing: voltageLevelRef },
							reason: 'decision',
						},
						{
							...voltageLevelTypicalLevels[2],
							mapping: { existing: bayRef },
							reason: 'decision',
							candidates: [sameNameBay],
						},
					],
					frame: ['unchanged VoltageLevel E1 = S1/E1', 'unchanged Bay Q1 = S1/E1/Q1'],
					bays: ['S1/E1/Q1'],
					functions: ['S1/E1/Q1/Prot'],
					bayDescription: 'Project bay',
				},
			},
		'the typical is placed a second time beside its first bay → the bay is created under the next free name, said to be changed by the engine':
			{
				sourceXml: bayTypicalXml,
				targetXml: placedOnceXml,
				anchor: voltageLevelRef,
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{ ...fromTheClickedVoltageLevel[1], candidates: [voltageLevel, secondVoltageLevel] },
						{
							...fromTheClickedVoltageLevel[2],
							mapping: { create: { name: 'Feeder_1' } },
							candidates: [placedBay],
						},
					],
					unitName: { conflict: true, suggestedValue: 'Feeder_1' },
					bays: ['S1/V1/Feeder', 'S1/V1/Feeder_1'],
					functions: ['S1/V1/Feeder/Prot', 'S1/V1/Feeder_1/Prot'],
				},
			},
		'… the consumer names the second bay → created under that name, which the engine did not change':
			{
				sourceXml: bayTypicalXml,
				targetXml: placedOnceXml,
				anchor: voltageLevelRef,
				chosen: [['bay-s', { create: { name: 'Q01' } }]],
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{ ...fromTheClickedVoltageLevel[1], candidates: [voltageLevel, secondVoltageLevel] },
						{
							...fromTheClickedVoltageLevel[2],
							mapping: { create: { name: 'Q01' } },
							reason: 'decision',
							candidates: [placedBay],
						},
					],
					unitName: { conflict: false, suggestedValue: 'Q01' },
					bays: ['S1/V1/Feeder', 'S1/V1/Q01'],
					functions: ['S1/V1/Feeder/Prot', 'S1/V1/Q01/Prot'],
				},
			},
		'… the consumer names the second bay, then renames it in the review → the review has the last word':
			{
				sourceXml: bayTypicalXml,
				targetXml: placedOnceXml,
				anchor: voltageLevelRef,
				chosen: [['bay-s', { create: { name: 'Q01' } }]],
				namedInReview: 'Q02',
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{ ...fromTheClickedVoltageLevel[1], candidates: [voltageLevel, secondVoltageLevel] },
						{
							...fromTheClickedVoltageLevel[2],
							mapping: { create: { name: 'Q01' } },
							reason: 'decision',
							candidates: [placedBay],
						},
					],
					bays: ['S1/V1/Feeder', 'S1/V1/Q02'],
					functions: ['S1/V1/Feeder/Prot', 'S1/V1/Q02/Prot'],
				},
			},
		'… the consumer places it in the other voltage level → its name is free there: created as it is named':
			{
				sourceXml: bayTypicalXml,
				targetXml: placedOnceXml,
				anchor: voltageLevelRef,
				chosen: [['voltage-level-s', { existing: secondVoltageLevelRef }]],
				expected: {
					placement: [
						fromTheClickedVoltageLevel[0],
						{
							...fromTheClickedVoltageLevel[1],
							mapping: { existing: secondVoltageLevelRef },
							reason: 'decision',
							candidates: [voltageLevel, secondVoltageLevel],
						},
						{ ...fromTheClickedVoltageLevel[2], candidates: [] },
					],
					unitName: { conflict: false, suggestedValue: 'Feeder' },
					bays: ['S1/V1/Feeder', 'S1/V2/Feeder'],
					functions: ['S1/V1/Feeder/Prot', 'S1/V2/Feeder/Prot'],
				},
			},
		'the consumer names the bay → created under that name': {
			sourceXml: bayTypicalXml,
			targetXml: projectXml,
			anchor: voltageLevelRef,
			chosen: [['bay-s', { create: { name: 'Q01' } }]],
			expected: {
				placement: [
					fromTheClickedVoltageLevel[0],
					fromTheClickedVoltageLevel[1],
					{
						...fromTheClickedVoltageLevel[2],
						mapping: { create: { name: 'Q01' } },
						reason: 'decision',
					},
				],
				bays: ['S1/V1/B1', 'S1/V1/Q01'],
				functions: ['S1/V1/Q01/Prot'],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const decisionMappings = new Map(testCase.chosen ?? [])
		const lifecycleTarget = {
			verb: 'ssd' as const,
			sourceQuery: source.query,
			ref: sourceSubstationRef,
			anchor: testCase.anchor,
			scenario: testCase.scenario ?? ('instantiate' as const),
		}

		const lifecycleReport = await report(target.query, {
			...lifecycleTarget,
			resolution: { mappings: decisionMappings },
		})
		const placement = lifecycleReport.mappings.filter((mapping) =>
			STRUCTURAL_TAGS.includes(mapping.tagName),
		)
		expect(placement, 'report').toEqual(testCase.expected.placement)
		// a first placement asks for no decision, wherever its levels land — unless one is not decided
		expect(lifecycleReport.needsDecisions, 'report').toBe(testCase.expected.undecided !== undefined)

		if (testCase.expected.unitName) {
			const unitGroup = allGroups(lifecycleReport).find((group) =>
				STRUCTURAL_TAGS.includes(group.primary.tagName),
			)
			const name = unitGroup?.editableAttributes?.find((editable) => editable.attr === 'name')
			expect(
				{ conflict: name?.conflict ?? false, suggestedValue: name?.suggestedValue },
				'report',
			).toEqual(testCase.expected.unitName)
		}

		if (testCase.expected.frame) {
			const frameInstances = lifecycleReport.instances.filter((instance) =>
				STRUCTURAL_TAGS.includes(instance.tree.tagName),
			)
			const frame: string[] = []
			for (const node of frameInstances.flatMap((instance) => flattenNodes(instance.tree))) {
				const name = node.sourceRef
					? await source.query.any.getAttribute(node.sourceRef, { name: 'name' })
					: undefined
				const landsOn = node.instanceRef
					? await buildElementPath(target.query, node.instanceRef as Scl.Ref<Scl.ElementsOf>)
					: undefined
				frame.push(
					`${node.change} ${node.tagName} ${name ?? ''}${landsOn ? ` = ${landsOn.path}` : ''}`,
				)
			}
			expect(frame, 'report').toEqual(testCase.expected.frame)
		}

		// what the consumer edits in the review rides the decision of the unit's group
		const decisions: DecisionMap = new Map()
		const unitGroup = allGroups(lifecycleReport).find((group) =>
			STRUCTURAL_TAGS.includes(group.primary.tagName),
		)
		if (testCase.namedInReview && unitGroup) {
			decisions.set(unitGroup.id, { action: 'accept', values: { name: testCase.namedInReview } })
		}

		let appliedReport = lifecycleReport
		if (testCase.expected.undecided) {
			// without decisions nothing is written; with decisions but no choice for the level, refused
			await target.transaction(async (tx) => {
				await apply(tx, { ...lifecycleTarget, report: lifecycleReport })
			})
			const refused = target.transaction(async (tx) => {
				await apply(tx, {
					...lifecycleTarget,
					report: lifecycleReport,
					resolution: { decisions, mappings: decisionMappings },
				})
			})
			await expect(refused, 'apply').rejects.toThrow(testCase.expected.undecided)
		} else {
			await target.transaction(async (tx) => {
				const applied = await apply(tx, {
					...lifecycleTarget,
					report: lifecycleReport,
					resolution: { decisions, mappings: decisionMappings },
				})
				appliedReport = applied.report
			})
		}

		if (testCase.expected.createdLevels) {
			const createdLevels: string[] = []
			for (const mapping of appliedReport.mappings) {
				if (!STRUCTURAL_TAGS.includes(mapping.tagName) || !mapping.appliedRef) continue
				if (!mapping.mapping || !('create' in mapping.mapping)) continue
				const elementPath = await buildElementPath(
					target.query,
					mapping.appliedRef as Scl.Ref<Scl.ElementsOf>,
				)
				createdLevels.push(elementPath?.path ?? '')
			}
			expect(createdLevels, 'apply').toEqual(testCase.expected.createdLevels)
		}

		async function pathsOf(tagName: 'Bay' | 'Function'): Promise<string[]> {
			const paths: string[] = []
			for (const record of await target!.query.getRecordsByTagName(tagName)) {
				const elementPath = await buildElementPath(target!.query, {
					tagName,
					id: record.id,
				} as Scl.Ref<Scl.ElementsOf>)
				paths.push(elementPath?.path ?? '')
			}
			return paths.sort()
		}
		expect(await pathsOf('Bay'), 'apply').toEqual(testCase.expected.bays)
		expect(await pathsOf('Function'), 'apply').toEqual(testCase.expected.functions)

		const equipment: string[] = []
		for (const record of await target.query.getRecordsByTagName('ConductingEquipment')) {
			const elementPath = await buildElementPath(target.query, record)
			const description = await target.query.getAttribute(record, { name: 'desc' })
			equipment.push(`${elementPath?.path ?? ''} (${description ?? ''})`)
		}
		expect(equipment.sort(), 'apply').toEqual(testCase.expected.equipment ?? [])

		const relations: string[] = []
		for (const record of await target.query.getRecordsByTagName('PowerSystemRelation')) {
			const relation = await target.query.getAttribute(record, { name: 'relation' })
			relations.push(relation ?? '')
		}
		expect(relations.sort(), 'apply').toEqual(testCase.expected.relations ?? [])

		if (testCase.expected.bayDescription !== undefined) {
			const bayDescription = await target.query.getAttribute(bayRef, { name: 'desc' })
			expect(bayDescription, 'apply').toBe(testCase.expected.bayDescription)
			// the project's bay is not an instance of the template's
			const bayLineage = await target.query.getAttribute(bayRef, { name: 'templateUuid' })
			expect(bayLineage || undefined, 'apply').toBeUndefined()
		}

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The record id standing, in an expected mapping, for a level the instantiate created. */
const CREATED = '<created>'
const createdBayRef = { tagName: 'Bay', id: CREATED } as Scl.Ref<'Bay'>

/** The template's bay gains a second disconnector. */
const gainDisconnector = async (tx: Scl.Transaction): Promise<void> => {
	await tx.addChild({ tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>, {
		tagName: 'ConductingEquipment',
		attributes: { name: 'QC2', type: 'DIS', uuid: 'second-disconnector-source-uuid' },
	})
}

/** What an update lists for a level the instance already sits on. */
function heldLevel(
	level: ReportMapping,
	candidate: { ref: Scl.Ref<Scl.ElementsOf>; title: string; path: string },
): ReportMapping {
	return {
		...level,
		mapping: { existing: candidate.ref },
		reason: 'lineage',
		locked: true,
		candidates: [candidate],
	}
}

/** The template's bay gains a function. */
const gainFunction = async (tx: Scl.Transaction): Promise<void> => {
	await tx.addChild({ tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>, {
		tagName: 'Function',
		attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
	})
}

/** The template's voltage level gains a bay "Q2" holding a function. */
const gainBay = async (tx: Scl.Transaction): Promise<void> => {
	const gainedBay = await tx.addChild(
		{ tagName: 'VoltageLevel', id: 'voltage-level-s' } as Scl.Ref<'VoltageLevel'>,
		{ tagName: 'Bay', attributes: { name: 'Q2', uuid: 'second-bay-source-uuid' } },
	)
	await tx.addChild({ tagName: 'Bay', id: gainedBay.id } as Scl.Ref<'Bay'>, {
		tagName: 'Function',
		attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
	})
}

// The project of the same names, whose voltage level holds a second bay of its own, "Q2".
const sameNamesAndOwnBayProjectXml = sameNamesProjectXml.replace(
	'</VoltageLevel>',
	`	<Bay name="Q2" desc="Project bay 2" ${id}="own-bay-t"/>
			</VoltageLevel>`,
)

type UpdateTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The project element the user started from — the voltage level when left out. */
	anchor?: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices at the first instantiate, by source record id. */
	chosenAtInstantiate?: [string, DecisionMapping][]
	/** What the template's author changes between the instantiate and the update. */
	editTemplate: (tx: Scl.Transaction) => Promise<void>
	expected: {
		/** What the update's report lists for the levels of the template, top-down. */
		placement: ReportMapping[]
		/** What the update's report announces for the levels and what they hold of their own. */
		frame: string[]
		/** Every piece of equipment of the project once updated: its path and description. */
		equipment: string[]
		/** Every function of the project once updated, by path — not looked at when left out. */
		functions?: string[]
	}
}

describe('placement mapping — an update finds where the instance was placed', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		'the bay was mapped onto a bay of the project, the template bay gains equipment → listed as held there, locked, and the equipment is added to that bay':
			{
				sourceXml: equippedBayTypicalXml,
				targetXml: equippedProjectXml,
				chosenAtInstantiate: [['bay-s', { existing: bayRef }]],
				editTemplate: gainDisconnector,
				expected: {
					placement: [
						heldLevel(fromTheClickedVoltageLevel[0], substation),
						heldLevel(fromTheClickedVoltageLevel[1], voltageLevel),
						heldLevel(fromTheClickedVoltageLevel[2], bay),
					],
					frame: [
						'unchanged Bay Feeder = S1/V1/B1',
						'unchanged ConductingEquipment QA1 = S1/V1/B1/QA1',
						'unchanged ConductingEquipment QC1 = S1/V1/B1/QC1',
						'added ConductingEquipment QC2',
					],
					equipment: ['S1/V1/B1/QA1 (Project breaker)', 'S1/V1/B1/QC1 ()', 'S1/V1/B1/QC2 ()'],
				},
			},
		'the bay was created by the instantiate, the template bay gains equipment → listed as held by the created bay, locked, and the equipment is added to it':
			{
				sourceXml: equippedBayTypicalXml,
				targetXml: equippedProjectXml,
				editTemplate: gainDisconnector,
				expected: {
					placement: [
						heldLevel(fromTheClickedVoltageLevel[0], substation),
						heldLevel(fromTheClickedVoltageLevel[1], voltageLevel),
						heldLevel(fromTheClickedVoltageLevel[2], {
							ref: createdBayRef,
							title: 'Feeder',
							path: 'S1/V1/Feeder',
						}),
					],
					frame: [
						'unchanged Bay Feeder = S1/V1/Feeder',
						'unchanged ConductingEquipment QA1 = S1/V1/Feeder/QA1',
						'unchanged ConductingEquipment QC1 = S1/V1/Feeder/QC1',
						'added ConductingEquipment QC2',
					],
					equipment: [
						'S1/V1/B1/QA1 (Project breaker)',
						'S1/V1/Feeder/QA1 (Typical breaker)',
						'S1/V1/Feeder/QC1 ()',
						'S1/V1/Feeder/QC2 ()',
					],
				},
			},
		'the bay was created by the instantiate, the template bay gains a function → the function lands in the created bay':
			{
				sourceXml: equippedBayTypicalXml,
				targetXml: equippedProjectXml,
				editTemplate: gainFunction,
				expected: {
					placement: [
						heldLevel(fromTheClickedVoltageLevel[0], substation),
						heldLevel(fromTheClickedVoltageLevel[1], voltageLevel),
						heldLevel(fromTheClickedVoltageLevel[2], {
							ref: createdBayRef,
							title: 'Feeder',
							path: 'S1/V1/Feeder',
						}),
					],
					frame: [
						'unchanged Bay Feeder = S1/V1/Feeder',
						'unchanged ConductingEquipment QA1 = S1/V1/Feeder/QA1',
						'unchanged ConductingEquipment QC1 = S1/V1/Feeder/QC1',
					],
					equipment: [
						'S1/V1/B1/QA1 (Project breaker)',
						'S1/V1/Feeder/QA1 (Typical breaker)',
						'S1/V1/Feeder/QC1 ()',
					],
					functions: ['S1/V1/Feeder/Ctrl', 'S1/V1/Feeder/Prot'],
				},
			},
		'the bay was mapped onto a bay of the project, the template bay gains a function → the function lands in that bay':
			{
				sourceXml: equippedBayTypicalXml,
				targetXml: equippedProjectXml,
				chosenAtInstantiate: [['bay-s', { existing: bayRef }]],
				editTemplate: gainFunction,
				expected: {
					placement: [
						heldLevel(fromTheClickedVoltageLevel[0], substation),
						heldLevel(fromTheClickedVoltageLevel[1], voltageLevel),
						heldLevel(fromTheClickedVoltageLevel[2], bay),
					],
					frame: [
						'unchanged Bay Feeder = S1/V1/B1',
						'unchanged ConductingEquipment QA1 = S1/V1/B1/QA1',
						'unchanged ConductingEquipment QC1 = S1/V1/B1/QC1',
					],
					equipment: ['S1/V1/B1/QA1 (Project breaker)', 'S1/V1/B1/QC1 ()'],
					functions: ['S1/V1/B1/Ctrl', 'S1/V1/B1/Prot'],
				},
			},
		'a voltage level typical mapped onto the project levels, its bay gains equipment → the levels are listed as held, the equipment is added to the project bay':
			{
				sourceXml: voltageLevelTypicalXml,
				targetXml: sameNamesAndOwnBayProjectXml,
				anchor: substationRef,
				chosenAtInstantiate: [
					['voltage-level-s', { existing: voltageLevelRef }],
					['bay-s', { existing: bayRef }],
				],
				editTemplate: gainDisconnector,
				expected: {
					placement: [
						heldLevel(voltageLevelTypicalLevels[0], substation),
						heldLevel(voltageLevelTypicalLevels[1], sameNameVoltageLevel),
						heldLevel(voltageLevelTypicalLevels[2], sameNameBay),
					],
					frame: [
						'unchanged VoltageLevel E1 = S1/E1',
						'unchanged Bay Q1 = S1/E1/Q1',
						'added ConductingEquipment QC2',
					],
					equipment: ['S1/E1/Q1/QC2 ()'],
					functions: ['S1/E1/Q1/Prot'],
				},
			},
		'… its voltage level gains a bay named like a bay the project holds there → the gained bay is new: created beside it, with its function':
			{
				sourceXml: voltageLevelTypicalXml,
				targetXml: sameNamesAndOwnBayProjectXml,
				anchor: substationRef,
				chosenAtInstantiate: [
					['voltage-level-s', { existing: voltageLevelRef }],
					['bay-s', { existing: bayRef }],
				],
				editTemplate: gainBay,
				expected: {
					placement: [
						heldLevel(voltageLevelTypicalLevels[0], substation),
						heldLevel(voltageLevelTypicalLevels[1], sameNameVoltageLevel),
						heldLevel(voltageLevelTypicalLevels[2], sameNameBay),
					],
					frame: [
						'unchanged VoltageLevel E1 = S1/E1',
						'unchanged Bay Q1 = S1/E1/Q1',
						'added Bay Q2',
					],
					equipment: [],
					functions: ['S1/E1/Q1/Prot', 'S1/E1/Q2_1/Ctrl'],
				},
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<UpdateTestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'ssd' as const,
			sourceQuery: source.query,
			ref: sourceSubstationRef,
			anchor: testCase.anchor ?? voltageLevelRef,
		}

		const levelsAtStart = new Set<string>()
		for (const tagName of TOPOLOGY_STRUCTURAL_TAGS) {
			for (const record of await target.query.getRecordsByTagName(tagName)) {
				levelsAtStart.add(record.id)
			}
		}
		const nameCreated = (ref: Scl.Ref<Scl.ElementsOf>): Scl.Ref<Scl.ElementsOf> =>
			ref.id && levelsAtStart.has(ref.id) ? ref : { ...ref, id: CREATED }

		// 1. first instantiate, with the consumer's choices
		const decisionMappings = new Map(testCase.chosenAtInstantiate ?? [])
		const instantiateReport = await report(target.query, {
			...lifecycleTarget,
			scenario: 'instantiate',
			resolution: { mappings: decisionMappings },
		})
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				scenario: 'instantiate',
				report: instantiateReport,
				resolution: { decisions: new Map(), mappings: decisionMappings },
			})
		})

		// 2. the template moves on
		await source.transaction(testCase.editTemplate)

		// 3. the update
		const updateReport = await report(target.query, { ...lifecycleTarget, scenario: 'template' })
		const placement = updateReport.mappings
			.filter((mapping) => STRUCTURAL_TAGS.includes(mapping.tagName))
			.map((mapping) => ({
				...mapping,
				mapping:
					mapping.mapping && 'existing' in mapping.mapping
						? { existing: nameCreated(mapping.mapping.existing) }
						: mapping.mapping,
				candidates: mapping.candidates.map((candidate) => ({
					...candidate,
					ref: nameCreated(candidate.ref),
				})),
			}))
		expect(placement, 'report').toEqual(testCase.expected.placement)

		const frameInstances = updateReport.instances.filter((instance) =>
			STRUCTURAL_TAGS.includes(instance.tree.tagName),
		)
		const frame: string[] = []
		for (const node of frameInstances.flatMap((instance) => flattenNodes(instance.tree))) {
			const name = node.sourceRef
				? await source.query.any.getAttribute(node.sourceRef, { name: 'name' })
				: undefined
			const landsOn = node.instanceRef
				? await buildElementPath(target.query, node.instanceRef as Scl.Ref<Scl.ElementsOf>)
				: undefined
			frame.push(
				`${node.change} ${node.tagName} ${name ?? ''}${landsOn ? ` = ${landsOn.path}` : ''}`,
			)
		}
		expect(frame, 'report').toEqual(testCase.expected.frame)

		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				scenario: 'template',
				report: updateReport,
				resolution: { decisions: new Map() },
			})
		})

		const equipment: string[] = []
		for (const record of await target.query.getRecordsByTagName('ConductingEquipment')) {
			const elementPath = await buildElementPath(target.query, record)
			const description = await target.query.getAttribute(record, { name: 'desc' })
			equipment.push(`${elementPath?.path ?? ''} (${description ?? ''})`)
		}
		expect(equipment.sort(), 'apply').toEqual(testCase.expected.equipment)

		if (testCase.expected.functions) {
			const functions: string[] = []
			for (const record of await target.query.getRecordsByTagName('Function')) {
				const elementPath = await buildElementPath(target.query, record)
				functions.push(elementPath?.path ?? '')
			}
			expect(functions.sort(), 'apply').toEqual(testCase.expected.functions)
		}

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// A bay typical whose application refers to a role "HMI_PC" sitting in the bay.
const bayTypicalWithRoleXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="Feeder" uuid="bay-source-uuid" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="private-s">
						<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s"/>
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
							<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/Feeder/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project whose two voltage levels each hold a role of their own.
const rolesPerVoltageLevelXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Private type="eIEC61850-6-100" ${id}="first-private-t">
					<eIEC61850-6-100:AllocationRole name="Operator" uuid="first-role-project-uuid" ${id}="first-role-t"/>
				</Private>
			</VoltageLevel>
			<VoltageLevel name="V2" ${id}="second-voltage-level-t">
				<Private type="eIEC61850-6-100" ${id}="second-private-t">
					<eIEC61850-6-100:AllocationRole name="Dispatcher" uuid="second-role-project-uuid" ${id}="second-role-t"/>
				</Private>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type SharedElementTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	anchor: Scl.Ref<Scl.ElementsOf>
	chosen?: [string, DecisionMapping][]
	expected: {
		/** The project roles the report offers for the template's role, nearest first, by path. */
		roleCandidates: string[]
	}
}

describe('placement mapping — the shared elements are looked for from where the template lands', () => {
	const testCases: SclTest.TestCases<SharedElementTestCase> = {
		'started from the substation, the voltage level mapped onto the second one → the roles of that voltage level come first':
			{
				sourceXml: bayTypicalWithRoleXml,
				targetXml: rolesPerVoltageLevelXml,
				anchor: substationRef,
				chosen: [['voltage-level-s', { existing: secondVoltageLevelRef }]],
				expected: { roleCandidates: ['S1/V2/Dispatcher', 'S1/V1/Operator'] },
			},
		'started from the first voltage level, nothing chosen → the roles of that voltage level come first':
			{
				sourceXml: bayTypicalWithRoleXml,
				targetXml: rolesPerVoltageLevelXml,
				anchor: voltageLevelRef,
				expected: { roleCandidates: ['S1/V1/Operator', 'S1/V2/Dispatcher'] },
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<SharedElementTestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleReport = await report(target.query, {
			verb: 'ssd',
			sourceQuery: source.query,
			ref: sourceSubstationRef,
			anchor: testCase.anchor,
			scenario: 'instantiate',
			resolution: { mappings: new Map(testCase.chosen ?? []) },
		})

		const roleMapping = lifecycleReport.mappings.find((mapping) => mapping.id === 'role-s')
		const roleCandidates = roleMapping?.candidates.map((candidate) => candidate.path)
		expect(roleCandidates, 'report').toEqual(testCase.expected.roleCandidates)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
