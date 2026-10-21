import { findByUuid, listGroups, reportAndApply } from '../integration-helpers'

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
	/** The application of the newer revision, by its uuid. */
	applicationUuid: string
	/** Where the fork starts in the project, by the bay's uuid or record id. */
	anchor: { uuid: string } | { id: string }
	/** The report instances matched in the project, by their uuid (none: a first placement), sorted. */
	expectedInstances: (string | undefined)[]
	/** The groups of the report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
	/** Forked a second time, after the newer revision changed this way (or not at all), from this source. */
	secondFork?: { sourceXml?: string }
}

const TYPES = /* xml */ `
	<DataTypeTemplates>
		<LNodeType id="CSWI_Type" lnClass="CSWI">
			<DO name="Pos" type="DPC_Type"/>
		</LNodeType>
		<DOType id="DPC_Type" cdc="DPC">
			<DA name="stVal" bType="BOOLEAN" fc="ST"/>
		</DOType>
	</DataTypeTemplates>
`

/**
 * One revision of an ASD file: the application `HMI` (uuid `application-uuid`) composing `Prot` (uuid
 * `function-uuid`), with what the case adds. `side` keeps the record ids of the source and of the project apart.
 */
function asdRevision(params: {
	side: 'source' | 'project'
	applicationAttributes?: string
	functionAttributes?: string
	roleContent?: string
	applicationContent?: string
	bayPrivate?: string
	bay?: string
}): string {
	const { side, applicationAttributes = '', functionAttributes = '' } = params
	const { roleContent = '', applicationContent = '', bayPrivate = '', bay = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="${side}">
			<Substation name="TEMPLATE" ${id}="${side}-substation">
				<VoltageLevel name="TEMPLATE" ${id}="${side}-voltage-level">
					<Bay name="TEMPLATE" uuid="bay-uuid" ${id}="${side}-bay">
						<Private type="eIEC61850-6-100" ${id}="${side}-bay-private">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${applicationAttributes} ${id}="${side}-application">
								<eIEC61850-6-100:FunctionRole name="ROOT" uuid="role-uuid" ${id}="${side}-role">
									<eIEC61850-6-100:FunctionRoleContent ${id}="${side}-role-content">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="${side}-function-ref"/>
										${roleContent}
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
								${applicationContent}
							</eIEC61850-6-100:Application>
							${bayPrivate}
						</Private>
						<Function name="Prot" uuid="function-uuid" ${functionAttributes} ${id}="${side}-function">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-uuid" ${id}="${side}-lnode"/>
						</Function>
						${bay}
					</Bay>
				</VoltageLevel>
			</Substation>
			${TYPES}
		</SCL>
	`
}

const gainedFunctionRef = /* xml */ `<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="gained-function-uuid" ${id}="source-gained-function-ref"/>`
const gainedFunction = /* xml */ `
	<Function name="Ctrl" uuid="gained-function-uuid" ${id}="source-gained-function">
		<LNode iedName="None" lnClass="CSWI" lnInst="3" lnType="CSWI_Type" uuid="gained-lnode-uuid" ${id}="source-gained-lnode"/>
	</Function>
`

const allocationRole = (side: string, name: string, uuid: string) => /* xml */ `
	<eIEC61850-6-100:AllocationRole name="${name}" uuid="${uuid}" ${id}="${side}-${name}">
		<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="${side}-${name}-function-ref"/>
	</eIEC61850-6-100:AllocationRole>
`
const allocationRoleRef = (side: string, name: string, uuid: string) =>
	/* xml */ `<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/${name}" allocationRoleUuid="${uuid}" ${id}="${side}-${name}-ref"/>`

const projectWithEmptyBay = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The renamed application of the twins, the uuid of its application. */
const TWIN_APPLICATION_UUID = '00000000-0000-4000-8000-000000000110'

describe('asd fork: the newer revision of the same file, its uuids kept', () => {
	const testCases: SclTest.TestCases<ForkTestCase> = {
		'the application and its composed function are reconciled in place, their uuids kept': {
			sourceXml: asdRevision({
				side: 'source',
				applicationAttributes: 'desc="rev2"',
				functionAttributes: 'desc="rev2"',
			}),
			targetXml: asdRevision({
				side: 'project',
				applicationAttributes: 'desc="rev1"',
				functionAttributes: 'desc="rev1"',
			}),
			applicationUuid: 'application-uuid',
			anchor: { id: 'project-bay' },
			expectedInstances: ['application-uuid', 'function-uuid'],
			expectedGroups: ['modified Application', 'modified Function'],
			expectedQueries: [
				'//v2019C1:Application[@uuid="application-uuid"][@desc="rev2"]',
				'//default:Function[@uuid="function-uuid"][@desc="rev2"]',
			],
			unexpectedQueries: [
				'//v2019C1:Application[@templateUuid]',
				'//default:Function[@templateUuid]',
				'//*[@desc="rev1"]',
			],
		},
		'a gained allocation role keeps its uuid': {
			sourceXml: asdRevision({
				side: 'source',
				applicationContent: allocationRoleRef('source', 'BCU', 'role-bcu-uuid'),
				bayPrivate: allocationRole('source', 'BCU', 'role-bcu-uuid'),
			}),
			targetXml: asdRevision({ side: 'project' }),
			applicationUuid: 'application-uuid',
			anchor: { id: 'project-bay' },
			expectedInstances: ['application-uuid', 'function-uuid'],
			expectedGroups: ['added AllocationRole', 'added AllocationRoleRef'],
			expectedQueries: [
				'//v2019C1:AllocationRole[@name="BCU"][@uuid="role-bcu-uuid"]',
				'//v2019C1:AllocationRoleRef[@allocationRoleUuid="role-bcu-uuid"]',
			],
			unexpectedQueries: ['//v2019C1:AllocationRole[@templateUuid]'],
		},
		'a composed function the newer revision gained keeps its uuid and the reference names it; a second fork adds nothing':
			{
				sourceXml: asdRevision({
					side: 'source',
					roleContent: gainedFunctionRef,
					bay: gainedFunction,
				}),
				targetXml: asdRevision({ side: 'project' }),
				applicationUuid: 'application-uuid',
				anchor: { id: 'project-bay' },
				expectedInstances: ['application-uuid', 'function-uuid', undefined],
				expectedGroups: ['added Function', 'added FunctionRef'],
				secondFork: {},
				expectedQueries: [
					'//default:Function[@name="Ctrl"][@uuid="gained-function-uuid"]/default:LNode[@uuid="gained-lnode-uuid"]',
					'//v2019C1:FunctionRef[@functionUuid="gained-function-uuid"]',
				],
				unexpectedQueries: [
					'//default:Function[@templateUuid]',
					'//v2019C1:FunctionSclRef',
					'//default:Function[@name="Ctrl"][2]',
					'//default:Function[starts-with(@name, "Ctrl_")]',
				],
			},
		'a first fork of the application into a bay places it with every uuid of the file, no lineage, no provenance':
			{
				sourceXml: asdRevision({ side: 'source' }),
				targetXml: projectWithEmptyBay,
				applicationUuid: 'application-uuid',
				anchor: { id: 'project-bay' },
				expectedInstances: [undefined, undefined],
				expectedGroups: ['added Application', 'added Function'],
				secondFork: {},
				expectedQueries: [
					'//default:Bay[@name="B1"]//v2019C1:Application[@uuid="application-uuid"]/v2019C1:FunctionRole[@uuid="role-uuid"]',
					'//default:Bay[@name="B1"]/default:Function[@uuid="function-uuid"]/default:LNode[@uuid="lnode-uuid"]',
				],
				unexpectedQueries: [
					'//*[@templateUuid]',
					'//v2019C1:ApplicationSclRef',
					'//v2019C1:FunctionSclRef',
					'//v2019C1:Application[2]',
					'//default:Function[2]',
				],
			},
		'a real application file forked into an empty bay, then its next revision: the file uuids, its own lineage only, nothing added':
			{
				sourceXml: readRevisionTwin({ twin: 'applicationRenamesFunctions', revision: 1 }),
				targetXml: projectWithEmptyBay,
				applicationUuid: TWIN_APPLICATION_UUID,
				anchor: { id: 'project-bay' },
				expectedInstances: [undefined, undefined],
				expectedGroups: ['added Application', 'added Function'],
				secondFork: {
					sourceXml: readRevisionTwin({ twin: 'applicationRenamesFunctions', revision: 2 }),
				},
				expectedQueries: [
					`//v2019C1:Application[@uuid="${TWIN_APPLICATION_UUID}"]`,
					'//default:Function[@name="Breaker_Fn"][@uuid="00000000-0000-4000-8000-000000000120"]',
					'//default:SubFunction[@uuid="00000000-0000-4000-8000-000000000122"][@templateUuid="00000000-0000-4000-8000-000000000126"]',
					'//v2019C1:AllocationRole[@uuid="00000000-0000-4000-8000-000000000114"]',
					'//v2019C1:FunctionCategory[@uuid="00000000-0000-4000-8000-000000000104"][@templateUuid="00000000-0000-4000-8000-000000000105"]',
					'(//*[@templateUuid])[9]',
					'(//v2019C1:FunctionSclRef)[4]',
				],
				unexpectedQueries: [
					// the file's own lineage only: its four subfunctions, their logical nodes, the category
					'(//*[@templateUuid])[10]',
					// its own provenance only: the four subfunctions', none of the application's
					'(//v2019C1:FunctionSclRef)[5]',
					'//v2019C1:ApplicationSclRef',
					'//v2019C1:Application[2]',
					'//default:Function[2]',
					'//v2019C1:AllocationRole[2]',
					'//v2019C1:FunctionCategory[2]',
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
		const anchor =
			'uuid' in testCase.anchor
				? await findByUuid(target.query, { tagName: 'Bay', uuid: testCase.anchor.uuid })
				: ({ tagName: 'Bay', id: testCase.anchor.id } as Scl.Ref<'Bay'>)
		const lifecycleFrom = async (sourceQuery: Scl.Query): Promise<LifecycleTarget> => ({
			verb: 'asd',
			sourceQuery,
			ref: await findByUuid(sourceQuery, {
				tagName: 'Application',
				uuid: testCase.applicationUuid,
			}),
			anchor,
			scenario: 'fork',
		})

		const { report } = await reportAndApply({
			document: target,
			lifecycle: await lifecycleFrom(source.query),
		})
		const matched: (string | undefined)[] = []
		for (const instance of report.instances) {
			matched.push(
				instance.rootRef
					? (await target.query.any.getAttributes(instance.rootRef)).uuid
					: undefined,
			)
		}
		expect(matched.sort()).toEqual(testCase.expectedInstances)
		expect(listGroups(report)).toEqual(testCase.expectedGroups)

		if (testCase.secondFork) {
			const next = testCase.secondFork.sourceXml
				? await openSclDocument({
						project,
						xml: testCase.secondFork.sourceXml,
						label: 'next revision',
					})
				: source
			await reportAndApply({ document: target, lifecycle: await lifecycleFrom(next.query) })
		}

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
