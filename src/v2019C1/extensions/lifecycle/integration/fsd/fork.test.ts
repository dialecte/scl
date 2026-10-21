import { listGroups, reportAndApply } from '../integration-helpers'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import { fsd as updateFsd } from '@/v2019C1/extensions/lifecycle/update/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The function of the newer revision, in the source. */
const functionRef = { tagName: 'Function', id: 'source-function' } as Scl.Ref<'Function'>

type ForkTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The previous revision of the file, given to the fork as its base. */
	baseXml?: string
	/** Where the fork starts in the project. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The one instance the fork is scoped to, when the case says. */
	targetInstance?: Scl.Ref<Scl.ElementsOf>
	/** The record ids of the project elements the report matched, one per instance (none: a first placement). */
	expectedInstances: (string | undefined)[]
	/** The groups of the report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
	/** Where the report lands a shared source element (by record ids), when the case says. */
	expectedMappings?: { source: string; lands: string }[]
	/** Forked a second time, after the newer revision changed this way (or not at all). */
	secondFork?: { editSource?: (tx: Scl.Transaction) => Promise<void> }
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
 * One revision of an FSD file: the function `Prot` (uuid `function-uuid`, its logical node `lnode-uuid`) in a
 * `TEMPLATE` bay, with what the case adds in it and beside it. `side` keeps the record ids of the source (`source`)
 * and of the project (`project`) apart.
 */
