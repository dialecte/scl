import { describe, expect, expectTypeOf } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SourceRoot, SourceRootRef, SourceRootVerb } from './source-root.types'
import type { Scl } from '@/v2019C1/config'
import type { LifecycleReportParams } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A template file: the `TEMPLATE` scaffolding, and a private of its root holding what has no parent level. */
function templateFile(params: { rootPrivate?: string; substation: string }): string {
	const { rootPrivate = '', substation } = params
	return /* xml */ `
		<SCL ${ns} ${id}="scl-1">
			${rootPrivate}
			${substation}
		</SCL>
	`
}

/** The scaffolding of a function template file down to its bay, holding `body`. */
function templateBay(body: string): string {
	return /* xml */ `
		<Substation name="TEMPLATE" ${id}="substation-1">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-1">
				<Bay name="TEMPLATE" ${id}="bay-1">${body}</Bay>
			</VoltageLevel>
		</Substation>
	`
}

/** A function template: a function with no parent level, in a private of the root. */
const functionTemplate = /* xml */ `
	<Private type="eIEC61850-6-100" ${id}="root-private">
		<eIEC61850-6-100:FunctionTemplate name="Prot" uuid="function-template-uuid" ${id}="function-template-1"/>
	</Private>
`

/** A template file with the `applications` (in this order) in a private of its substation. */
function asd(...applications: { id: string; name: string }[]): string {
	const elements = applications
		.map(
			(application) =>
				`<eIEC61850-6-100:Application name="${application.name}" type="DCS" uuid="${application.id}-uuid" ${id}="${application.id}"/>`,
		)
		.join('')
	return /* xml */ `
		<SCL ${ns} ${id}="scl-1">
			<Substation name="TEMPLATE" ${id}="substation-1">
				<Private type="eIEC61850-6-100" ${id}="substation-private">${elements}</Private>
			</Substation>
		</SCL>
	`
}

const twoNamedBays = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<Substation name="TEMPLATE" ${id}="substation-1">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-1">
				<Bay name="B1" ${id}="bay-1"/>
				<Bay name="B2" ${id}="bay-2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** Two bays, the breaker of the second on a node of the first; a third bay of its own, when asked. */
