import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { readAttribute } from '@/v2019C1/helpers'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	BoundLogicalNodeTypes,
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// An update that leaves a type with no logical node naming it removes the type, and the data types only it names: the
// logical node removed, or the logical node that follows another type. A type another element still names stays.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TypeCatalogue = 'A' | 'B' | 'C' | 'IED'

/** The types of a catalogue, each chain of its own: a logical node type, its data object type, below it. */
const TYPE_CHAINS: Record<
	TypeCatalogue,
	{
		logicalNodeType: string
		dataObjectType: string
		dataAttributeTypes?: string
		enumType?: string
	}
> = {
	// the chain reaches every tag: logical node type, data object type, data attribute type, enumeration
	A: {
		logicalNodeType: /* xml */ `
			<LNodeType id="PTOC_A" lnClass="PTOC" ${id}="lnt-a"><DO name="Op" type="ACT_A" ${id}="do-a"/></LNodeType>`,
		dataObjectType: /* xml */ `
			<DOType id="ACT_A" cdc="ACT" ${id}="dot-a"><DA name="origin" bType="Struct" type="ORG_A" fc="ST" ${id}="da-a"/></DOType>`,
		dataAttributeTypes: /* xml */ `
			<DAType id="ORG_A" ${id}="dat-a"><BDA name="orCat" bType="Enum" type="CAT_A" ${id}="bda-a"/></DAType>`,
		enumType: /* xml */ `
			<EnumType id="CAT_A" ${id}="et-a"><EnumVal ord="0" ${id}="ev-a">not-supported</EnumVal></EnumType>`,
	},
	B: {
		logicalNodeType: /* xml */ `
			<LNodeType id="PTRC_B" lnClass="PTRC" ${id}="lnt-b"><DO name="Tr" type="ACT_B" ${id}="do-b"/></LNodeType>`,
		dataObjectType: /* xml */ `
			<DOType id="ACT_B" cdc="ACT" ${id}="dot-b"><DA name="general" bType="BOOLEAN" fc="ST" ${id}="da-b"/></DOType>`,
	},
	C: {
		logicalNodeType: /* xml */ `
			<LNodeType id="PTOC_C" lnClass="PTOC" ${id}="lnt-c"><DO name="Op" type="ACT_C" ${id}="do-c"/></LNodeType>`,
		dataObjectType: /* xml */ `
			<DOType id="ACT_C" cdc="ACT" ${id}="dot-c"><DA name="operate" bType="BOOLEAN" fc="ST" ${id}="da-c"/></DOType>`,
	},
	// the type of the logical node an IED implements: no data object
	IED: {
		logicalNodeType: /* xml */ `
			<LNodeType id="PTOC_IED" lnClass="PTOC" ${id}="lnt-ied"/>
			<LNodeType id="LLN0_IED" lnClass="LLN0" ${id}="lnt-ied-ln0"/>`,
		dataObjectType: '',
	},
}

/** The data type templates holding the chains of the catalogues, every tag in the order the schema asks. */
function dataTypeTemplates(catalogues: readonly TypeCatalogue[]): string {
	const chains = catalogues.map((catalogue) => TYPE_CHAINS[catalogue])
	return /* xml */ `
		<DataTypeTemplates ${id}="types">
			${chains.map((chain) => chain.logicalNodeType).join('')}
			${chains.map((chain) => chain.dataObjectType).join('')}
			${chains.map((chain) => chain.dataAttributeTypes ?? '').join('')}
			${chains.map((chain) => chain.enumType ?? '').join('')}
		</DataTypeTemplates>
	`
}

/** The device P1, whose logical node PTOC1 and logical node zero are of types of their own. */
const device = /* xml */ `
	<IED name="P1">
		<AccessPoint name="AP1">
			<Server>
				<Authentication/>
				<LDevice inst="LD0">
					<LN0 lnClass="LLN0" inst="" lnType="LLN0_IED"/>
					<LN lnClass="PTOC" inst="1" lnType="PTOC_IED" uuid="ln-device"/>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
`

/** The logical nodes of the function: `P` is the PTOC1 of type `type`, `R` the PTRC1 of type `PTRC_B`. */
function logicalNode(params: {
	which: 'P' | 'R'
	identity: string
	type?: string
	binding?: string
}): string {
	const { which, identity, binding = 'iedName="None"' } = params
	const [lnClass, type] =
		which === 'P' ? (['PTOC', params.type ?? 'PTOC_A'] as const) : (['PTRC', 'PTRC_B'] as const)
	return /* xml */ `<LNode ${binding} lnClass="${lnClass}" lnInst="1" lnType="${type}" ${identity}/>`
}