function fsdRevision(params: {
	side: 'source' | 'project' | 'base'
	functionAttributes?: string
	inside?: string
	substationPrivate?: string
}): string {
	const { side, functionAttributes = '', inside = '', substationPrivate } = params
	const priv = substationPrivate
		? `<Private type="eIEC61850-6-100" ${id}="${side}-substation-private">${substationPrivate}</Private>`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="${side}">
			<Substation name="TEMPLATE" ${id}="${side}-substation">
				${priv}
				<VoltageLevel name="TEMPLATE" ${id}="${side}-voltage-level">
					<Bay name="TEMPLATE" ${id}="${side}-bay">
						<Function name="Prot" uuid="function-uuid" ${functionAttributes} ${id}="${side}-function">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-uuid" ${id}="${side}-lnode"/>
							${inside}
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			${TYPES}
		</SCL>
	`
}

const projectBay = { tagName: 'Bay', id: 'project-bay' } as Scl.Ref<'Bay'>

/** A project with an empty bay, and a function elsewhere when the case says. */
function projectWithEmptyBay(elsewhere = ''): string {
	return /* xml */ `
		<SCL ${ns} ${id}="project">
			<Substation name="S1" ${id}="project-substation">
				<VoltageLevel name="V1" ${id}="project-voltage-level">
					<Bay name="B1" ${id}="project-bay"/>
					<Bay name="B2" ${id}="project-other-bay">${elsewhere}</Bay>
				</VoltageLevel>
			</Substation>
			${TYPES}
		</SCL>
	`
}

const droppedLNode = (side: string) =>
	/* xml */ `<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="CSWI_Type" uuid="dropped-lnode-uuid" ${id}="${side}-dropped-lnode"/>`
const userLNode = /* xml */ `<LNode iedName="None" lnClass="GGIO" lnInst="9" lnType="CSWI_Type" uuid="user-lnode-uuid" ${id}="project-user-lnode"/>`

const gainedSubFunction = /* xml */ `
	<SubFunction name="Sub" uuid="subfunction-uuid" ${id}="source-subfunction">
		<LNode iedName="None" lnClass="CSWI" lnInst="2" lnType="CSWI_Type" uuid="sub-lnode-uuid" ${id}="source-sub-lnode"/>
	</SubFunction>
`

const category = (side: string, desc: string) => /* xml */ `
	<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" desc="${desc}" uuid="category-uuid" ${id}="${side}-category">
		<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="${side}-category-ref"/>
	</eIEC61850-6-100:FunctionCategory>
`

const variable = (side: string, desc: string) => /* xml */ `
	<eIEC61850-6-100:Variable name="Prefix" value="DVNAME" desc="${desc}" uuid="variable-uuid" ${id}="${side}-variable">
		<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-uuid" ${id}="${side}-variable-apply"/>
	</eIEC61850-6-100:Variable>
`

describe('fsd fork: the newer revision of the same file, its uuids kept', () => {
	const testCases: SclTest.TestCases<ForkTestCase> = {
		'the previous revision is reconciled in place: its uuids, no lineage, the changed values written':
			{
				sourceXml: fsdRevision({ side: 'source', functionAttributes: 'desc="rev2"' }),
				targetXml: fsdRevision({ side: 'project', functionAttributes: 'desc="rev1"' }),
				anchor: { tagName: 'Bay', id: 'project-bay' },
				expectedInstances: ['project-function'],
				expectedGroups: ['modified Function'],
				expectedQueries: [
					'//default:Function[@name="Prot"][@uuid="function-uuid"][@desc="rev2"]',
					'//default:Function[@uuid="function-uuid"]/default:LNode[@uuid="lnode-uuid"]',
				],
				unexpectedQueries: [
					'//default:Function[@templateUuid]',
					'//default:Function[@desc="rev1"]',
					'//default:Function[2]',
				],
			},
		'an element the previous revision held and the newer one dropped is removed': {
			sourceXml: fsdRevision({ side: 'source' }),
			targetXml: fsdRevision({ side: 'project', inside: droppedLNode('project') }),
			baseXml: fsdRevision({ side: 'base', inside: droppedLNode('base') }),
			anchor: { tagName: 'Bay', id: 'project-bay' },
			expectedInstances: ['project-function'],
			expectedGroups: ['removed LNode'],
			expectedQueries: [
				'//default:Function[@uuid="function-uuid"]/default:LNode[@uuid="lnode-uuid"]',
			],
			unexpectedQueries: ['//default:LNode[@uuid="dropped-lnode-uuid"]'],
		},
		'an element the project added beside the previous revision is its own: listed, kept': {
			sourceXml: fsdRevision({ side: 'source' }),
			targetXml: fsdRevision({ side: 'project', inside: userLNode }),
			baseXml: fsdRevision({ side: 'base' }),
			anchor: { tagName: 'Bay', id: 'project-bay' },
			expectedInstances: ['project-function'],
			expectedGroups: ['target-only LNode'],
			expectedQueries: [
				'//default:Function[@uuid="function-uuid"]/default:LNode[@uuid="user-lnode-uuid"]',
			],
		},
		"without the previous revision, an element the newer one lacks is listed as the project's own and kept":
			{
				sourceXml: fsdRevision({ side: 'source' }),
				targetXml: fsdRevision({ side: 'project', inside: droppedLNode('project') }),
				anchor: { tagName: 'Bay', id: 'project-bay' },
				expectedInstances: ['project-function'],
				expectedGroups: ['target-only LNode'],
				expectedQueries: [
					'//default:Function[@uuid="function-uuid"]/default:LNode[@uuid="dropped-lnode-uuid"]',
				],
			},
		'an element the newer revision gained keeps its uuid': {
			sourceXml: fsdRevision({
				side: 'source',
				inside: `<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="CSWI_Type" uuid="gained-lnode-uuid" ${id}="source-gained-lnode"/>`,
			}),
			targetXml: fsdRevision({ side: 'project' }),
			anchor: { tagName: 'Bay', id: 'project-bay' },
			expectedInstances: ['project-function'],
			expectedGroups: ['added LNode'],
			expectedQueries: [
				'//default:Function[@uuid="function-uuid"]/default:LNode[@lnClass="XCBR"][@uuid="gained-lnode-uuid"]',
			],
			unexpectedQueries: ['//default:LNode[@templateUuid]'],
		},
		'a subfunction the newer revision gained keeps its uuid, and a second fork adds nothing': {
			sourceXml: fsdRevision({ side: 'source', inside: gainedSubFunction }),
			targetXml: fsdRevision({ side: 'project' }),
			anchor: { tagName: 'Bay', id: 'project-bay' },
			expectedInstances: ['project-function'],
			expectedGroups: ['added SubFunction'],
			secondFork: {},
			expectedQueries: [
				'//default:Function[@uuid="function-uuid"]/default:SubFunction[@uuid="subfunction-uuid"]/default:LNode[@uuid="sub-lnode-uuid"]',
			],
			unexpectedQueries: [
				'//default:SubFunction[@templateUuid]',
				'//default:SubFunction//v2019C1:FunctionSclRef',
				'//default:SubFunction[2]',
			],
		},
		"the project's own element under a function the newer revision changes is its own decision, kept":
			{
				sourceXml: fsdRevision({ side: 'source', functionAttributes: 'desc="rev2"' }),
				targetXml: fsdRevision({ side: 'project', inside: userLNode }),
				baseXml: fsdRevision({ side: 'base' }),
				anchor: { tagName: 'Bay', id: 'project-bay' },
				expectedInstances: ['project-function'],
				expectedGroups: ['modified Function', 'target-only LNode'],
				expectedQueries: [
					'//default:Function[@uuid="function-uuid"][@desc="rev2"]/default:LNode[@uuid="user-lnode-uuid"]',
				],
			},
		'without the previous revision, what the newer one lacks under a function it changes is kept': {
			sourceXml: fsdRevision({ side: 'source', functionAttributes: 'desc="rev2"' }),
			targetXml: fsdRevision({ side: 'project', inside: droppedLNode('project') }),
			anchor: { tagName: 'Bay', id: 'project-bay' },
			expectedInstances: ['project-function'],
			expectedGroups: ['modified Function', 'target-only LNode'],
			expectedQueries: [
				'//default:Function[@uuid="function-uuid"][@desc="rev2"]/default:LNode[@uuid="dropped-lnode-uuid"]',
			],
		},
		'a first fork into a bay without the function places it with its uuid, no lineage, no provenance; the next one reconciles it':
			{
				sourceXml: fsdRevision({ side: 'source' }),
				targetXml: projectWithEmptyBay(),
				anchor: projectBay,
				expectedInstances: [undefined],
				expectedGroups: ['added Function'],
				secondFork: {
					editSource: async (tx) => {
						await tx.update(functionRef, { attributes: { desc: 'rev2' } })
					},
				},
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Function[@uuid="function-uuid"][@desc="rev2"]/default:LNode[@uuid="lnode-uuid"]',
				],
				unexpectedQueries: [
					'//default:Function[@templateUuid]',
					'//default:LNode[@templateUuid]',
					'//v2019C1:FunctionSclRef',
					'//default:Bay[@name="B1"]/default:Function[2]',
				],
			},
		'a function the project already holds elsewhere is reconciled where it sits, not placed beside it':
			{
				sourceXml: fsdRevision({ side: 'source', functionAttributes: 'desc="rev2"' }),
				targetXml: projectWithEmptyBay(/* xml */ `
					<Function name="Prot" uuid="function-uuid" desc="rev1" ${id}="project-function">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-uuid" ${id}="project-lnode"/>
					</Function>
				`),
				anchor: projectBay,
				expectedInstances: ['project-function'],
				expectedGroups: ['modified Function'],
				expectedQueries: [
					'//default:Bay[@name="B2"]/default:Function[@uuid="function-uuid"][@desc="rev2"]',
				],
				unexpectedQueries: ['//default:Bay[@name="B1"]/default:Function'],
			},
		'scoped to a bay that lacks it, a fork still finds the function elsewhere: no second element of its uuid':
			{
				sourceXml: fsdRevision({ side: 'source', functionAttributes: 'desc="rev2"' }),
				targetXml: projectWithEmptyBay(/* xml */ `
					<Function name="Prot" uuid="function-uuid" desc="rev1" ${id}="project-function">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-uuid" ${id}="project-lnode"/>
					</Function>
				`),
				anchor: projectBay,
				targetInstance: projectBay,
				expectedInstances: ['project-function'],
				expectedGroups: ['modified Function'],
				expectedQueries: [
					'//default:Bay[@name="B2"]/default:Function[@uuid="function-uuid"][@desc="rev2"]',
				],
				unexpectedQueries: ['//default:Bay[@name="B1"]/default:Function'],
			},
		'a carried category is reconciled in place by its uuid, a gained one keeps its uuid': {
			sourceXml: fsdRevision({
				side: 'source',
				substationPrivate: `${category('source', 'rev2')}
					<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="gained" uuid="gained-category-uuid" ${id}="source-gained-category">
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="source-gained-category-ref"/>
					</eIEC61850-6-100:FunctionCategory>`,
			}),
			targetXml: fsdRevision({ side: 'project', substationPrivate: category('project', 'rev1') }),
			anchor: { tagName: 'Bay', id: 'project-bay' },
			expectedInstances: ['project-function'],
			expectedGroups: ['added FunctionCategory', 'modified FunctionCategory'],
			expectedQueries: [
				'//v2019C1:FunctionCategory[@uuid="category-uuid"][@desc="rev2"]',
				'//v2019C1:FunctionCategory[@name="PROTECTION"][@uuid="gained-category-uuid"]',
			],
			unexpectedQueries: [
				'//v2019C1:FunctionCategory[@templateUuid]',
				'//v2019C1:FunctionCategory[@desc="rev1"]',
			],
		},
		'a gained signal points at the gained logical node by its kept uuid': {
			sourceXml: fsdRevision({
				side: 'source',
				inside: /* xml */ `
					<SubFunction name="Sub" uuid="subfunction-uuid" ${id}="source-subfunction">
						<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="CSWI_Type" uuid="trip-lnode-uuid" ${id}="source-trip-lnode"/>
						<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="CSWI_Type" uuid="breaker-lnode-uuid" ${id}="source-breaker-lnode">
							<Private type="eIEC61850-6-100" ${id}="source-breaker-private">
								<eIEC61850-6-100:LNodeInputs ${id}="source-inputs">
									<eIEC61850-6-100:SourceRef input="Trip" source="TEMPLATE/Prot/Sub/PTRC1" sourceLNodeUuid="trip-lnode-uuid" sourceDoName="Tr" sourceDaName="general" uuid="source-ref-uuid" ${id}="source-source-ref"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</SubFunction>
				`,
			}),
			targetXml: fsdRevision({ side: 'project' }),
			anchor: { tagName: 'Bay', id: 'project-bay' },
			expectedInstances: ['project-function'],
			expectedGroups: ['added SubFunction'],
			expectedQueries: [
				'//default:SubFunction[@uuid="subfunction-uuid"]/default:LNode[@lnClass="PTRC"][@uuid="trip-lnode-uuid"]',
				'//v2019C1:SourceRef[@uuid="source-ref-uuid"][@sourceLNodeUuid="trip-lnode-uuid"]',
			],
			unexpectedQueries: ['//v2019C1:SourceRef[@templateUuid]'],
		},
		'a variable applying to the function is reconciled in place by its uuid, a gained one keeps its uuid':
			{
				sourceXml: fsdRevision({
					side: 'source',
					substationPrivate: `${variable('source', 'rev2')}
					<eIEC61850-6-100:Variable name="Suffix" value="X" desc="gained" uuid="gained-variable-uuid" ${id}="source-gained-variable">
						<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-uuid" ${id}="source-gained-variable-apply"/>
					</eIEC61850-6-100:Variable>`,
				}),
				targetXml: fsdRevision({ side: 'project', substationPrivate: variable('project', 'rev1') }),
				anchor: { tagName: 'Bay', id: 'project-bay' },
				expectedInstances: ['project-function'],
				expectedGroups: ['added Variable', 'modified Variable'],
				expectedQueries: [
					'//v2019C1:Variable[@uuid="variable-uuid"][@desc="rev2"]',
					'//v2019C1:Variable[@name="Suffix"][@uuid="gained-variable-uuid"]',
				],
				unexpectedQueries: [
					'//v2019C1:Variable[@templateUuid]',
					'//v2019C1:Variable[@desc="rev1"]',
				],
			},
		'a first fork onto a project holding the category under its uuid: the one category, the reference added to it':
			{
				sourceXml: fsdRevision({ side: 'source', substationPrivate: category('source', 'rev2') }),
				targetXml: projectWithEmptyBay().replace(
					`<Substation name="S1" ${id}="project-substation">`,
					`<Substation name="S1" ${id}="project-substation"><Private type="eIEC61850-6-100" ${id}="project-substation-private"><eIEC61850-6-100:FunctionCategory name="PROTECTION_OLD" uuid="category-uuid" ${id}="project-category"/></Private>`,
				),
				anchor: projectBay,
				expectedInstances: [undefined],
				expectedGroups: ['added Function'],
				expectedMappings: [{ source: 'source-category', lands: 'project-category' }],
				expectedQueries: [
					'//v2019C1:FunctionCategory[@uuid="category-uuid"]/v2019C1:FunctionCatRef[@functionUuid="function-uuid"]',
				],
				unexpectedQueries: [
					'//v2019C1:FunctionCategory[2]',
					'//v2019C1:FunctionCategory[@templateUuid]',
				],
			},
		'a carried category the newer revision dropped: what the report lists is what the apply removes':
			{
				sourceXml: fsdRevision({ side: 'source' }),
				targetXml: fsdRevision({ side: 'project', substationPrivate: category('project', 'rev1') }),
				baseXml: fsdRevision({ side: 'base', substationPrivate: category('base', 'rev1') }),
				anchor: { tagName: 'Bay', id: 'project-bay' },
				expectedInstances: ['project-function'],
				expectedGroups: ['removed FunctionCategory'],
				expectedQueries: ['//default:Function[@uuid="function-uuid"]'],
				unexpectedQueries: ['//v2019C1:FunctionCategory', '//v2019C1:FunctionCatRef'],
			},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<ForkTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const base = testCase.baseXml
			? await openSclDocument({ project, xml: testCase.baseXml, label: 'previous revision' })
			: undefined
		const lifecycle: LifecycleTarget = {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: testCase.anchor,
			scenario: 'fork',
			...(base ? { baseQuery: base.query } : {}),
			...(testCase.targetInstance ? { targetInstance: testCase.targetInstance } : {}),
		}

		const { report } = await reportAndApply({ document: target, lifecycle })
		expect(report.revisionBase).toBe(base ? 'given' : 'absent')
		expect(report.instances.map((instance) => instance.rootRef?.id)).toEqual(
			testCase.expectedInstances,
		)
		expect(listGroups(report)).toEqual(testCase.expectedGroups)
		for (const { source: sourceId, lands } of testCase.expectedMappings ?? []) {
			const listed = report.mappings.find((mapping) => mapping.id === sourceId)
			const landing = listed?.mapping
			expect(landing && 'existing' in landing ? landing.existing.id : undefined).toBe(lands)
			// what the apply wrote it onto
			expect(listed?.appliedRef?.id).toBe(lands)
		}

		if (testCase.secondFork) {
			const { editSource } = testCase.secondFork
			if (editSource) await source.transaction(editSource)
			await reportAndApply({ document: target, lifecycle })
		}

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('fsd fork: the previous revision it is given', () => {
	const withHeader = (xml: string, fileUuid: string) =>
		xml.replace(
			'<Substation name="TEMPLATE"',
			`<Header id="function-file" uuid="${fileUuid}" version="1" revision="2"/><Substation name="TEMPLATE"`,
		)

	it('is refused when it is another file: both name their file, and the names differ', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: withHeader(fsdRevision({ side: 'source' }), 'function-file-uuid'),
			targetXml: fsdRevision({ side: 'project' }),
		})
		if (!target) throw new Error('target required')
		const base = await openSclDocument({
			project,
			xml: withHeader(fsdRevision({ side: 'base' }), 'other-file-uuid'),
			label: 'previous revision',
		})

		const refused = report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: { tagName: 'Bay', id: 'project-bay' },
			scenario: 'fork',
			baseQuery: base.query,
		})
		await expect(refused).rejects.toThrow()
		const refusal = toDialecteError(await refused.catch((error: unknown) => error))
		expect({ key: refusal?.key, meta: refusal?.meta }).toEqual({
			key: 'REVISION_BASE_OTHER_FILE',
			meta: { fileUuid: 'function-file-uuid', baseFileUuid: 'other-file-uuid' },
		})
	})

	it('is read when the newer revision names no file: its elements say which revision it is', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: fsdRevision({ side: 'source' }),
			targetXml: fsdRevision({ side: 'project', inside: droppedLNode('project') }),
		})
		if (!target) throw new Error('target required')
		const base = await openSclDocument({
			project,
			xml: withHeader(fsdRevision({ side: 'base', inside: droppedLNode('base') }), 'any-file-uuid'),
			label: 'previous revision',
		})

		const reported = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: { tagName: 'Bay', id: 'project-bay' },
			scenario: 'fork',
			baseQuery: base.query,
		})
		expect(listGroups(reported)).toEqual(['removed LNode'])
	})

	it('is refused by an update that is not a fork', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: fsdRevision({ side: 'source' }),
			targetXml: fsdRevision({ side: 'project' }),
		})
		if (!target) throw new Error('target required')
		const base = await openSclDocument({
			project,
			xml: fsdRevision({ side: 'base' }),
			label: 'previous revision',
		})

		const refused = target.document.transaction(async function updateWithBase(tx) {
			await updateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: { tagName: 'Bay', id: 'project-bay' },
				scenario: 'template',
				baseQuery: base.query,
			})
		})
		await expect(refused).rejects.toThrow()
		const refusal = toDialecteError(await refused.catch((error: unknown) => error))
		expect({ key: refusal?.key, meta: refusal?.meta }).toEqual({
			key: 'REVISION_BASE_WITHOUT_FORK',
			meta: { scenario: 'template' },
		})
	})

	it("is a fork's only: the target of another scenario takes none", () => {
		type Template = Extract<LifecycleTarget, { verb: 'fsd'; scenario?: 'instantiate' | 'template' }>
		type Fork = Extract<LifecycleTarget, { verb: 'fsd'; scenario: 'fork' }>
		expectTypeOf<Template['baseQuery']>().toEqualTypeOf<undefined>()
		expectTypeOf<Fork['baseQuery']>().toEqualTypeOf<Core.Query<Config> | undefined>()
	})
})
