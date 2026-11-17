import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const iedRef = { tagName: 'IED', id: 'isd-ied' } as const satisfies Scl.Ref<'IED'>
const projectRoot = { tagName: 'SCL', id: 'project-root' } as const satisfies Scl.Ref<'SCL'>

/** A template ISD: the IED SPECIFICATION, with the file it was extracted from. */
const isdXml = /* xml */ `
	<SCL ${ns} ${id}="isd-root">
		<Header id="P1_ISD" fileType="ISD" uuid="10000000-0000-4000-8000-000000000010" version="1" revision="A" ${id}="isd-header"/>
		<IED name="SPECIFICATION" uuid="20000000-0000-4000-8000-000000000001" ${id}="isd-ied">
			<AccessPoint name="AP1" ${id}="isd-access-point"/>
			<IEDSourceFiles ${id}="isd-source-files">
				<SclFileReference fileType="SCD" fileName="project" fileUuid="10000000-0000-4000-8000-000000000001" version="1" revision="A" ${id}="isd-source-file"/>
			</IEDSourceFiles>
		</IED>
	</SCL>
`

/** The source opened as a template ISD file, its record ids kept: the IED is placed from its `.isd` extension. */
async function openAsIsd(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	xml: string
	/** Absent: `P1.isd`. */
	fileName?: string
}): Promise<Core.Query<Config>> {
	const { project, xml } = params
	const imported = await project.importFile(
		new File([xml], params.fileName ?? 'P1.isd', { type: 'text/xml' }),
		{
			useCustomRecordsIds: true,
		},
	)
	return project.openDocument(imported.documentId).query
}

/** Every node of a diff tree as `<path> <change>`, in document order. */
function changesOf(params: { node: DiffNode; parentPath?: string }): string[] {
	const { node, parentPath } = params
	const path = parentPath ? [parentPath, node.tagName].join('/') : node.tagName
	const below = node.children.flatMap((child) => changesOf({ node: child, parentPath: path }))
	return [[path, node.change].join(' '), ...below]
}

type FirstPlacementCase = SclTest.BaseXmlTestCase & {
	expected: {
		needsDecisions: boolean
		instances: { rootRef: undefined; changes: string[] }[]
	}
}

