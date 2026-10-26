import { reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { fsd as updateFsd } from '@/v2019C1/extensions/lifecycle/update/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type {
	DecisionMap,
	DiffNode,
	DiffReport,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// A logical node's type is named by an id of its own file: a template and a project may hold the same type under two
// ids, or two types under one id. An update compares the type the template names with the one the instance names by
// what they hold, and a type the template changed reaches the instance through the import of its closure: an equal
// type reused, a free id kept, a taken one forked — never the template's id written as it is.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>

/** The data objects of the switch controller type: the position, and the behaviour when it gained it. */
const POSITION = `<DO name="Pos" type="DPC_Type"/>`
const BEHAVIOUR = `<DO name="Beh" type="ENS_Type"/>`

const BEHAVIOUR_TYPES = /* xml */ `
	<DOType id="ENS_Type" cdc="ENS">
		<DA name="stVal" bType="Enum" type="BehModeKind" fc="ST"/>
	</DOType>
	<EnumType id="BehModeKind">
		<EnumVal ord="1">on</EnumVal>
	</EnumType>
`

/** A breaker logical node of the function, of a type of its own. */
const BREAKER = {
	lnode:
		'<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_Type" uuid="breaker-src-uuid"/>',
	type: /* xml */ `
		<LNodeType id="XCBR_Type" lnClass="XCBR">
			<DO name="Pos" type="DPC_Type"/>
			<DO name="BlkOpn" type="DPC_Type"/>
		</LNodeType>
	`,
}

/** The function template: `Prot` and its switch controller (`lnodeAttributes`), its type holding `dataObjects`. */
function templateXml(
	params: { dataObjects?: string; lnodeAttributes?: string; withBreaker?: boolean } = {},
): string {
	const {
		dataObjects = POSITION,
		lnodeAttributes = 'lnType="CSWI_Type"',
		withBreaker = false,
	} = params
	const breaker = withBreaker ? BREAKER : { lnode: '', type: '' }
	return /* xml */ `
		<SCL ${ns} ${id}="fsd">
			<Header id="fsd-header" uuid="fsd-file-uuid" version="1" revision="A"/>
			<Substation name="TEMPLATE">
				<VoltageLevel name="TEMPLATE">
					<Bay name="TEMPLATE">
						<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" ${lnodeAttributes} uuid="lnode-src-uuid"/>
							${breaker.lnode}
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates>
				<LNodeType id="CSWI_Type" lnClass="CSWI">
					${dataObjects}
				</LNodeType>
				<DOType id="DPC_Type" cdc="DPC">
					<DA name="stVal" bType="BOOLEAN" fc="ST"/>
				</DOType>
				${dataObjects.includes('Beh') ? BEHAVIOUR_TYPES : ''}
				${breaker.type}
			</DataTypeTemplates>
		</SCL>
	`
}

/** The project: S1 / V1 with the bays B1 and B2 (`secondBay` holding what it holds), and its `types`. */
function projectXml(params: { types?: string; secondBay?: string } = {}): string {
	const { types = '', secondBay = '' } = params
	const dataTypeTemplates = types ? `<DataTypeTemplates>${types}</DataTypeTemplates>` : ''
	return /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Header id="project" uuid="project-uuid"/>
			<Substation name="S1">
				<VoltageLevel name="V1">
					<Bay name="B1" ${id}="bay-1"/>
					<Bay name="B2" ${id}="bay-2">${secondBay}</Bay>
				</VoltageLevel>
			</Substation>
			${dataTypeTemplates}
		</SCL>
	`
}

/** The position type the project holds under its own id, with the content of the template's. */
const POSITION_TYPE_OF_ITS_OWN = /* xml */ `
	<LNodeType id="MyCSWI" lnClass="CSWI">
		<DO name="Pos" type="MyDPC"/>
	</LNodeType>
	<DOType id="MyDPC" cdc="DPC">
		<DA name="stVal" bType="BOOLEAN" fc="ST"/>
	</DOType>
`

/** Another type the project holds under the template's type id, named by a function of its own in B2. */
const ANOTHER_TYPE_UNDER_THE_TEMPLATE_ID = {
	types: /* xml */ `
		<LNodeType id="CSWI_Type" lnClass="CSWI">
			<DO name="Beh" type="ENS_Type"/>
		</LNodeType>
		${BEHAVIOUR_TYPES}
	`,
	secondBay: /* xml */ `
		<Function name="Own" uuid="own-function-uuid">
			<LNode iedName="None" lnClass="CSWI" lnInst="7" lnType="CSWI_Type" uuid="own-lnode-uuid"/>
		</Function>
	`,
}

/** An instance of another template in B2, naming the template's type as the project holds it. */
const INSTANCE_OF_ANOTHER_TEMPLATE = /* xml */ `
	<Function name="Other" uuid="other-instance-uuid" templateUuid="other-template-uuid">
		<LNode iedName="None" lnClass="CSWI" lnInst="3" lnType="CSWI_Type" uuid="other-lnode-uuid" templateUuid="other-lnode-src-uuid"/>
	</Function>
`

const POSITION_TYPE = /* xml */ `
	<LNodeType id="CSWI_Type" lnClass="CSWI">
		<DO name="Pos" type="DPC_Type"/>
	</LNodeType>
	<DOType id="DPC_Type" cdc="DPC">
		<DA name="stVal" bType="BOOLEAN" fc="ST"/>
	</DOType>
`

/** The logical node of the instance placed in `bay`. */
function placedIn(bay: string): string {
	return `//default:Bay[@name="${bay}"]/default:Function[@name="Prot"]/default:LNode`
}
/** A type holding the data object `name`. */
function typeHolding(name: string): string {
	return `//default:LNodeType[default:DO/@name="${name}"]/@id`
}
const DANGLING_TYPE = '//default:LNode[@lnType][not(@lnType = //default:LNodeType/@id)]'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The bays the template is first placed in. Default: B1. */
	placedIn?: string[]
	/** The newer template. */
	nextSourceXml: string
	/** The type changes the update's report lists, `<name>: <before> -> <after>` (a fork's hash as `<fork>`), sorted. */
	reported: string[]
	/** The consumer's decisions on the update's report. Default: every group at its suggested action. */
	decide?: (report: DiffReport) => DecisionMap
	/** The update verb called on its own, with no report. */
	updatedDirectly?: boolean
}

