import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { reportAndApply } from '@/v2019C1/extensions/lifecycle/integration/integration-helpers'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionGroup } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type { CountedQueryCall } from '@/v2019C1/test/count-query-reads.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** Each group of the report with what its removal makes the delete hooks do outside it: `<group> | <tag> <effect>`. */
	expectedSideEffects: string[]
}

/** The newer function template: its `Trip` sub-function is gone. */
const functionTemplate = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="prot-template-uuid" ${id}="prot-s">
						<SubFunction name="Keep" uuid="keep-template-uuid" ${id}="keep-s"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project holding an instance of the function, and what refers to its `Trip` sub-function from outside. */
function projectWith(params: {
	applicationReference?: string
	signalInput?: string
	substationContent?: string
	functionContent?: string
}): string {
	const {
		applicationReference = '',
		signalInput = '',
		substationContent = '',
		functionContent = '',
	} = params
	return /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Substation name="S1" ${id}="substation-t">
				${substationContent}
				<VoltageLevel name="V1" ${id}="voltage-level-t">
					<Bay name="B1" ${id}="bay-t">
						<Private type="eIEC61850-6-100" ${id}="bay-private-t">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="hmi-uuid" ${id}="hmi-t">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="hmi-role-t">
									<eIEC61850-6-100:FunctionRoleContent ${id}="hmi-content-t">
										<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Breaker" functionUuid="breaker-uuid" ${id}="hmi-breaker-ref-t"/>
										${applicationReference}
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Prot" uuid="prot-uuid" templateUuid="prot-template-uuid" ${id}="prot-t">
							<SubFunction name="Keep" uuid="keep-uuid" templateUuid="keep-template-uuid" ${id}="keep-t"/>
							${functionContent}
							<SubFunction name="Trip" uuid="trip-uuid" templateUuid="trip-template-uuid" ${id}="trip-t">
								<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="ptrc-uuid" templateUuid="ptrc-template-uuid" ${id}="ptrc-t"/>
							</SubFunction>
						</Function>
						<Function name="Breaker" uuid="breaker-uuid" ${id}="breaker-t">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="xcbr-uuid" ${id}="xcbr-t">
								<Private type="eIEC61850-6-100" ${id}="xcbr-private-t">
									<eIEC61850-6-100:LNodeInputs ${id}="xcbr-inputs-t">
										<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" uuid="trip-input-uuid" ${signalInput} ${id}="trip-input-t"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

// A removal deletes its subtree, and the delete hooks then delete or clear the references outside it that name an
// element of that subtree: the report lists them on the removal's group, before anything is decided.
describe('report: what the removal of a group makes the delete hooks do outside it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'nothing outside refers to the removed sub-function: nothing listed': {
			sourceXml: functionTemplate,
			targetXml: projectWith({}),
			expectedSideEffects: ['removed SubFunction | none'],
		},
		'an application of the project refers to it: its reference is listed deleted': {
			sourceXml: functionTemplate,
			targetXml: projectWith({
				applicationReference: /* xml */ `<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot/Trip" functionUuid="trip-uuid" ${id}="hmi-trip-ref-t"/>`,
			}),
			expectedSideEffects: ['removed SubFunction | FunctionRef deleted'],
		},
		'an input of another function is fed by its logical node: the input is listed cleared': {
			sourceXml: functionTemplate,
			targetXml: projectWith({
				signalInput: `source="S1/V1/B1/Prot/Trip/PTRC1" sourceLNodeUuid="ptrc-uuid" sourceDoName="Tr" sourceDaName="general"`,
			}),
			expectedSideEffects: ['removed SubFunction | SourceRef cleared'],
		},
		"the project's own sub-function, referred to: its group lists the reference it would delete": {
			sourceXml: functionTemplate,
			targetXml: projectWith({
				functionContent: /* xml */ `<SubFunction name="Extra" uuid="extra-uuid" ${id}="extra-t"/>`,
				applicationReference: /* xml */ `<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot/Extra" functionUuid="extra-uuid" ${id}="hmi-extra-ref-t"/>`,
			}),
			expectedSideEffects: [
				'target-only SubFunction | FunctionRef deleted',
				'removed SubFunction | none',
			],
		},
		'a sub-function the template changes, referred to: nothing listed, nothing is removed': {
			sourceXml: functionTemplate.replace(
				'<SubFunction name="Keep" uuid="keep-template-uuid"',
				'<SubFunction name="Keep" desc="rev2" uuid="keep-template-uuid"',
			),
			targetXml: projectWith({
				applicationReference: /* xml */ `<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot/Keep" functionUuid="keep-uuid" ${id}="hmi-keep-ref-t"/>`,
			}),
			expectedSideEffects: ['modified SubFunction | none', 'removed SubFunction | none'],
		},
		"a category of the project's own whose last reference names it: the reference, the category, the wrapper it leaves empty and the reference to the category are listed deleted":
			{
				sourceXml: functionTemplate,
				targetXml: projectWith({
					substationContent: /* xml */ `
						<Private type="eIEC61850-6-100" ${id}="substation-private-t">
							<eIEC61850-6-100:FunctionCategory name="TRIPS" uuid="trips-uuid" ${id}="category-t">
								<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Prot/Trip" functionUuid="trip-uuid" ${id}="category-ref-t"/>
							</eIEC61850-6-100:FunctionCategory>
						</Private>
					`,
					applicationReference: /* xml */ `<eIEC61850-6-100:FunctionCategoryRef functionCategory="S1/TRIPS" functionCategoryUuid="trips-uuid" ${id}="hmi-category-ref-t"/>`,
				}),
				expectedSideEffects: [
					'removed SubFunction | FunctionCatRef deleted, FunctionCategory deleted, Private deleted, FunctionCategoryRef deleted',
					'target-only FunctionCatRef | FunctionCategory deleted, Private deleted, FunctionCategoryRef deleted',
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const reported = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'prot-s' },
			anchor: { tagName: 'Bay', id: 'bay-t' },
			scenario: 'template',
		})
		const sideEffects = allGroups(reported).map((group) => describeSideEffects(group))
		expect(sideEffects).toEqual(testCase.expectedSideEffects)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * What the application holds of the `Trip` sub-function with a signal role: an output reference to the control
 * reference of its logical node, an input reference to the source reference of the breaker's logical node.
 */