function linkedBays(params: { third: boolean }): string {
	const third = params.third
		? `<Bay name="B3" uuid="bay-3-uuid" ${id}="bay-3"><ConductingEquipment name="QA1" type="CBR" uuid="equipment-3-uuid" ${id}="equipment-3"/></Bay>`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="scl-1">
			<Substation name="TEMPLATE" ${id}="substation-1">
				<VoltageLevel name="TEMPLATE" ${id}="voltage-level-1">
					<Bay name="B1" uuid="bay-1-uuid" ${id}="bay-1">
						<ConnectivityNode name="L1" pathName="TEMPLATE/TEMPLATE/B1/L1" uuid="node-uuid" ${id}="node-1"/>
					</Bay>
					<Bay name="B2" uuid="bay-2-uuid" ${id}="bay-2">
						<ConductingEquipment name="QA1" type="CBR" uuid="equipment-2-uuid" ${id}="equipment-2">
							<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/B1/L1" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="B1" cNodeName="L1" cNodeUuid="node-uuid" ${id}="terminal-2"/>
						</ConductingEquipment>
					</Bay>
					${third}
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

type TestCase = SclTest.BaseXmlTestCase & {
	verb: SourceRootVerb
	expected: SourceRoot<SourceRootVerb>
}

// What a template file holds to instantiate, read for a verb: a function (FSD), an application (ASD),
// the first named level below the TEMPLATE scaffolding (SSD). Never throws on the shape of a file: it
// answers `none`, `several` (the candidates in document order, each with the elements linked to it) or
// `unsupported` (an equipment function at the root of an FSD, not handled yet).
describe('query.lifecycle.sourceRoot', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fsd: one function at a bay of the TEMPLATE scaffolding → found': {
			verb: 'fsd',
			sourceXml: templateFile({
				substation: templateBay(`<Function name="Prot" uuid="function-uuid" ${id}="function-1"/>`),
			}),
			expected: { kind: 'found', ref: { tagName: 'Function', id: 'function-1' } },
		},
		'fsd: one function at the TEMPLATE substation alone → found': {
			verb: 'fsd',
			sourceXml: templateFile({
				substation: `<Substation name="TEMPLATE" ${id}="substation-1"><Function name="Prot" uuid="function-uuid" ${id}="function-1"/></Substation>`,
			}),
			expected: { kind: 'found', ref: { tagName: 'Function', id: 'function-1' } },
		},
		'fsd: one function template in the private of the root → found': {
			verb: 'fsd',
			sourceXml: templateFile({ rootPrivate: functionTemplate, substation: '' }),
			expected: { kind: 'found', ref: { tagName: 'FunctionTemplate', id: 'function-template-1' } },
		},
		'fsd: a function template holding a subfunction template → found the function template': {
			verb: 'fsd',
			sourceXml: templateFile({
				rootPrivate: /* xml */ `
					<Private type="eIEC61850-6-100" ${id}="root-private">
						<eIEC61850-6-100:FunctionTemplate name="Prot" uuid="function-template-uuid" ${id}="function-template-1">
							<eIEC61850-6-100:SubFunctionTemplate name="Trip" uuid="sub-function-template-uuid" ${id}="sub-function-template-1"/>
						</eIEC61850-6-100:FunctionTemplate>
					</Private>
				`,
				substation: '',
			}),
			expected: { kind: 'found', ref: { tagName: 'FunctionTemplate', id: 'function-template-1' } },
		},
		'fsd: a function holding subfunctions → found the function, a subfunction is not a root': {
			verb: 'fsd',
			sourceXml: templateFile({
				substation: templateBay(
					`<Function name="Prot" uuid="function-uuid" ${id}="function-1"><SubFunction name="Trip" uuid="sub-function-uuid" ${id}="sub-function-1"/></Function>`,
				),
			}),
			expected: { kind: 'found', ref: { tagName: 'Function', id: 'function-1' } },
		},
		'fsd: a function template and a top function → several, the file holds two functions': {
			verb: 'fsd',
			sourceXml: templateFile({
				rootPrivate: functionTemplate,
				substation: templateBay(`<Function name="Ctrl" uuid="function-uuid" ${id}="function-1"/>`),
			}),
			expected: {
				kind: 'several',
				candidates: [
					{
						ref: { tagName: 'FunctionTemplate', id: 'function-template-1' },
						name: 'Prot',
						linked: [],
					},
					{ ref: { tagName: 'Function', id: 'function-1' }, name: 'Ctrl', linked: [] },
				],
			},
		},
		'fsd: two top functions → several, in document order whatever their ids': {
			verb: 'fsd',
			sourceXml: templateFile({
				substation: templateBay(
					`<Function name="Prot" uuid="function-b-uuid" ${id}="function-b"/><Function name="Ctrl" uuid="function-a-uuid" ${id}="function-a"/>`,
				),
			}),
			expected: {
				kind: 'several',
				candidates: [
					{ ref: { tagName: 'Function', id: 'function-b' }, name: 'Prot', linked: [] },
					{ ref: { tagName: 'Function', id: 'function-a' }, name: 'Ctrl', linked: [] },
				],
			},
		},
		'fsd: a function at the TEMPLATE substation and one at its bay → several, the bay first: a substation holds its levels before its functions':
			{
				verb: 'fsd',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<Substation name="TEMPLATE" ${id}="substation-1">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-1">
								<Bay name="TEMPLATE" ${id}="bay-1">
									<Function name="Prot" uuid="bay-function-uuid" ${id}="bay-function"/>
								</Bay>
							</VoltageLevel>
							<Function name="Ctrl" uuid="substation-function-uuid" ${id}="substation-function"/>
						</Substation>
					</SCL>
				`,
				expected: {
					kind: 'several',
					candidates: [
						{ ref: { tagName: 'Function', id: 'bay-function' }, name: 'Prot', linked: [] },
						{ ref: { tagName: 'Function', id: 'substation-function' }, name: 'Ctrl', linked: [] },
					],
				},
			},
		'fsd: the scaffolding without a function → none': {
			verb: 'fsd',
			sourceXml: templateFile({ substation: templateBay('') }),
			expected: { kind: 'none' },
		},
		'fsd: an equipment function under the TEMPLATE equipment → unsupported, with its ref': {
			verb: 'fsd',
			sourceXml: templateFile({
				substation: templateBay(
					`<ConductingEquipment name="TEMPLATE" type="CBR" ${id}="equipment-1"><EqFunction name="EQF" uuid="equipment-function-uuid" ${id}="equipment-function-1"/></ConductingEquipment>`,
				),
			}),
			expected: { kind: 'unsupported', ref: { tagName: 'EqFunction', id: 'equipment-function-1' } },
		},
		'fsd: only equipment functions, two of them → unsupported, with the first in document order': {
			verb: 'fsd',
			sourceXml: templateFile({
				substation: templateBay(
					`<ConductingEquipment name="TEMPLATE" type="CBR" ${id}="equipment-1"><EqFunction name="EQF_B" uuid="equipment-function-b-uuid" ${id}="equipment-function-b"/><EqFunction name="EQF_A" uuid="equipment-function-a-uuid" ${id}="equipment-function-a"/></ConductingEquipment>`,
				),
			}),
			expected: { kind: 'unsupported', ref: { tagName: 'EqFunction', id: 'equipment-function-b' } },
		},
		'fsd: a function at a level and an equipment function → found the function, the placeable root first':
			{
				verb: 'fsd',
				sourceXml: templateFile({
					substation: templateBay(
						`<ConductingEquipment name="TEMPLATE" type="CBR" ${id}="equipment-1"><EqFunction name="EQF" uuid="equipment-function-uuid" ${id}="equipment-function-1"/></ConductingEquipment><Function name="Prot" uuid="function-uuid" ${id}="function-1"/>`,
					),
				}),
				expected: { kind: 'found', ref: { tagName: 'Function', id: 'function-1' } },
			},
		'asd: one application → found': {
			verb: 'asd',
			sourceXml: asd({ id: 'application-1', name: 'HMI' }),
			expected: { kind: 'found', ref: { tagName: 'Application', id: 'application-1' } },
		},
		'asd: two applications → several, in document order whatever their names and ids': {
			verb: 'asd',
			sourceXml: asd({ id: 'application-b', name: 'SCADA' }, { id: 'application-a', name: 'HMI' }),
			expected: {
				kind: 'several',
				candidates: [
					{ ref: { tagName: 'Application', id: 'application-b' }, name: 'SCADA', linked: [] },
					{ ref: { tagName: 'Application', id: 'application-a' }, name: 'HMI', linked: [] },
				],
			},
		},
		'asd: no application → none, a function alone is not an application': {
			verb: 'asd',
			sourceXml: templateFile({
				substation: templateBay(`<Function name="Prot" uuid="function-uuid" ${id}="function-1"/>`),
			}),
			expected: { kind: 'none' },
		},
		'ssd: one named bay under the TEMPLATE scaffolding → found the bay': {
			verb: 'ssd',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="substation-1">
						<VoltageLevel name="TEMPLATE" ${id}="voltage-level-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { kind: 'found', ref: { tagName: 'Bay', id: 'bay-1' } },
		},
		'ssd: two bays linked by a terminal → found their scaffolding, naming it places both': {
			verb: 'ssd',
			sourceXml: linkedBays({ third: false }),
			expected: { kind: 'found', ref: { tagName: 'VoltageLevel', id: 'voltage-level-1' } },
		},
		'ssd: the scaffolding with nothing named below it → found its deepest level': {
			verb: 'ssd',
			sourceXml: templateFile({ substation: templateBay('') }),
			expected: { kind: 'found', ref: { tagName: 'Bay', id: 'bay-1' } },
		},
		'ssd: two bays linked to nothing → several, each alone': {
			verb: 'ssd',
			sourceXml: twoNamedBays,
			expected: {
				kind: 'several',
				candidates: [
					{ ref: { tagName: 'Bay', id: 'bay-1' }, name: 'B1', linked: [] },
					{ ref: { tagName: 'Bay', id: 'bay-2' }, name: 'B2', linked: [] },
				],
			},
		},
		'ssd: two linked bays and a third → several, the pair as one candidate with its linked bay': {
			verb: 'ssd',
			sourceXml: linkedBays({ third: true }),
			expected: {
				kind: 'several',
				candidates: [
					{
						ref: { tagName: 'Bay', id: 'bay-1' },
						name: 'B1',
						linked: [{ ref: { tagName: 'Bay', id: 'bay-2' }, name: 'B2' }],
					},
					{ ref: { tagName: 'Bay', id: 'bay-3' }, name: 'B3', linked: [] },
				],
			},
		},
		'ssd: no substation → none': {
			verb: 'ssd',
			sourceXml: /* xml */ `<SCL ${ns} ${id}="scl-1"/>`,
			expected: { kind: 'none' },
		},
		'ssd: two named substations, no scaffolding above them → several, in document order whatever their names and ids':
			{
				verb: 'ssd',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<Substation name="B" ${id}="substation-b"/>
						<Substation name="A" ${id}="substation-a"/>
					</SCL>
				`,
				expected: {
					kind: 'several',
					candidates: [
						{ ref: { tagName: 'Substation', id: 'substation-b' }, name: 'B', linked: [] },
						{ ref: { tagName: 'Substation', id: 'substation-a' }, name: 'A', linked: [] },
					],
				},
			},
	}

	async function act({ source, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		await expect(source.query.lifecycle.sourceRoot[testCase.verb]()).resolves.toEqual(
			testCase.expected,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type RoundTripCase = SclTest.BaseXmlTestCase & {
	verb: SourceRootVerb
	targetXml: string
	/** Where the root lands in the project. */
	anchor: Scl.Ref<Scl.ElementsOf>
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The root it finds is what the verbs take as their `ref`: handed to `report`, it reports a first
// placement of that root, nothing thrown.
describe('query.lifecycle.sourceRoot: the root found is the ref the verbs take', () => {
	const testCases: SclTest.TestCases<RoundTripCase> = {
		'fsd: the function of a bay of the scaffolding': {
			verb: 'fsd',
			sourceXml: templateFile({
				substation: templateBay(`<Function name="Prot" uuid="function-uuid" ${id}="function-1"/>`),
			}),
			targetXml: projectXml,
			anchor: { tagName: 'Bay', id: 'project-bay' },
		},
		'fsd: the function template of the root private': {
			verb: 'fsd',
			sourceXml: templateFile({ rootPrivate: functionTemplate, substation: '' }),
			targetXml: projectXml,
			anchor: { tagName: 'Bay', id: 'project-bay' },
		},
		'asd: the application': {
			verb: 'asd',
			sourceXml: asd({ id: 'application-1', name: 'HMI' }),
			targetXml: projectXml,
			anchor: { tagName: 'Bay', id: 'project-bay' },
		},
		'ssd: the one named bay': {
			verb: 'ssd',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="substation-1">
						<VoltageLevel name="TEMPLATE" ${id}="voltage-level-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			targetXml: projectXml,
			anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<RoundTripCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const pending = source.query.lifecycle.sourceRoot[testCase.verb]()
		await expect(pending).resolves.toMatchObject({ kind: 'found' })
		const root = await pending
		if (root.kind !== 'found') return

		const reported = await target.query.lifecycle.report({
			verb: testCase.verb,
			sourceQuery: source.query,
			ref: root.ref as SourceRootRef<SourceRootVerb>,
			anchor: testCase.anchor,
		} as LifecycleReportParams)

		expect(reported.target?.ref).toEqual(root.ref)
		expect(reported.templateInstances).toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type PlacedCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The source records the report places, in the order it lists them. */
	expectedPlaced: string[]
}

// Several units joined by a reference are one element, rooted at the scaffolding holding them: the
// scaffolding found is the ref `report` takes, and it places both.
describe('query.lifecycle.sourceRoot: a found scaffolding places the linked units', () => {
	const testCases: SclTest.TestCases<PlacedCase> = {
		'ssd: two bays linked by a terminal → the scaffolding places both': {
			sourceXml: linkedBays({ third: false }),
			targetXml: projectXml,
			expectedPlaced: ['bay-1', 'bay-2'],
		},
	}

	async function act({ source, target, testCase }: SclTest.ActParams<PlacedCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const pending = source.query.lifecycle.sourceRoot.ssd()
		await expect(pending).resolves.toEqual({
			kind: 'found',
			ref: { tagName: 'VoltageLevel', id: 'voltage-level-1' },
		})
		const root = await pending
		if (root.kind !== 'found') return

		const reported = await target.query.lifecycle.report({
			verb: 'ssd',
			sourceQuery: source.query,
			ref: root.ref,
			anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
		})

		expect(allGroups(reported).map((group) => group.primary.sourceRef?.id)).toEqual(
			testCase.expectedPlaced,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type TypeCase = SclTest.BaseXmlTestCase

// Each verb has its own function: the ref it finds is the one its verb takes, an application for asd.
describe('query.lifecycle.sourceRoot: the verb narrows the ref', () => {
	const testCases: SclTest.TestCases<TypeCase> = {
		'asd: the found ref is an Application ref': {
			sourceXml: asd({ id: 'application-1', name: 'HMI' }),
		},
	}

	async function act({ source }: SclTest.ActParams<TypeCase>): Promise<void> {
		const pending = source.query.lifecycle.sourceRoot.asd()
		await expect(pending).resolves.toMatchObject({ kind: 'found' })
		const root = await pending
		if (root.kind !== 'found') return

		expectTypeOf(root.ref).toEqualTypeOf<Scl.Ref<'Application'>>()
	}

	runSclTestCases.withoutExport({ testCases, act })
})