// A first placement of an IED: one instance with no root in the project, every element of the IED added, on the fast
// track. The IEDSourceFiles of an ISD read as added like the rest.
describe('query.lifecycle.report - an IED placed for the first time', () => {
	const everyElementAdded = [
		'IED added',
		'IED/AccessPoint added',
		'IED/IEDSourceFiles added',
		'IED/IEDSourceFiles/SclFileReference added',
	]
	const testCases: SclTest.TestCases<FirstPlacementCase> = {
		'the IED with its source files, the project without it → one instance placed for the first time, every element added, fast track':
			{
				sourceXml: isdXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<Substation name="S1" ${id}="project-substation"/>
					<!-- no IED -->
				</SCL>
			`,
				expected: {
					needsDecisions: false,
					instances: [{ rootRef: undefined, changes: everyElementAdded }],
				},
			},
		'the IED with its source files, the project holding another IED of its name → still a first placement on the fast track':
			{
				sourceXml: isdXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000099" ${id}="project-ied">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
				expected: {
					needsDecisions: false,
					instances: [{ rootRef: undefined, changes: everyElementAdded }],
				},
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<FirstPlacementCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const sourceQuery = await openAsIsd({ project, xml: testCase.sourceXml })
		const reported = await target.query.lifecycle.report({
			verb: 'ied',
			sourceQuery,
			ref: iedRef,
			anchor: projectRoot,
		})
		expect({
			needsDecisions: reported.needsDecisions,
			instances: reported.instances.map((instance) => ({
				rootRef: instance.rootRef,
				changes: changesOf({ node: instance.tree }),
			})),
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type MatchedCase = SclTest.BaseXmlTestCase & {
	/** Absent: the default scenario. */
	scenario?: LifecycleScenario
	/** The IED of the project the update starts from. Absent: none named. */
	targetInstance?: Scl.Ref<'IED'>
	/** The name the source file is opened under. Absent: `P1.isd`. */
	fileName?: string
	expected:
		| { refused: { key: string; meta: Record<string, unknown> } }
		| { instances: number; firstPlacements: number }
}

// An IED the project holds placed from the template is updated, the one the update starts from: named among several,
// or the only one. A fork finding it is refused, an instantiate places a new one beside it. Read-only: the project is
// left as it was.
describe('query.lifecycle.report - an IED the project already holds', () => {
	const testCases: SclTest.TestCases<MatchedCase> = {
		'no scenario given, the project holding one IED placed from it → its update reported, no first placement':
			{
				sourceXml: isdXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000099" templateUuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied">
						<AccessPoint name="AP1" templateUuid="20000000-0000-4000-8000-000000000002" uuid="20000000-0000-4000-8000-000000000098"/>
					</IED>
				</SCL>
			`,
				expected: { instances: 1, firstPlacements: 0 },
				expectedQueries: [
					'/default:SCL[count(default:IED)=1]/default:IED[@name="P1"][@uuid="20000000-0000-4000-8000-000000000099"][@templateUuid="20000000-0000-4000-8000-000000000001"]',
				],
			},
		'template, the project holding two IEDs placed from it, none named → refused, the update starts from one of them':
			{
				sourceXml: isdXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000099" templateUuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied">
						<AccessPoint name="AP1"/>
					</IED>
					<IED name="P2" uuid="20000000-0000-4000-8000-000000000097" templateUuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied-2">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
				scenario: 'template',
				expected: {
					refused: {
						key: 'TARGET_INSTANCE_REQUIRED',
						meta: {
							instances: [
								{ tagName: 'IED', id: 'project-ied' },
								{ tagName: 'IED', id: 'project-ied-2' },
							],
						},
					},
				},
				expectedQueries: ['/default:SCL[count(default:IED)=2]'],
			},
		'template, the project holding two IEDs placed from it, P2 named → its update reported': {
			sourceXml: isdXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000099" templateUuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied">
						<AccessPoint name="AP1"/>
					</IED>
					<IED name="P2" uuid="20000000-0000-4000-8000-000000000097" templateUuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied-2">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
			scenario: 'template',
			targetInstance: { tagName: 'IED', id: 'project-ied-2' },
			expected: { instances: 1, firstPlacements: 0 },
			expectedQueries: ['/default:SCL[count(default:IED)=2]'],
		},
		'template, an IED of the project named that was not placed from it → refused, the update starts from an instance':
			{
				sourceXml: isdXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000099" templateUuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied">
						<AccessPoint name="AP1"/>
					</IED>
					<IED name="R1" uuid="20000000-0000-4000-8000-000000000096" ${id}="other-ied">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
				scenario: 'template',
				targetInstance: { tagName: 'IED', id: 'other-ied' },
				expected: {
					refused: {
						key: 'TARGET_INSTANCE_REQUIRED',
						meta: {
							instances: [{ tagName: 'IED', id: 'project-ied' }],
							named: { tagName: 'IED', id: 'other-ied' },
						},
					},
				},
				expectedQueries: ['/default:SCL[count(default:IED)=2]'],
			},
		'template, the file opened as an ICD, the project holding an IED placed from it → refused, an ICD update is not available yet':
			{
				sourceXml: isdXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000099" templateUuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
				scenario: 'template',
				fileName: 'P1.icd',
				expected: {
					refused: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'source', value: 'icd' } },
				},
				expectedQueries: ['/default:SCL[count(default:IED)=1]'],
			},
		'fork, the project holding the IED by its own uuid → refused, the scenario is not available yet':
			{
				sourceXml: isdXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
				scenario: 'fork',
				expected: {
					refused: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'scenario', value: 'fork' } },
				},
				expectedQueries: [
					'/default:SCL[count(default:IED)=1]/default:IED[@name="P1"][@uuid="20000000-0000-4000-8000-000000000001"]',
				],
			},
		'instantiate, the project holding an IED placed from it → one first placement beside it, the matched IED not listed':
			{
				sourceXml: isdXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000099" templateUuid="20000000-0000-4000-8000-000000000001" ${id}="project-ied">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
				scenario: 'instantiate',
				expected: { instances: 1, firstPlacements: 1 },
				expectedQueries: [
					'/default:SCL[count(default:IED)=1]/default:IED[@name="P1"][@uuid="20000000-0000-4000-8000-000000000099"][@templateUuid="20000000-0000-4000-8000-000000000001"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<MatchedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await openAsIsd({
			project,
			xml: testCase.sourceXml,
			fileName: testCase.fileName,
		})
		const outcome = await target.query.lifecycle
			.report({
				verb: 'ied',
				sourceQuery,
				ref: iedRef,
				anchor: projectRoot,
				scenario: testCase.scenario,
				targetInstance: testCase.targetInstance,
			})
			.then(
				(reported) => ({
					instances: reported.instances.length,
					firstPlacements: reported.instances.filter((instance) => !instance.rootRef).length,
				}),
				(error: unknown) => {
					const refusal = toDialecteError(error)
					return { refused: { key: refusal?.key, meta: refusal?.meta } }
				},
			)
		expect(outcome).toEqual(testCase.expected)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