const tripReferenceWithSignalRole = /* xml */ `
	<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot/Trip" functionUuid="trip-uuid" ${id}="hmi-trip-ref-t">
		<eIEC61850-6-100:SignalRole name="Signals" ${id}="hmi-signal-role-t">
			<eIEC61850-6-100:LNodeInputRef sourceRef="XCBR1/Trip" sourceRefUuid="trip-input-uuid" ${id}="hmi-input-ref-t"/>
			<eIEC61850-6-100:LNodeOutputRef controlRef="Trip/PTRC1/Trip" controlRefUuid="trip-control-uuid" ${id}="hmi-output-ref-t"/>
		</eIEC61850-6-100:SignalRole>
	</eIEC61850-6-100:FunctionRef>
`
const tripControlReference = /* xml */ `
	<Private type="eIEC61850-6-100" ${id}="ptrc-private-t">
		<eIEC61850-6-100:LNodeOutputs ${id}="ptrc-outputs-t">
			<eIEC61850-6-100:ControlRef output="Trip" uuid="trip-control-uuid" ${id}="ptrc-control-ref-t"/>
		</eIEC61850-6-100:LNodeOutputs>
	</Private>
`

/** The project fixture with the logical node of the `Trip` sub-function holding `content`. */
function projectWithTripLNodeContent(params: {
	applicationReference: string
	content: string
}): string {
	const { applicationReference, content } = params
	return projectWith({ applicationReference }).replace(
		/(uuid="ptrc-uuid" templateUuid="ptrc-template-uuid" [^>]*?)\/>/,
		`$1>${content}</LNode>`,
	)
}