/** The template (or the newer revision): F1 holding `logicalNodes`, and the types it names. */
function sourceXml(params: {
	logicalNodes: string
	catalogues: readonly TypeCatalogue[]
	functionUuid?: string
}): string {
	const { logicalNodes, catalogues, functionUuid = 'function-src-uuid' } = params
	return /* xml */ `
		<SCL ${ns}>
			<Header id="source" uuid="source-uuid"/>
			<Substation name="TEMPLATE">
				<VoltageLevel name="TEMPLATE">
					<Bay name="Q01">
						<Function ${id}="function-s" name="F1" uuid="${functionUuid}">
							${logicalNodes}
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			${dataTypeTemplates(catalogues)}
		</SCL>
	`
}

/** The project: the device, F1 (`functionIdentity`) holding `logicalNodes`, and `elsewhere` beside it in the bay. */
function projectXml(params: {
	logicalNodes: string
	catalogues: readonly TypeCatalogue[]
	functionIdentity: string
	elsewhere?: string
}): string {
	const { logicalNodes, catalogues, functionIdentity, elsewhere = '' } = params
	return /* xml */ `
		<SCL ${ns}>
			<Header id="project" uuid="project-uuid"/>
			<Substation name="S1">
				<VoltageLevel name="V1">
					<Bay ${id}="bay" name="B1">
						<Function name="F1" ${functionIdentity}>
							${logicalNodes}
						</Function>
						${elsewhere}
					</Bay>
				</VoltageLevel>
			</Substation>
			${device}
			${dataTypeTemplates(catalogues)}
		</SCL>
	`
}

const instanceOfTemplate = 'uuid="function-instance-uuid" templateUuid="function-src-uuid"'
const instanceOfRevision = 'uuid="function-instance-uuid"'

function templateIdentity(name: string) {
	return `uuid="${name}-src-uuid"`
}

function instanceIdentity(name: string) {
	return `uuid="${name}-instance-uuid" templateUuid="${name}-src-uuid"`
}

function revisionIdentity(name: string) {
	return `uuid="${name}-instance-uuid"`
}

/** The logical node PTOC1 of the project, bound to the PTOC1 of the device P1. */
const boundToDevice = 'iedName="P1" ldInst="LD0" prefix="" lnUuid="ln-device"'

type TypeIds = { LNodeType: string[]; DOType: string[]; DAType: string[]; EnumType: string[] }

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	scenario: LifecycleScenario
	/** The previous revision of the file, given to a fork as its base: what the newer revision dropped is removed. */
	baseXml?: string
	/** The consumer's word on the types of bound logical nodes, given to the report. Default: none. */
	boundLogicalNodeTypes?: BoundLogicalNodeTypes
	/** The ids of the types the project holds once the update is applied, per tag, sorted. */
	expectedTypes: TypeIds
}

