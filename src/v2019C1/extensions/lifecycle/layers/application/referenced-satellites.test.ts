import {
	resolveReferencedSatellites,
	resolveRoleSatellites,
	withoutHeldSatellites,
} from './referenced-satellites'

import { describe, expect } from 'vitest'

import { resolveContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type { AnyTreeRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A bay holding a variable and a behaviour description, and an application whose role refers to `references`. */
function bayXml(params: { references: string }): string {
	return /* xml */ `
		<SCL ${ns} ${id}="template">
			<Substation name="TEMPLATE" ${id}="substation-s">
				<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
					<Bay name="TEMPLATE" ${id}="bay-s">
						<Private type="eIEC61850-6-100" ${id}="bay-private-s">
							<eIEC61850-6-100:Variable name="VBAY" uuid="vbay-uuid" ${id}="vbay">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F1" elementUuid="f1-uuid" ${id}="vbay-apply"/>
							</eIEC61850-6-100:Variable>
							<eIEC61850-6-100:BehaviorDescription name="BD" uuid="bd-uuid" ${id}="bd"/>
							<eIEC61850-6-100:Application name="A1" uuid="a1-uuid" ${id}="a1">
								<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="role">
									<eIEC61850-6-100:FunctionRoleContent ${id}="role-content">
										${params.references}
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="F1" uuid="f1-uuid" ${id}="f1"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

const variableRef = `<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VBAY" variableUuid="vbay-uuid" ${id}="variable-ref"/>`
const behaviourRef = `<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="TEMPLATE/TEMPLATE/TEMPLATE/BD" behaviorDescriptionUuid="bd-uuid" ${id}="behaviour-ref"/>`
const danglingRef = `<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/GONE" variableUuid="gone-uuid" ${id}="dangling-ref"/>`

type TestCase = SclTest.BaseXmlTestCase & {
	/** The satellites the application's roles refer to, by record id, sorted. */
	expectedSatellites: string[]
}

describe('resolveReferencedSatellites', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a role refers to a variable and a behaviour description of the bay → both': {
			sourceXml: bayXml({ references: `${variableRef}${behaviourRef}` }),
			expectedSatellites: ['bd', 'vbay'],
		},
		'a role refers twice to one variable → it, once': {
			sourceXml: bayXml({
				references: `${variableRef}${variableRef.replace('"variable-ref"', '"variable-ref-2"')}`,
			}),
			expectedSatellites: ['vbay'],
		},
		'a role refers to a variable the file does not hold → nothing, the rest found': {
			sourceXml: bayXml({ references: `${danglingRef}${behaviourRef}` }),
			allowIncoherentReferences: 'a file read as it is: its reference names nothing',
			expectedSatellites: ['bd'],
		},
		'no role refers to a satellite → nothing': {
			sourceXml: bayXml({ references: '' }),
			expectedSatellites: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const satellites = await resolveReferencedSatellites(source.query, {
			applicationRef: { tagName: 'Application', id: 'a1' } as Scl.Ref<'Application'>,
		})
		expect(satellites.map((satellite) => satellite.satelliteRef.id).sort()).toEqual(
			testCase.expectedSatellites,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/**
 * A bay whose application's role refers to: a variable applying to the bay's function and to another one, one applying
 * only to the other function (described by a text), one only by its path, a behaviour description of the other
 * function's logical node, and the variables a function the application stands on holds, one in its sub-function; a
 * second role refers to the one applying only to the other function too.
 */
const rolesXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Variable name="VBOTH" uuid="vboth-uuid" ${id}="vboth">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F1" elementUuid="f1-uuid" ${id}="vboth-f1"/>
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/OTHER" elementUuid="other-uuid" ${id}="vboth-other"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:Variable name="VAWAY" uuid="vaway-uuid" ${id}="vaway">
							<eIEC61850-6-100:Text ${id}="vaway-text">applies to the other function</eIEC61850-6-100:Text>
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/OTHER" elementUuid="other-uuid" ${id}="vaway-other"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:Variable name="VPATH" uuid="vpath-uuid" ${id}="vpath">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/OTHER" ${id}="vpath-other"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:BehaviorDescription name="BDAWAY" uuid="bdaway-uuid" ${id}="bdaway">
							<eIEC61850-6-100:InputVar varName="pos" dataName="TEMPLATE/TEMPLATE/TEMPLATE/OTHER/CSWI1" lnodeUuid="other-lnode-uuid" doName="Pos" ${id}="bdaway-input"/>
						</eIEC61850-6-100:BehaviorDescription>
						<eIEC61850-6-100:Application name="A1" uuid="a1-uuid" ${id}="a1">
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="role-content">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VBOTH" variableUuid="vboth-uuid" ${id}="vboth-ref"/>
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VAWAY" variableUuid="vaway-uuid" ${id}="vaway-ref"/>
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VPATH" variableUuid="vpath-uuid" ${id}="vpath-ref"/>
									<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="TEMPLATE/TEMPLATE/TEMPLATE/BDAWAY" behaviorDescriptionUuid="bdaway-uuid" ${id}="bdaway-ref"/>
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/F2/VF2" variableUuid="vf2-uuid" ${id}="vf2-ref"/>
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/F2/SF/VSF" variableUuid="vsf-uuid" ${id}="vsf-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:FunctionRole name="SUPERVISION" ${id}="supervision-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="supervision-content">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VAWAY" variableUuid="vaway-uuid" ${id}="vaway-ref-2"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="F1" uuid="f1-uuid" ${id}="f1"/>
					<Function name="F2" uuid="f2-uuid" ${id}="f2">
						<Private type="eIEC61850-6-100" ${id}="f2-private">
							<eIEC61850-6-100:Variable name="VF2" uuid="vf2-uuid" ${id}="vf2">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F2" elementUuid="f2-uuid" ${id}="vf2-f2"/>
							</eIEC61850-6-100:Variable>
						</Private>
						<SubFunction name="SF" uuid="sf-uuid" ${id}="sf">
							<Private type="eIEC61850-6-100" ${id}="sf-private">
								<eIEC61850-6-100:Variable name="VSF" uuid="vsf-uuid" ${id}="vsf">
									<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F2/SF" elementUuid="sf-uuid" ${id}="vsf-sf"/>
								</eIEC61850-6-100:Variable>
							</Private>
						</SubFunction>
					</Function>
					<Function name="OTHER" uuid="other-uuid" ${id}="other">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="other-lnode-uuid" ${id}="other-lnode"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The project function the application stands on: the copy of F2 holding the copies of its variable and of its
// sub-function's, or not.
function projectXml(params: { withCopy: boolean }): string {
	const copy = params.withCopy
		? `<Private type="eIEC61850-6-100" ${id}="project-f2-private"><eIEC61850-6-100:Variable name="VF2" uuid="project-vf2-uuid" templateUuid="vf2-uuid" ${id}="project-vf2"><eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/F2" elementUuid="project-f2-uuid" ${id}="project-vf2-f2"/></eIEC61850-6-100:Variable></Private><SubFunction name="SF" uuid="project-sf-uuid" templateUuid="sf-uuid" ${id}="project-sf"><Private type="eIEC61850-6-100" ${id}="project-sf-private"><eIEC61850-6-100:Variable name="VSF" uuid="project-vsf-uuid" templateUuid="vsf-uuid" ${id}="project-vsf"><eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/F2/SF" elementUuid="project-sf-uuid" ${id}="project-vsf-sf"/></eIEC61850-6-100:Variable></Private></SubFunction>`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="project">
			<Substation name="S1" ${id}="project-substation">
				<VoltageLevel name="V1" ${id}="project-voltage-level">
					<Bay name="B1" ${id}="project-bay">
						<Function name="F1" uuid="project-f1-uuid" templateUuid="f1-uuid" ${id}="project-f1"/>
						<Function name="F2" uuid="project-f2-uuid" templateUuid="f2-uuid" ${id}="project-f2">${copy}</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

type RoleCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The functions the scope holds: what the placement places. */
	scopeFunctions: string[]
	/** The template's functions placed by another clone of the placement: what they hold is left to it. */
	carriedFunctions?: string[]
	/** The functions of the project the application stands on, by the template function's uuid. */
	standsOn?: string[]
	expected: {
		placed: string[]
		unplaced: string[]
		unplacedReferences: string[]
		leaveOut: string[]
		copies: string[]
	}
}

describe('resolveRoleSatellites', () => {
	const testCases: SclTest.TestCases<RoleCase> = {
		'the placement places the first function → what applies to it placed with only that reference, what applies to nothing placed not, a path kept, a behaviour description whole':
			{
				sourceXml: rolesXml,
				targetXml: projectXml({ withCopy: false }),
				scopeFunctions: ['f1', 'f2'],
				expected: {
					placed: ['bdaway', 'vboth', 'vf2', 'vpath', 'vsf'],
					unplaced: ['vaway'],
					unplacedReferences: ['vaway-ref', 'vaway-ref-2'],
					leaveOut: ['bdaway-input', 'vboth-other'],
					copies: [],
				},
			},
		'the second function placed by another clone → what it holds left to it': {
			sourceXml: rolesXml,
			targetXml: projectXml({ withCopy: false }),
			scopeFunctions: ['f1', 'f2'],
			carriedFunctions: ['f2'],
			expected: {
				placed: ['bdaway', 'vboth', 'vpath'],
				unplaced: ['vaway'],
				unplacedReferences: ['vaway-ref', 'vaway-ref-2'],
				leaveOut: ['bdaway-input', 'vboth-other'],
				copies: [],
			},
		},
		'the application stands on a project function holding the copy → the copy named, nothing placed again':
			{
				sourceXml: rolesXml,
				targetXml: projectXml({ withCopy: true }),
				scopeFunctions: ['f1', 'f2'],
				standsOn: ['f2-uuid'],
				expected: {
					placed: ['bdaway', 'vboth', 'vpath'],
					unplaced: ['vaway'],
					unplacedReferences: ['vaway-ref', 'vaway-ref-2'],
					leaveOut: ['bdaway-input', 'vboth-other'],
					copies: ['vf2-uuid → project-vf2', 'vsf-uuid → project-vsf'],
				},
			},
		'the application stands on two project functions, the second holding the copy → that copy named':
			{
				sourceXml: rolesXml,
				targetXml: projectXml({ withCopy: true }),
				scopeFunctions: ['f1', 'f2'],
				standsOn: ['f1-uuid', 'f2-uuid'],
				expected: {
					placed: ['bdaway', 'vboth', 'vpath'],
					unplaced: ['vaway'],
					unplacedReferences: ['vaway-ref', 'vaway-ref-2'],
					leaveOut: ['bdaway-input', 'vboth-other'],
					copies: ['vf2-uuid → project-vf2', 'vsf-uuid → project-vsf'],
				},
			},
		'the application stands on a project function holding none → not placed, nor referred to': {
			sourceXml: rolesXml,
			targetXml: projectXml({ withCopy: false }),
			scopeFunctions: ['f1', 'f2'],
			standsOn: ['f2-uuid'],
			expected: {
				placed: ['bdaway', 'vboth', 'vpath'],
				unplaced: ['vaway', 'vf2', 'vsf'],
				unplacedReferences: ['vaway-ref', 'vaway-ref-2', 'vf2-ref', 'vsf-ref'],
				leaveOut: ['bdaway-input', 'vboth-other'],
				copies: [],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<RoleCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const scope = await resolveContributionScope(source.query, {
			roots: testCase.scopeFunctions.map((functionId) => ({
				tagName: 'Function',
				id: functionId,
			})) as Scl.Ref<Scl.ElementsOf>[],
		})
		const carriedIds = new Set<string>()
		for (const functionId of testCase.carriedFunctions ?? []) {
			const tree = await source.query.any.getTree({
				tagName: 'Function',
				id: functionId,
			} as Scl.Ref<'Function'>)
			if (tree) collectIds({ node: tree, ids: carriedIds })
		}
		const satellites = await resolveRoleSatellites(source.query, {
			applicationRef: { tagName: 'Application', id: 'a1' } as Scl.Ref<'Application'>,
			scope,
			carriedIds,
			stoodOn: {
				functions: (testCase.standsOn ?? []).map((sourceUuid) => ({
					sourceUuid,
					target: {
						tagName: 'Function',
						id: sourceUuid === 'f1-uuid' ? 'project-f1' : 'project-f2',
					} as Scl.Ref<Scl.ElementsOf>,
				})),
				projectQuery: target.query,
				matchKey: 'templateUuid',
			},
		})
		expect({
			placed: satellites.placed.map((ref) => ref.id).sort(),
			unplaced: satellites.unplaced.map((ref) => ref.id).sort(),
			unplacedReferences: [...satellites.unplacedReferenceIds].sort(),
			leaveOut: [...satellites.leaveOut].sort(),
			copies: satellites.copies.map((copy) => `${copy.sourceUuid} → ${copy.target.id}`),
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The record ids of a tree. */
function collectIds(params: { node: AnyTreeRecord; ids: Set<string> }): void {
	const { node, ids } = params
	ids.add(node.id)
	for (const child of node.tree) collectIds({ node: child, ids })
}

describe('withoutHeldSatellites', () => {
	type HeldCase = SclTest.BaseXmlTestCase & { targetXml: string; expectedPlaced: string[] }

	// The project bay holds two of the variables the role refers to, by their uuids.
	const holdingXml = projectXml({ withCopy: false }).replace(
		`<Bay name="B1" ${id}="project-bay">`,
		[
			`<Bay name="B1" ${id}="project-bay">`,
			`<Private type="eIEC61850-6-100" ${id}="project-bay-private">`,
			`<eIEC61850-6-100:Variable name="VBOTH" uuid="vboth-uuid" ${id}="project-vboth">`,
			`<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/F1" elementUuid="project-f1-uuid" ${id}="project-vboth-f1"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VPATH" uuid="vpath-uuid" ${id}="project-vpath">`,
			`<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/F1" elementUuid="project-f1-uuid" ${id}="project-vpath-f1"/>`,
			`</eIEC61850-6-100:Variable>`,
			`</Private>`,
		].join(''),
	)

	const testCases: SclTest.TestCases<HeldCase> = {
		'the project holds two of the variables by their uuids → neither placed again, the rest placed':
			{
				sourceXml: rolesXml,
				targetXml: holdingXml,
				expectedPlaced: ['bdaway', 'vf2', 'vsf'],
			},
		'the project holds none → all placed': {
			sourceXml: rolesXml,
			targetXml: projectXml({ withCopy: false }),
			expectedPlaced: ['bdaway', 'vboth', 'vf2', 'vpath', 'vsf'],
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<HeldCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const scope = await resolveContributionScope(source.query, {
			roots: [
				{ tagName: 'Function', id: 'f1' },
				{ tagName: 'Function', id: 'f2' },
			] as Scl.Ref<Scl.ElementsOf>[],
		})
		const roleSatellites = await resolveRoleSatellites(source.query, {
			applicationRef: { tagName: 'Application', id: 'a1' } as Scl.Ref<'Application'>,
			scope,
			carriedIds: new Set(),
			stoodOn: { functions: [], projectQuery: target.query, matchKey: 'templateUuid' },
		})
		const placed = await withoutHeldSatellites(target.query, { roleSatellites })
		expect(placed.map(readId).sort()).toEqual(testCase.expectedPlaced)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The record id of a ref. */
function readId(ref: Scl.Ref<Scl.ElementsOf>): string {
	return ref.id ?? ''
}