// A removal takes the references to it, and what they hold goes with them: the report lists the references only, as
// the elements apply deletes beyond the group are.
describe('report: what a reference the removal deletes holds is not a side effect of its own', () => {
	type SignalRoleCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each group of the report with what its removal makes the delete hooks do outside it. */
		expectedSideEffects: string[]
	}

	const testCases: SclTest.TestCases<SignalRoleCase> = {
		'an application refers to it with a signal role: only the reference is listed deleted, not the signal role nor the references in it, and apply deletes the same':
			{
				sourceXml: functionTemplate,
				targetXml: projectWithTripLNodeContent({
					applicationReference: tripReferenceWithSignalRole,
					content: tripControlReference,
				}),
				expectedSideEffects: ['removed SubFunction | FunctionRef deleted'],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<SignalRoleCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'prot-s' } as const,
			anchor: { tagName: 'Bay', id: 'bay-t' } as const,
			scenario: 'template' as const,
		}
		const reported = await report(target.query, lifecycle)
		const groups = allGroups(reported)
		expect(groups.map((group) => describeSideEffects(group))).toEqual(testCase.expectedSideEffects)

		const listed = groups
			.flatMap((group) => group.sideEffects ?? [])
			.filter((sideEffect) => sideEffect.effect === 'deleted')
			.map((sideEffect) => sideEffect.element.id)
		const removedByGroups = groups
			.flatMap((group) => [group.primary, ...group.companions])
			.filter((node) => node.change === 'removed' || node.change === 'target-only')
			.flatMap((node) => (node.instanceRef?.id ? [node.instanceRef.id] : []))
		const decisions = new Map(groups.map((group) => [group.id, 'accept' as const]))
		const prepared = await target.prepare(async function applyEverything(tx) {
			await apply(tx, { ...lifecycle, report: reported, resolution: { decisions } })
		})
		const deleted = prepared.operations
			.filter((operation) => operation.status === 'deleted')
			.map((operation) => operation.oldRecord)
		prepared.discard()
		const deletedIds = new Set(deleted.map((record) => record.id))
		const roots = deleted
			.filter((record) => !record.parent || !deletedIds.has(record.parent.id))
			.map((record) => record.id)
			.filter((recordId) => !removedByGroups.includes(recordId))
		expect(roots.sort()).toEqual(listed.sort())
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * A voltage level template: a coupler whose breaker has a terminal on the node of the busbar bay, the terminal holding
 * in its Private a source reference to the logical node of that bay.
 */
const levelTemplateXml = /* xml */ `
	<SCL ${ns} ${id}="level-template">
		<Header id="level" uuid="level-file-uuid" version="0" revision="1" ${id}="level-header"/>
		<Substation name="TEMPLATE" ${id}="level-substation">
			<VoltageLevel name="HV" uuid="level-uuid" ${id}="level-voltage-level">
				<Bay name="Coupler" uuid="coupler-uuid" ${id}="level-coupler">
					<ConductingEquipment name="QA1" type="CBR" uuid="qa1-uuid" ${id}="level-breaker">
						<Terminal connectivityNode="TEMPLATE/HV/Busbar/BB1" substationName="TEMPLATE" voltageLevelName="HV" bayName="Busbar" cNodeName="BB1" cNodeUuid="bb1-uuid" ${id}="level-terminal">
							<Private type="eIEC61850-6-100" ${id}="level-terminal-private">
								<eIEC61850-6-100:SourceRef input="Trip" source="TEMPLATE/HV/Busbar/PTRC1.Tr.general" sourceLNodeUuid="ptrc-uuid" sourceDoName="Tr" sourceDaName="general" ${id}="level-source-ref"/>
							</Private>
						</Terminal>
					</ConductingEquipment>
				</Bay>
				<Bay name="Busbar" uuid="busbar-uuid" ${id}="level-busbar">
					<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="ptrc-uuid" ${id}="level-lnode"/>
					<ConnectivityNode name="BB1" pathName="TEMPLATE/HV/Busbar/BB1" uuid="bb1-uuid" ${id}="level-node"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectSubstationXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`

// The terminal a removed bay's node takes with it holds what it holds: a kept reference in it goes with it, it is not
// cleared.
describe('report: a kept reference inside a reference the removal deletes', () => {
	type LevelCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The groups of the update that remove an element, `<group> | <tag> <effect>, …`. */
		expectedSideEffects: string[]
	}

	const testCases: SclTest.TestCases<LevelCase> = {
		"the newer level template drops its busbar bay, a terminal of the project's coupler names its node and holds a source reference to its logical node: the terminal is listed deleted, the source reference is not listed cleared":
			{
				sourceXml: levelTemplateXml,
				targetXml: projectSubstationXml,
				expectedSideEffects: ['target-only Bay | Terminal deleted'],
			},
	}

	function levelTarget(params: {
		sourceQuery: Scl.Query
		scenario: 'instantiate' | 'template'
	}): LifecycleTarget {
		const { sourceQuery, scenario } = params
		return {
			verb: 'ssd',
			sourceQuery,
			ref: { tagName: 'VoltageLevel', id: 'level-voltage-level' },
			anchor: { tagName: 'Substation', id: 'project-substation' },
			scenario,
		}
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<LevelCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await reportAndApply({
			document: target,
			lifecycle: levelTarget({ sourceQuery: source.query, scenario: 'instantiate' }),
		})
		await source.transaction(async function dropTheBusbar(tx) {
			await tx.delete({ tagName: 'Bay', id: 'level-busbar' })
		})
		const reported = await report(
			target.query,
			levelTarget({ sourceQuery: source.query, scenario: 'template' }),
		)
		const removing = allGroups(reported).filter((group) => group.sideEffects !== undefined)
		expect(removing.map((group) => describeSideEffects(group))).toEqual(
			testCase.expectedSideEffects,
		)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The tags of the types of a data type template: what a removal leaves unused is listed by its record. */
const TYPE_TAGS = new Set(['LNodeType', 'DOType', 'DAType', 'EnumType'])

/**
 * The project of `projectWith`, its logical nodes typed: the `Trip` sub-function's by `PTRC_T` (a logical node type
 * naming a data object type, that a data attribute type, that an enumeration), and the logical node of the breaker
 * function: `breaker` — an XCBR of a type of its own, with its chain —, or `second PTRC` — a second PTRC naming
 * `PTRC_T` —; and the data type templates holding the chains.
 */
function projectWithTypes(params: {
	otherLogicalNode: 'breaker' | 'second PTRC'
	applicationReference?: string
	substationContent?: string
	functionContent?: string
}): string {
	const { otherLogicalNode, ...projectParams } = params
	const breakerChain =
		otherLogicalNode === 'breaker'
			? /* xml */ `
				<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt-xcbr">
					<DO name="Pos" type="DPC_T" ${id}="do-pos"/>
				</LNodeType>`
			: ''
	const breakerDataObjectType =
		otherLogicalNode === 'breaker'
			? /* xml */ `
				<DOType id="DPC_T" cdc="DPC" ${id}="dot-dpc">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-stval"/>
				</DOType>`
			: ''
	return projectWith(projectParams)
		.replace(
			'lnClass="PTRC" lnInst="1" uuid="ptrc-uuid"',
			'lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="ptrc-uuid"',
		)
		.replace(
			'lnClass="XCBR" lnInst="1" uuid="xcbr-uuid"',
			otherLogicalNode === 'breaker'
				? 'lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="xcbr-uuid"'
				: 'lnClass="PTRC" lnInst="2" lnType="PTRC_T" uuid="xcbr-uuid"',
		)
		.replace(
			'</SCL>',
			/* xml */ `
				<DataTypeTemplates ${id}="types-t">
					<LNodeType id="PTRC_T" lnClass="PTRC" ${id}="lnt-ptrc">
						<DO name="Tr" type="ACT_T" ${id}="do-tr"/>
					</LNodeType>
					${breakerChain}
					<DOType id="ACT_T" cdc="ACT" ${id}="dot-act">
						<DA name="origin" bType="Struct" type="ORG_T" fc="ST" ${id}="da-origin"/>
					</DOType>
					${breakerDataObjectType}
					<DAType id="ORG_T" ${id}="dat-org">
						<BDA name="orCat" bType="Enum" type="CAT_T" ${id}="bda-orcat"/>
					</DAType>
					<EnumType id="CAT_T" ${id}="et-cat">
						<EnumVal ord="0" ${id}="ev-cat">not-supported</EnumVal>
					</EnumType>
				</DataTypeTemplates>
			</SCL>`,
		)
}

/** The types of `PTRC_T` and everything it alone names, as a set: sorted by record id. */
const PTRC_T_CHAIN =
	'DAType#dat-org deleted, DOType#dot-act deleted, EnumType#et-cat deleted, LNodeType#lnt-ptrc deleted'

// A removal that takes the last logical node naming a type leaves the type unused, and the commit removes it with the
// data types only it names: the report lists them, before the containers and references, as it lists what else apply
// takes.
describe('report: the types a removal leaves unused', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the group removes the only logical node naming a type: the type and the data types only it names are listed deleted':
			{
				sourceXml: functionTemplate,
				targetXml: projectWithTypes({ otherLogicalNode: 'breaker' }),
				expectedSideEffects: [`removed SubFunction | ${PTRC_T_CHAIN}`],
			},
		'the group removes a logical node whose type another logical node names: no type is listed': {
			sourceXml: functionTemplate,
			targetXml: projectWithTypes({ otherLogicalNode: 'second PTRC' }),
			expectedSideEffects: ['removed SubFunction | none'],
		},
		'the types are listed before the references and containers the removal takes': {
			sourceXml: functionTemplate,
			targetXml: projectWithTypes({
				otherLogicalNode: 'breaker',
				substationContent: /* xml */ `
					<Private type="eIEC61850-6-100" ${id}="substation-private-t">
						<eIEC61850-6-100:FunctionCategory name="TRIPS" uuid="trips-uuid" ${id}="category-t">
							<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Prot/Trip" functionUuid="trip-uuid" ${id}="category-ref-t"/>
						</eIEC61850-6-100:FunctionCategory>
					</Private>
				`,
				applicationReference: /* xml */ `<eIEC61850-6-100:FunctionCategoryRef functionCategory="S1/TRIPS" functionCategoryUuid="trips-uuid" ${id}="hmi-category-ref-t"/>`,
			}),
			expectedSideEffects: [
				`removed SubFunction | ${PTRC_T_CHAIN}, FunctionCatRef deleted, FunctionCategory deleted, Private deleted, FunctionCategoryRef deleted`,
				'target-only FunctionCatRef | FunctionCategory deleted, Private deleted, FunctionCategoryRef deleted',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const reported = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'prot-s' },
			anchor: { tagName: 'Bay', id: 'bay-t' },
			scenario: 'template',
		})
		expect(allGroups(reported).map((group) => describeSideEffectsWithTypes(group))).toEqual(
			testCase.expectedSideEffects,
		)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// On a report of one group the types listed are the types apply removes: the group is the whole change.
describe('report: the types listed are those apply removes, for a report of one group', () => {
	type AppliedCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The record ids of the types the removal leaves unused. */
		expectedTypeIds: string[]
	}

	const testCases: SclTest.TestCases<AppliedCase> = {
		'the only logical node naming a type removed: the report lists the type and the data types only it names, apply removes them':
			{
				sourceXml: functionTemplate,
				targetXml: projectWithTypes({ otherLogicalNode: 'breaker' }),
				expectedTypeIds: ['dat-org', 'dot-act', 'et-cat', 'lnt-ptrc'],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<AppliedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'prot-s' } as const,
			anchor: { tagName: 'Bay', id: 'bay-t' } as const,
			scenario: 'template' as const,
		}
		const reported = await report(target.query, lifecycle)
		const groups = allGroups(reported)
		expect(groups, 'one group').toHaveLength(1)

		const listed = groups
			.flatMap((group) => group.sideEffects ?? [])
			.filter(
				(sideEffect) =>
					sideEffect.effect === 'deleted' && TYPE_TAGS.has(sideEffect.element.tagName),
			)
			.map((sideEffect) => sideEffect.element.id)
		const decisions = new Map(groups.map((group) => [group.id, 'accept' as const]))
		const prepared = await target.prepare(async function applyEverything(tx) {
			await apply(tx, { ...lifecycle, report: reported, resolution: { decisions } })
		})
		const removed = prepared.operations.flatMap((operation) =>
			operation.status === 'deleted' && TYPE_TAGS.has(operation.oldRecord.tagName)
				? [operation.oldRecord.id]
				: [],
		)
		prepared.discard()

		expect(listed.sort(), 'listed by the report').toEqual(removed.sort())
		expect(listed.sort(), 'the types the removal leaves unused').toEqual(testCase.expectedTypeIds)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The report judges each group on its own: two groups each removing one of the two logical nodes naming a type list
// no type, though together they leave it unused and apply removes it.
describe('report: the types are judged per group, apply judges the whole change', () => {
	type TwoGroupsCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The record ids of the types apply removes with both groups accepted. */
		expectedRemovedTypeIds: string[]
	}

	const testCases: SclTest.TestCases<TwoGroupsCase> = {
		'two groups each removing one of the two logical nodes naming a type: neither lists the type, apply removes it with the data types only it names':
			{
				sourceXml: functionTemplate,
				targetXml: projectWithTypes({
					otherLogicalNode: 'breaker',
					functionContent: /* xml */ `
						<SubFunction name="Trip2" uuid="trip2-uuid" templateUuid="trip2-template-uuid" ${id}="trip2-t">
							<LNode iedName="None" lnClass="PTRC" lnInst="2" lnType="PTRC_T" uuid="ptrc2-uuid" templateUuid="ptrc2-template-uuid" ${id}="ptrc2-t"/>
						</SubFunction>
					`,
				}),
				expectedRemovedTypeIds: ['dat-org', 'dot-act', 'et-cat', 'lnt-ptrc'],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TwoGroupsCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'prot-s' } as const,
			anchor: { tagName: 'Bay', id: 'bay-t' } as const,
			scenario: 'template' as const,
		}
		const reported = await report(target.query, lifecycle)
		const groups = allGroups(reported)
		expect(groups.map((group) => describeSideEffectsWithTypes(group))).toEqual([
			'removed SubFunction | none',
			'removed SubFunction | none',
		])

		const decisions = new Map(groups.map((group) => [group.id, 'accept' as const]))
		const prepared = await target.prepare(async function applyEverything(tx) {
			await apply(tx, { ...lifecycle, report: reported, resolution: { decisions } })
		})
		const removed = prepared.operations.flatMap((operation) =>
			operation.status === 'deleted' && TYPE_TAGS.has(operation.oldRecord.tagName)
				? [operation.oldRecord.id]
				: [],
		)
		prepared.discard()
		expect(removed.sort(), 'the types apply removes').toEqual(testCase.expectedRemovedTypeIds)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A group as `<group> | <tag> <effect>, …`. */
function describeSideEffects(group: DecisionGroup): string {
	if (!group.sideEffects) return `${group.title} | none`
	const effects = group.sideEffects.map(
		(sideEffect) => ` ${sideEffect.element.tagName} ${sideEffect.effect}`,
	)
	return `${group.title} |${effects.join(',')}`
}

/**
 * A group as `<group> | <tag> <effect>, …`: the types as a set (`<tag>#<record id>`, sorted: which types go is what the
 * row asserts), then the other effects in the order they are listed. A type listed after another effect marks the group
 * `(a type after the containers)`: the types come before the containers.
 */
function describeSideEffectsWithTypes(group: DecisionGroup): string {
	if (!group.sideEffects) return `${group.title} | none`
	function isType(element: { tagName: string }) {
		return TYPE_TAGS.has(element.tagName)
	}
	const typesFirst = group.sideEffects.every(
		({ element }, position) =>
			!isType(element) ||
			group.sideEffects?.slice(0, position).every((before) => isType(before.element)),
	)
	const types = group.sideEffects
		.filter(({ element }) => isType(element))
		.map(({ element, effect }) => ` ${element.tagName}#${element.id} ${effect}`)
		.sort()
	const others = group.sideEffects
		.filter(({ element }) => !isType(element))
		.map(({ element, effect }) => ` ${element.tagName} ${effect}`)
	return `${group.title}${typesFirst ? '' : ' (a type after the containers)'} |${[...types, ...others].join(',')}`
}

/** The project of `projectWithTypes` whose second sub-function `Trip2` holds a logical node of a type of its own. */
function projectWithTwoTypedGroups(): string {
	return projectWithTypes({
		otherLogicalNode: 'breaker',
		functionContent: /* xml */ `
			<SubFunction name="Trip2" uuid="trip2-uuid" templateUuid="trip2-template-uuid" ${id}="trip2-t">
				<LNode iedName="None" lnClass="PTRC" lnInst="2" lnType="PTRC2_T" uuid="ptrc2-uuid" templateUuid="ptrc2-template-uuid" ${id}="ptrc2-t"/>
			</SubFunction>
		`,
	})
		.replace(
			'<DOType id="ACT_T"',
			/* xml */ `<LNodeType id="PTRC2_T" lnClass="PTRC" ${id}="lnt-ptrc2">
				<DO name="Tr" type="ACT2_T" ${id}="do-tr2"/>
			</LNodeType>
			<DOType id="ACT_T"`,
		)
		.replace(
			'<DAType id="ORG_T"',
			/* xml */ `<DOType id="ACT2_T" cdc="ACT" ${id}="dot-act2"/>
			<DAType id="ORG_T"`,
		)
}

/** The project whose only logical node naming a type is the one of `Trip`: its types are all the project has. */
function projectWithOneTypedLogicalNode(): string {
	return projectWithTypes({ otherLogicalNode: 'second PTRC' }).replace(
		'lnClass="PTRC" lnInst="2" lnType="PTRC_T"',
		'lnClass="PTRC" lnInst="2"',
	)
}

/** The reads of the data types: `getRecordsByTagName` and `findByAttributes` of a type tag or of a tag that names a type. */
function typeReadsOf(calls: CountedQueryCall[]): string[] {
	const typeTags = new Set([...TYPE_TAGS, ...Object.keys(TYPE_ID_REFERENCE_PAIRS)])
	return calls
		.flatMap(function pairsOf({ method, args }) {
			if (method === 'getRecordsByTagName') return [String(args[0])]
			if (method !== 'findByAttributes') return []
			const [params] = args as [{ tagName: string; attributes: Record<string, unknown> }]
			return Object.keys(params.attributes).map((attribute) => `${params.tagName}.${attribute}`)
		})
		.filter((pair) => typeTags.has(pair.split('.')[0]))
}

// The report judges its groups one after the other, but the document does not change meanwhile: what it reads of the
// data types is read once for the report, and a group that takes the last types of the project lists the section it
// empties, as the commit deletes it.
describe('report: the data type reads of a report and the section a removal empties', () => {
	type ReadsCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each group of the report as `<group> | <effects>`; left out when the case does not check them. */
		expectedSideEffects?: string[]
		/** No (tag[, attribute]) of the data types is read twice for the whole report. */
		expectEachTypeReadOnce?: boolean
		/** The `DataTypeTemplates` (record `types-t`) is read by `getRecord` at most once for the whole report. */
		expectSectionReadAtMostOnce?: boolean
	}

	const testCases: SclTest.TestCases<ReadsCase> = {
		'two groups each removing the only logical node of its own type: each (tag, attribute) of the data types is read once for the whole report':
			{
				sourceXml: functionTemplate,
				targetXml: projectWithTwoTypedGroups(),
				expectEachTypeReadOnce: true,
			},
		'a group whose removal prunes four type trees under a DataTypeTemplates that stays: that section is read at most once':
			{
				sourceXml: functionTemplate,
				targetXml: projectWithTypes({ otherLogicalNode: 'breaker' }),
				expectSectionReadAtMostOnce: true,
			},
		'a group removing the last types of the project, its DataTypeTemplates holding nothing else: the section is listed deleted after the types':
			{
				sourceXml: functionTemplate,
				targetXml: projectWithOneTypedLogicalNode(),
				expectedSideEffects: [`removed SubFunction | ${PTRC_T_CHAIN}, DataTypeTemplates deleted`],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<ReadsCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const { query, calls } = countQueryReads(target.query)
		const reported = await report(query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'prot-s' },
			anchor: { tagName: 'Bay', id: 'bay-t' },
			scenario: 'template',
		})
		if (testCase.expectedSideEffects) {
			expect(allGroups(reported).map((group) => describeSideEffectsWithTypes(group))).toEqual(
				testCase.expectedSideEffects,
			)
		}
		if (testCase.expectEachTypeReadOnce) {
			const seen = new Set<string>()
			const repeated = new Set<string>()
			for (const pair of typeReadsOf(calls)) {
				if (seen.has(pair)) repeated.add(pair)
				seen.add(pair)
			}
			expect([...repeated].sort()).toEqual([])
		}
		if (testCase.expectSectionReadAtMostOnce) {
			const sectionReads = calls.filter(
				({ method, args }) =>
					method === 'getRecord' && (args[0] as { id?: string } | undefined)?.id === 'types-t',
			)
			expect(sectionReads.length).toBeLessThanOrEqual(1)
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
