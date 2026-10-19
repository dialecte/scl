import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DiffNode,
	KeptAttributeChange,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// A bound LNode carries two things: where the project implemented it (its IED, logical device and logical node,
// `lnUuid`) and what it was specified as (its `LNodeSpecNaming`, the template's naming). An update compares the
// template with the specification and writes it there; the implementation is the project's: never compared, never
// written. Its type stays as bound too, and the report lists a type change it keeps.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The device P1: Q0XCBR2 (uuid `ln-x`) and Q0XCBR5 (uuid `ln-y`). */
const device = /* xml */ `
	<IED name="P1">
		<AccessPoint name="AP1">
			<Server>
				<LDevice inst="LD0">
					<LN prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="ln-x"/>
					<LN prefix="Q0" lnClass="XCBR" inst="5" lnType="XCBR_T" uuid="ln-y"/>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
`

const types = /* xml */ `
	<DataTypeTemplates>
		<LNodeType id="XCBR_T" lnClass="XCBR">
			<DO name="Pos" type="DPC_T"/>
		</LNodeType>
		<LNodeType id="XCBR_T2" lnClass="XCBR">
			<DO name="Pos" type="DPC_T"/>
			<DO name="BlkOpn" type="DPC_T"/>
		</LNodeType>
		<DOType id="DPC_T" cdc="DPC">
			<DA name="stVal" bType="Dbpos" fc="ST"/>
		</DOType>
	</DataTypeTemplates>
`

/** The breaker LNode: `attributes` on it, specified as XCBR`specifiedInst`. */
function breaker(params: { attributes: string; specifiedInst: string }): string {
	const { attributes, specifiedInst } = params
	return /* xml */ `
		<LNode ${attributes}>
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="${specifiedInst}"/>
			</Private>
		</LNode>
	`
}

/** The template (or newer revision): F1 holding `lnode`, the device beside when `withDevice`. */
function sourceXml(params: { lnode: string; functionUuid?: string; withDevice?: boolean }): string {
	const { lnode, functionUuid = 'function-src-uuid', withDevice = false } = params
	return /* xml */ `
		<SCL ${ns}>
			<Header id="source" uuid="source-uuid"/>
			${withDevice ? device : ''}
			<Substation name="TEMPLATE">
				<VoltageLevel name="TEMPLATE">
					<Bay name="Q01">
						<Function ${id}="function-s" name="F1" uuid="${functionUuid}">
							${lnode}
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			${types}
		</SCL>
	`
}

/** The project: the device, and F1 (`functionIdentity`) holding `lnode` in the bay B1. */
function projectXml(params: { lnode: string; functionIdentity: string }): string {
	const { lnode, functionIdentity } = params
	return /* xml */ `
		<SCL ${ns}>
			<Header id="project" uuid="project-uuid"/>
			${device}
			<Substation name="S1">
				<VoltageLevel name="V1">
					<Bay ${id}="bay" name="B1">
						<Function name="F1" ${functionIdentity}>
							${lnode}
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			${types}
		</SCL>
	`
}

const instanceOfTemplate = 'uuid="function-instance-uuid" templateUuid="function-src-uuid"'
const boundToX =
	'iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" lnType="XCBR_T" lnUuid="ln-x" uuid="lnode-instance-uuid" templateUuid="lnode-src-uuid"'
const templateLNode = 'iedName="None" lnClass="XCBR" lnType="XCBR_T" uuid="lnode-src-uuid"'
const keptOnX =
	'//default:Function[@name="F1"]/default:LNode[@iedName="P1"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"][@lnUuid="ln-x"][@lnType="XCBR_T"]'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	scenario: LifecycleScenario
	/**
	 * The attributes the report lists as changed on the LNode, then on its LNodeSpecNaming, then the differences it
	 * lists as kept on the LNode (none when absent), also counted in the report's summary.
	 */
	reported: { lnode: string[]; specifiedNaming: string[]; kept?: KeptAttributeChange[] }
}

