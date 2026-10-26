import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

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
		'a category whose last reference names it: the reference, the category, the wrapper it leaves empty and the reference to the category are listed deleted':
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
					'removed FunctionCatRef | FunctionCategory deleted, Private deleted, FunctionCategoryRef deleted',
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

/** A group as `<group> | <tag> <effect>, …`. */
function describeSideEffects(group: DecisionGroup): string {
	if (!group.sideEffects) return `${group.title} | none`
	const effects = group.sideEffects.map(
		(sideEffect) => ` ${sideEffect.element.tagName} ${sideEffect.effect}`,
	)
	return `${group.title} |${effects.join(',')}`
}