describe('lifecycle — a logical node type across the template and the project', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'project holding the template type under its own id, the template changing a description -> nothing listed on the type, the instance stays on it':
			{
				sourceXml: templateXml(),
				targetXml: projectXml({ types: POSITION_TYPE_OF_ITS_OWN }),
				nextSourceXml: templateXml({ lnodeAttributes: 'lnType="CSWI_Type" desc="rev2"' }),
				reported: [],
				expectedQueries: [`${placedIn('B1')}[@lnType="MyCSWI"][@desc="rev2"]`],
				unexpectedQueries: [DANGLING_TYPE, '//default:LNodeType[@id="CSWI_Type"]'],
			},

		'project holding another type under the template type id, the template changing a description -> the instance stays on the template type':
			{
				sourceXml: templateXml(),
				targetXml: projectXml(ANOTHER_TYPE_UNDER_THE_TEMPLATE_ID),
				nextSourceXml: templateXml({ lnodeAttributes: 'lnType="CSWI_Type" desc="rev2"' }),
				reported: [],
				expectedQueries: [
					`${placedIn('B1')}[@desc="rev2"][@lnType = ${typeHolding('Pos')}]`,
					'//default:Function[@name="Own"]/default:LNode[@lnType="CSWI_Type"]',
					'//default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Beh"]',
				],
				unexpectedQueries: [DANGLING_TYPE],
			},

		'template type gaining a data object -> listed, the type the instance names updated under its id':
			{
				sourceXml: templateXml(),
				targetXml: projectXml(),
				nextSourceXml: templateXml({ dataObjects: `${POSITION}${BEHAVIOUR}` }),
				reported: ['lnType: CSWI_Type -> CSWI_Type'],
				expectedQueries: [
					`${placedIn('B1')}[@lnType="CSWI_Type"]`,
					'//default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Beh"]',
				],
				unexpectedQueries: [DANGLING_TYPE, '//default:LNodeType[2]'],
			},

		'… its group skipped -> the instance keeps its type': {
			sourceXml: templateXml(),
			targetXml: projectXml(),
			nextSourceXml: templateXml({ dataObjects: `${POSITION}${BEHAVIOUR}` }),
			reported: ['lnType: CSWI_Type -> CSWI_Type'],
			decide: skipEveryGroup,
			expectedQueries: [`${placedIn('B1')}[@lnType="CSWI_Type"]`],
			unexpectedQueries: ['//default:DO[@name="Beh"]', '//default:LNodeType[2]'],
		},

		'… the update verb called on its own -> the type follows': {
			sourceXml: templateXml(),
			targetXml: projectXml(),
			nextSourceXml: templateXml({ dataObjects: `${POSITION}${BEHAVIOUR}` }),
			reported: ['lnType: CSWI_Type -> CSWI_Type'],
			updatedDirectly: true,
			expectedQueries: ['//default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Beh"]'],
			unexpectedQueries: [DANGLING_TYPE, '//default:LNodeType[2]'],
		},

		'two logical nodes of two types, one type gaining a data object -> that one listed and brought, the other left':
			{
				sourceXml: templateXml({ withBreaker: true }),
				targetXml: projectXml(),
				nextSourceXml: templateXml({ dataObjects: `${POSITION}${BEHAVIOUR}`, withBreaker: true }),
				reported: ['lnType: CSWI_Type -> CSWI_Type'],
				expectedQueries: [
					`${placedIn('B1')}[@lnClass="XCBR"][@lnType="XCBR_Type"]`,
					'//default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Beh"]',
				],
				unexpectedQueries: [DANGLING_TYPE, '//default:LNodeType[3]'],
			},

		'two instances, the template type gaining a data object -> both follow, one type under its id':
			{
				sourceXml: templateXml(),
				targetXml: projectXml(),
				placedIn: ['bay-1', 'bay-1'],
				nextSourceXml: templateXml({ dataObjects: `${POSITION}${BEHAVIOUR}` }),
				reported: ['lnType: CSWI_Type -> CSWI_Type', 'lnType: CSWI_Type -> CSWI_Type'],
				expectedQueries: [
					`${placedIn('B1')}[@lnType="CSWI_Type"]`,
					'//default:Bay[@name="B1"]/default:Function[@name="Prot_1"]/default:LNode[@lnType="CSWI_Type"]',
					'//default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Beh"]',
				],
				unexpectedQueries: [DANGLING_TYPE, '//default:LNodeType[2]'],
			},

		'an instance of another template naming the same type, the template type gaining a data object -> this instance on a fork, the other left on its type':
			{
				sourceXml: templateXml(),
				targetXml: projectXml({ types: POSITION_TYPE, secondBay: INSTANCE_OF_ANOTHER_TEMPLATE }),
				nextSourceXml: templateXml({ dataObjects: `${POSITION}${BEHAVIOUR}` }),
				reported: ['lnType: CSWI_Type -> CSWI_Type'],
				expectedQueries: [
					`${placedIn('B1')}[starts-with(@lnType, "CSWI_Type_")][@lnType = ${typeHolding('Beh')}]`,
					'//default:Function[@name="Other"]/default:LNode[@lnType="CSWI_Type"]',
					'//default:LNodeType[@id="CSWI_Type"][not(default:DO[@name="Beh"])]',
				],
				unexpectedQueries: [DANGLING_TYPE],
			},

		'project holding the template type under its own id, the template type gaining a data object -> the instance on the template type id, its old type removed':
			{
				sourceXml: templateXml(),
				targetXml: projectXml({ types: POSITION_TYPE_OF_ITS_OWN }),
				nextSourceXml: templateXml({ dataObjects: `${POSITION}${BEHAVIOUR}` }),
				reported: ['lnType: MyCSWI -> CSWI_Type'],
				expectedQueries: [
					`${placedIn('B1')}[@lnType="CSWI_Type"]`,
					'//default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Beh"]',
					'//default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Pos"][@type="MyDPC"]',
				],
				// the data object type it holds stays, the new type names it
				unexpectedQueries: [
					DANGLING_TYPE,
					'//default:LNodeType[@id="MyCSWI"]',
					'//default:DOType[@id="DPC_Type"]',
				],
			},

		'template naming a type its own file lacks -> nothing to bring, the instance keeps its type': {
			sourceXml: templateXml(),
			targetXml: projectXml(),
			nextSourceXml: templateXml({ lnodeAttributes: 'lnType="Missing_Type" desc="rev2"' }),
			reported: [],
			expectedQueries: [`${placedIn('B1')}[@lnType="CSWI_Type"][@desc="rev2"]`],
		},

		'template naming no type any more -> listed, the instance names none': {
			sourceXml: templateXml(),
			targetXml: projectXml(),
			nextSourceXml: templateXml({ lnodeAttributes: '' }),
			reported: ['lnType: CSWI_Type -> -'],
			expectedQueries: [`${placedIn('B1')}[not(@lnType)]`],
			unexpectedQueries: ['//default:LNodeType'],
		},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		for (const bay of testCase.placedIn ?? ['bay-1']) {
			await reportAndApply({
				document: target,
				lifecycle: {
					...lifecycleOf({ sourceQuery: source.query, bay }),
					scenario: 'instantiate',
				},
			})
		}
		const newer = await openSclDocument({
			project,
			xml: testCase.nextSourceXml,
			label: 'next revision',
		})
		const update = {
			...lifecycleOf({ sourceQuery: newer.query, bay: 'bay-1' }),
			scenario: 'template' as const,
		}
		if (testCase.updatedDirectly) {
			const reported = await report(target.query, update)
			expect(listTypeChanges(reported), 'report').toEqual(testCase.reported)
			await target.transaction(async function updateDirectly(tx) {
				await updateFsd(tx, {
					sourceQuery: newer.query,
					functionRef,
					targetParent: update.anchor,
					scenario: 'template',
				})
			})
			return { assertOn: 'target' }
		}
		const { report: reported } = await reportAndApply({
			document: target,
			lifecycle: update,
			decide: testCase.decide,
		})
		expect(listTypeChanges(reported), 'report').toEqual(testCase.reported)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

/** The FSD lifecycle of the template's function, landing in the bay of record id `bay`. */
function lifecycleOf(params: { sourceQuery: Scl.Query; bay: string }) {
	const { sourceQuery, bay } = params
	return {
		verb: 'fsd' as const,
		sourceQuery,
		ref: functionRef,
		anchor: { tagName: 'Bay', id: bay } as Scl.Ref<'Bay'>,
	}
}

/** Every group skipped. */
function skipEveryGroup(reported: DiffReport): DecisionMap {
	return new Map(allGroups(reported).map((group) => [group.id, 'skip' as const]))
}

/** The type changes a report lists across its trees, `<name>: <before> -> <after>`, a fork's hash as `<fork>`, sorted. */
function listTypeChanges(reported: DiffReport): string[] {
	const out: string[] = []
	function visit(node: DiffNode): void {
		for (const change of node.typeChanges ?? []) {
			out.push(`${change.name}: ${change.before ?? '-'} -> ${change.after ?? '-'}`)
		}
		for (const child of node.children) visit(child)
	}
	for (const instance of reported.instances) visit(instance.tree)
	return out.map((line) => line.replace(/_[0-9a-f]{8}\b/g, '_<fork>')).sort()
}