describe('lifecycle — an update keeps the implementation of a bound LNode', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'bound by lnUuid, newer template changing its description -> description written, binding kept':
			{
				sourceXml: sourceXml({
					lnode: breaker({
						attributes: `${templateLNode} lnInst="1" desc="Breaker"`,
						specifiedInst: '1',
					}),
				}),
				targetXml: projectXml({
					lnode: breaker({ attributes: boundToX, specifiedInst: '1' }),
					functionIdentity: instanceOfTemplate,
				}),
				scenario: 'template',
				reported: { lnode: ['desc'], specifiedNaming: [] },
				expectedQueries: [`${keptOnX}[@desc="Breaker"]`],
			},

		'bound, newer template specifying it XCBR3 -> its specification follows, binding kept': {
			sourceXml: sourceXml({
				lnode: breaker({ attributes: `${templateLNode} lnInst="3"`, specifiedInst: '3' }),
			}),
			targetXml: projectXml({
				lnode: breaker({ attributes: boundToX, specifiedInst: '1' }),
				functionIdentity: instanceOfTemplate,
			}),
			scenario: 'template',
			reported: { lnode: [], specifiedNaming: ['sLnInst'] },
			expectedQueries: [
				keptOnX,
				`${keptOnX}/default:Private/v2019C1:LNodeSpecNaming[@sLnClass="XCBR"][@sLnInst="3"]`,
			],
		},

		'bound, newer template changing its type -> type kept, listed as kept': {
			sourceXml: sourceXml({
				lnode: breaker({
					attributes:
						'iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T2" uuid="lnode-src-uuid"',
					specifiedInst: '1',
				}),
			}),
			targetXml: projectXml({
				lnode: breaker({ attributes: boundToX, specifiedInst: '1' }),
				functionIdentity: instanceOfTemplate,
			}),
			scenario: 'template',
			reported: {
				lnode: [],
				specifiedNaming: [],
				kept: [
					{ name: 'lnType', before: 'XCBR_T', after: 'XCBR_T2', reason: 'bound-logical-node' },
				],
			},
			expectedQueries: [keptOnX],
		},

		'bound, newer template changing its description and its type -> description written, type kept, listed as kept':
			{
				sourceXml: sourceXml({
					lnode: breaker({
						attributes:
							'iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T2" uuid="lnode-src-uuid" desc="Breaker"',
						specifiedInst: '1',
					}),
				}),
				targetXml: projectXml({
					lnode: breaker({ attributes: boundToX, specifiedInst: '1' }),
					functionIdentity: instanceOfTemplate,
				}),
				scenario: 'template',
				reported: {
					lnode: ['desc'],
					specifiedNaming: [],
					kept: [
						{ name: 'lnType', before: 'XCBR_T', after: 'XCBR_T2', reason: 'bound-logical-node' },
					],
				},
				expectedQueries: [`${keptOnX}[@desc="Breaker"]`],
			},

		'bound by its naming only, newer template changing its description -> binding kept': {
			sourceXml: sourceXml({
				lnode: breaker({
					attributes: `${templateLNode} lnInst="1" desc="Breaker"`,
					specifiedInst: '1',
				}),
			}),
			targetXml: projectXml({
				lnode: breaker({
					attributes:
						'iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" lnType="XCBR_T" uuid="lnode-instance-uuid" templateUuid="lnode-src-uuid"',
					specifiedInst: '1',
				}),
				functionIdentity: instanceOfTemplate,
			}),
			scenario: 'template',
			reported: { lnode: ['desc'], specifiedNaming: [] },
			expectedQueries: [
				'//default:Function[@name="F1"]/default:LNode[@iedName="P1"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"][@lnType="XCBR_T"][@desc="Breaker"]',
			],
			unexpectedQueries: ['//default:LNode[@lnUuid]'],
		},

		'unbound, newer template specifying it XCBR3 -> its naming and its specification follow': {
			sourceXml: sourceXml({
				lnode: breaker({ attributes: `${templateLNode} lnInst="3"`, specifiedInst: '3' }),
			}),
			targetXml: projectXml({
				lnode: breaker({
					attributes:
						'iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="lnode-instance-uuid" templateUuid="lnode-src-uuid"',
					specifiedInst: '1',
				}),
				functionIdentity: instanceOfTemplate,
			}),
			scenario: 'template',
			reported: { lnode: ['lnInst'], specifiedNaming: ['sLnInst'] },
			expectedQueries: [
				'//default:LNode[@iedName="None"][@lnClass="XCBR"][@lnInst="3"]/default:Private/v2019C1:LNodeSpecNaming[@sLnInst="3"]',
			],
		},

		'unbound, newer template changing its type -> its type follows': {
			sourceXml: sourceXml({
				lnode: breaker({
					attributes:
						'iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T2" uuid="lnode-src-uuid"',
					specifiedInst: '1',
				}),
			}),
			targetXml: projectXml({
				lnode: breaker({
					attributes:
						'iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="lnode-instance-uuid" templateUuid="lnode-src-uuid"',
					specifiedInst: '1',
				}),
				functionIdentity: instanceOfTemplate,
			}),
			scenario: 'template',
			reported: { lnode: ['lnType'], specifiedNaming: [] },
			expectedQueries: ['//default:LNode[@iedName="None"][@lnInst="1"][@lnType="XCBR_T2"]'],
		},

		'newer revision of the same file changing the type of a LNode bound here -> type kept, listed as kept':
			{
				sourceXml: sourceXml({
					lnode: breaker({
						attributes:
							'iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T2" uuid="lnode-instance-uuid"',
						specifiedInst: '1',
					}),
					functionUuid: 'function-instance-uuid',
				}),
				targetXml: projectXml({
					lnode: breaker({ attributes: boundToX, specifiedInst: '1' }),
					functionIdentity: 'uuid="function-instance-uuid"',
				}),
				scenario: 'fork',
				reported: {
					lnode: [],
					specifiedNaming: [],
					kept: [
						{ name: 'lnType', before: 'XCBR_T', after: 'XCBR_T2', reason: 'bound-logical-node' },
					],
				},
				expectedQueries: [keptOnX],
			},

		'newer revision of the same file, unbound there -> the binding made here kept': {
			sourceXml: sourceXml({
				lnode: breaker({
					attributes:
						'iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="lnode-instance-uuid" desc="Breaker"',
					specifiedInst: '1',
				}),
				functionUuid: 'function-instance-uuid',
			}),
			targetXml: projectXml({
				lnode: breaker({ attributes: boundToX, specifiedInst: '1' }),
				functionIdentity: 'uuid="function-instance-uuid"',
			}),
			scenario: 'fork',
			reported: { lnode: ['desc'], specifiedNaming: [] },
			expectedQueries: [`${keptOnX}[@desc="Breaker"]`],
		},

		'newer revision of the same file, bound there to another logical node -> the binding made here kept':
			{
				sourceXml: sourceXml({
					lnode: breaker({
						attributes:
							'iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="5" lnType="XCBR_T" lnUuid="ln-y" uuid="lnode-instance-uuid"',
						specifiedInst: '1',
					}),
					functionUuid: 'function-instance-uuid',
					withDevice: true,
				}),
				targetXml: projectXml({
					lnode: breaker({ attributes: boundToX, specifiedInst: '1' }),
					functionIdentity: 'uuid="function-instance-uuid"',
				}),
				scenario: 'fork',
				reported: { lnode: [], specifiedNaming: [] },
				expectedQueries: [keptOnX],
				unexpectedQueries: ['//default:LNode[@lnUuid="ln-y"]'],
			},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: 'fsd' as const,
			scenario: testCase.scenario,
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>,
			anchor: { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>,
		}
		const lifecycleReport = await report(target.query, lifecycleTarget)
		const nodes = lifecycleReport.instances.flatMap((instance) => flatten(instance.tree))
		expect(
			{
				lnode: changedAttributes({ nodes, tagName: 'LNode' }),
				specifiedNaming: changedAttributes({ nodes, tagName: 'LNodeSpecNaming' }),
				kept: keptChanges({ nodes, tagName: 'LNode' }),
				keptInSummary: lifecycleReport.summary.kept,
			},
			'report',
		).toEqual({
			kept: [],
			...testCase.reported,
			keptInSummary: (testCase.reported.kept ?? []).length,
		})

		await target.transaction(async (tx) => {
			// every decision accepted
			await apply(tx, {
				...lifecycleTarget,
				report: lifecycleReport,
				resolution: { decisions: new Map() },
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

function flatten(node: DiffNode): DiffNode[] {
	return [node, ...node.children.flatMap(flatten)]
}

/** The attribute names the report lists as changed on the nodes of `tagName`, sorted. */
function changedAttributes(params: { nodes: DiffNode[]; tagName: string }): string[] {
	const { nodes, tagName } = params
	return nodes
		.filter((node) => node.tagName === tagName)
		.flatMap((node) => (node.attributeChanges ?? []).map((change) => change.name))
		.sort()
}

/** The differences the report lists as kept on the nodes of `tagName`. */
function keptChanges(params: { nodes: DiffNode[]; tagName: string }): KeptAttributeChange[] {
	const { nodes, tagName } = params
	return nodes
		.filter((node) => node.tagName === tagName)
		.flatMap((node) => node.keptAttributeChanges ?? [])
}