describe('lifecycle: the types an update leaves unused go with it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'update, the template drops a logical node: its type and the data types only it names are gone':
			{
				sourceXml: sourceXml({
					logicalNodes: logicalNode({ which: 'R', identity: templateIdentity('r') }),
					catalogues: ['B'],
				}),
				targetXml: projectXml({
					logicalNodes:
						logicalNode({ which: 'P', identity: instanceIdentity('p') }) +
						logicalNode({ which: 'R', identity: instanceIdentity('r') }),
					catalogues: ['A', 'B', 'IED'],
					functionIdentity: instanceOfTemplate,
				}),
				scenario: 'template',
				expectedTypes: {
					LNodeType: ['LLN0_IED', 'PTOC_IED', 'PTRC_B'],
					DOType: ['ACT_B'],
					DAType: [],
					EnumType: [],
				},
			},

		// the type a logical node leaves for another is pruned by `importTypes` already: the row guards that the commit
		// prune, which reads the same update, keeps it so
		'regression guard (importTypes already prunes it): update, a logical node follows a new type: the old type and the data types only it names are gone':
			{
				sourceXml: sourceXml({
					logicalNodes:
						logicalNode({ which: 'P', type: 'PTOC_C', identity: templateIdentity('p') }) +
						logicalNode({ which: 'R', identity: templateIdentity('r') }),
					catalogues: ['C', 'B'],
				}),
				targetXml: projectXml({
					logicalNodes:
						logicalNode({ which: 'P', identity: instanceIdentity('p') }) +
						logicalNode({ which: 'R', identity: instanceIdentity('r') }),
					catalogues: ['A', 'B', 'IED'],
					functionIdentity: instanceOfTemplate,
				}),
				scenario: 'template',
				expectedTypes: {
					LNodeType: ['LLN0_IED', 'PTOC_C', 'PTOC_IED', 'PTRC_B'],
					DOType: ['ACT_B', 'ACT_C'],
					DAType: [],
					EnumType: [],
				},
			},

		'update, a logical node follows a new type and another is dropped whose type a logical node elsewhere names: the type left is gone, the one named elsewhere stays':
			{
				sourceXml: sourceXml({
					logicalNodes: logicalNode({
						which: 'P',
						type: 'PTOC_C',
						identity: templateIdentity('p'),
					}),
					catalogues: ['C'],
				}),
				targetXml: projectXml({
					logicalNodes:
						logicalNode({ which: 'P', identity: instanceIdentity('p') }) +
						logicalNode({ which: 'R', identity: instanceIdentity('r') }),
					catalogues: ['A', 'B', 'IED'],
					functionIdentity: instanceOfTemplate,
					elsewhere: /* xml */ `
						<Function name="Other" uuid="other-uuid">
							${logicalNode({ which: 'R', identity: 'uuid="other-r-uuid"' })}
						</Function>
					`,
				}),
				scenario: 'template',
				expectedTypes: {
					LNodeType: ['LLN0_IED', 'PTOC_C', 'PTOC_IED', 'PTRC_B'],
					DOType: ['ACT_B', 'ACT_C'],
					DAType: [],
					EnumType: [],
				},
			},

		'update, the consumer keeping the types of bound logical nodes, the template giving the bound one a new type: the type it keeps stays':
			{
				sourceXml: sourceXml({
					logicalNodes:
						logicalNode({ which: 'P', type: 'PTOC_C', identity: templateIdentity('p') }) +
						logicalNode({ which: 'R', identity: templateIdentity('r') }),
					catalogues: ['C', 'B'],
				}),
				targetXml: projectXml({
					logicalNodes:
						logicalNode({
							which: 'P',
							binding: boundToDevice,
							identity: instanceIdentity('p'),
						}) + logicalNode({ which: 'R', identity: instanceIdentity('r') }),
					catalogues: ['A', 'B', 'IED'],
					functionIdentity: instanceOfTemplate,
				}),
				scenario: 'template',
				boundLogicalNodeTypes: 'keep',
				expectedTypes: {
					LNodeType: ['LLN0_IED', 'PTOC_A', 'PTOC_IED', 'PTRC_B'],
					DOType: ['ACT_A', 'ACT_B'],
					DAType: ['ORG_A'],
					EnumType: ['CAT_A'],
				},
			},

		'fork, the newer revision of the file drops a logical node: its type and the data types only it names are gone':
			{
				sourceXml: sourceXml({
					logicalNodes: logicalNode({ which: 'R', identity: revisionIdentity('r') }),
					catalogues: ['B'],
					functionUuid: 'function-instance-uuid',
				}),
				targetXml: projectXml({
					logicalNodes:
						logicalNode({ which: 'P', identity: revisionIdentity('p') }) +
						logicalNode({ which: 'R', identity: revisionIdentity('r') }),
					catalogues: ['A', 'B', 'IED'],
					functionIdentity: instanceOfRevision,
				}),
				baseXml: sourceXml({
					logicalNodes:
						logicalNode({ which: 'P', identity: revisionIdentity('p') }) +
						logicalNode({ which: 'R', identity: revisionIdentity('r') }),
					catalogues: ['A', 'B'],
					functionUuid: 'function-instance-uuid',
				}),
				scenario: 'fork',
				expectedTypes: {
					LNodeType: ['LLN0_IED', 'PTOC_IED', 'PTRC_B'],
					DOType: ['ACT_B'],
					DAType: [],
					EnumType: [],
				},
			},
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const base = testCase.baseXml
			? await openSclDocument({ project, xml: testCase.baseXml, label: 'previous revision' })
			: undefined
		const common = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>,
			anchor: { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>,
		}
		const lifecycleTarget: LifecycleTarget =
			testCase.scenario === 'fork'
				? { ...common, scenario: 'fork', ...(base ? { baseQuery: base.query } : {}) }
				: { ...common, scenario: testCase.scenario }
		const lifecycleReport = await report(target.query, {
			...lifecycleTarget,
			resolution: { boundLogicalNodeTypes: testCase.boundLogicalNodeTypes },
		})
		await target.transaction(async function applyTheUpdate(tx) {
			// every decision accepted
			await apply(tx, {
				...lifecycleTarget,
				report: lifecycleReport,
				resolution: { decisions: new Map() },
			})
		})

		const typeIds = await typeIdsOf(target.query)
		expect(typeIds, 'the types the project holds').toEqual(testCase.expectedTypes)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

/** The ids of the types a document holds, per tag, sorted. */
async function typeIdsOf(query: Core.Query<Config>): Promise<TypeIds> {
	async function idsOf(tagName: keyof TypeIds): Promise<string[]> {
		const records = await query.getRecordsByTagName(tagName)
		return records.map((record) => readAttribute({ record, name: 'id', defaults: 'none' })).sort()
	}
	return {
		LNodeType: await idsOf('LNodeType'),
		DOType: await idsOf('DOType'),
		DAType: await idsOf('DAType'),
		EnumType: await idsOf('EnumType'),
	}
}
