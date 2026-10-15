import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// An LNode names the logical node that implements it, and that logical node must be in the
// document. What a template brings keeps the binding it had in the template; where the project
// does not hold that logical node, what the apply wrote is released.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The device P1 of the template, holding Q0XCBR2 (uuid `source-ln-uuid`) and its trip input. */
const device = /* xml */ `
	<IED name="P1">
		<AccessPoint name="AP1">
			<Server>
				<LDevice inst="LD0">
					<LN prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="source-ln-uuid">
						<Inputs>
							<ExtRef intAddr="Trip.general" uuid="source-ext-ref-uuid"/>
						</Inputs>
					</LN>
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
		<DOType id="DPC_T" cdc="DPC">
			<DA name="stVal" bType="Dbpos" fc="ST"/>
		</DOType>
	</DataTypeTemplates>
`

/** The breaker LNode of the template, specified XCBR1, bound to P1's Q0XCBR2. */
const boundBreaker = /* xml */ `
	<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" lnType="XCBR_T" lnUuid="source-ln-uuid" uuid="lnode-src-uuid">
		<Private type="eIEC61850-6-100">
			<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
		</Private>
	</LNode>
`

/** A template holding the function F1 (with `functionContent`) in the bay Q01 (with `bayContent`). */
function templateXml(params: { functionContent: string; bayContent?: string }): string {
	const { functionContent, bayContent = '' } = params
	return /* xml */ `
		<SCL ${ns}>
			<Header id="template" uuid="template-uuid"/>
			${device}
			<Substation name="TEMPLATE">
				<VoltageLevel name="TEMPLATE">
					<Bay ${id}="bay-s" name="Q01" uuid="bay-src-uuid">
						${bayContent}
						<Function ${id}="function-s" name="F1" uuid="function-src-uuid">
							${functionContent}
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			${types}
		</SCL>
	`
}

/** The project: S1 / V1 / B1, the bay holding `bayContent`, and `beside` next to the substation. */
function projectXml(params: { bayContent?: string; beside?: string } = {}): string {
	const { bayContent = '', beside = '' } = params
	return /* xml */ `
		<SCL ${ns}>
			<Header id="project" uuid="project-uuid"/>
			${beside}
			<Substation name="S1">
				<VoltageLevel ${id}="voltage-level" name="V1">
					<Bay ${id}="bay" name="B1">
						${bayContent}
					</Bay>
				</VoltageLevel>
			</Substation>
			${types}
		</SCL>
	`
}

/** The project's instance of F1: its breaker (`binding`, by default assigned to no IED) specified XCBR1. */
function instanceOfF1(params: { binding?: string } = {}): string {
	const { binding = 'iedName="None" lnClass="XCBR" lnInst="1"' } = params
	return /* xml */ `
		<Function name="F1" uuid="function-instance-uuid" templateUuid="function-src-uuid">
			<LNode ${binding} lnType="XCBR_T" uuid="lnode-instance-uuid" templateUuid="lnode-src-uuid">
				<Private type="eIEC61850-6-100">
					<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
				</Private>
			</LNode>
		</Function>
	`
}

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	verb: 'fsd' | 'ssd'
	ref: Scl.Ref<'Function'> | Scl.Ref<'Bay'>
	anchor: Scl.Ref<'Bay'> | Scl.Ref<'VoltageLevel'>
	scenario?: LifecycleScenario
}

const functionSource = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const baySource = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
const projectBay = { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>
const projectVoltageLevel = {
	tagName: 'VoltageLevel',
	id: 'voltage-level',
} as Scl.Ref<'VoltageLevel'>

const releasedBreaker =
	'//default:Function[@name="F1"]/default:LNode[@iedName="None"][@lnClass="XCBR"][@lnInst="1"][not(@prefix)][not(@ldInst)][not(@lnUuid)]'

describe('lifecycle — what an apply writes bound to a logical node the project lacks', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'bay typical whose LNode is bound to its device, project without it -> placed assigned to no IED':
			{
				sourceXml: templateXml({ functionContent: boundBreaker }),
				targetXml: projectXml(),
				verb: 'ssd',
				ref: baySource,
				anchor: projectVoltageLevel,
				expectedQueries: [
					`//default:Bay[@name="Q01"]${releasedBreaker}`,
					`//default:Bay[@name="Q01"]${releasedBreaker}/default:Private/v2019C1:LNodeSpecNaming[@sLnClass="XCBR"][@sLnInst="1"]`,
				],
				unexpectedQueries: ['//default:LNode[@iedName="P1"]', '//default:LNode[@lnUuid]'],
			},

		'function whose LNode is bound to its device, project without it -> placed assigned to no IED':
			{
				sourceXml: templateXml({ functionContent: boundBreaker }),
				targetXml: projectXml(),
				verb: 'fsd',
				ref: functionSource,
				anchor: projectBay,
				expectedQueries: [`//default:Bay[@name="B1"]${releasedBreaker}`],
				unexpectedQueries: ['//default:LNode[@iedName="P1"]'],
			},

		'function placed from above its bay, the bay holding an LNode bound to the device -> the bay created, its LNode assigned to no IED':
			{
				sourceXml: templateXml({
					functionContent: '',
					bayContent: /* xml */ `
						<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" lnType="XCBR_T" lnUuid="source-ln-uuid" uuid="bay-lnode-src-uuid">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
							</Private>
						</LNode>
					`,
				}),
				targetXml: /* xml */ `
					<SCL ${ns}>
						<Header id="project" uuid="project-uuid"/>
						<Substation name="S1">
							<VoltageLevel ${id}="voltage-level" name="V1">
								<!-- no bay: the template's is created -->
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				verb: 'fsd',
				ref: functionSource,
				anchor: projectVoltageLevel,
				expectedQueries: [
					'//default:VoltageLevel[@name="V1"]/default:Bay[@name="Q01"]/default:LNode[@iedName="None"][@lnClass="XCBR"][@lnInst="1"][not(@lnUuid)]',
				],
				unexpectedQueries: ['//default:LNode[@iedName="P1"]'],
			},

		'unbound LNode whose input names an ExtRef of the device, project without it -> placed without that name':
			{
				sourceXml: templateXml({
					functionContent: /* xml */ `
						<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="ptrc-src-uuid">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="PTRC" sLnInst="1"/>
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="Trip" extRefAddr="P1/LD0/Q0XCBR2.Trip.general" extRefUuid="source-ext-ref-uuid"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					`,
				}),
				targetXml: projectXml(),
				verb: 'fsd',
				ref: functionSource,
				anchor: projectBay,
				expectedQueries: [
					'//default:Function[@name="F1"]/default:LNode[@iedName="None"][@lnClass="PTRC"]',
					'//v2019C1:SourceRef[@input="Trip"][not(@extRefAddr)][not(@extRefUuid)]',
				],
			},

		'newer template adding a bound LNode to a function the project holds -> added assigned to no IED':
			{
				sourceXml: templateXml({
					functionContent: /* xml */ `
						<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="lnode-src-uuid">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
							</Private>
						</LNode>
						<LNode iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="source-ln-uuid" uuid="added-lnode-src-uuid"/>
					`,
				}),
				targetXml: projectXml({ bayContent: instanceOfF1() }),
				verb: 'fsd',
				ref: functionSource,
				anchor: projectBay,
				scenario: 'template',
				expectedQueries: [
					'//default:Function[@name="F1"]/default:LNode[@iedName="None"][@lnClass="PTRC"][not(@lnUuid)][@templateUuid="added-lnode-src-uuid"]',
				],
				unexpectedQueries: ['//default:LNode[@iedName="P1"]'],
			},

		'newer template binding an LNode the project holds unbound -> left assigned to no IED': {
			sourceXml: templateXml({ functionContent: boundBreaker }),
			targetXml: projectXml({ bayContent: instanceOfF1() }),
			verb: 'fsd',
			ref: functionSource,
			anchor: projectBay,
			scenario: 'template',
			expectedQueries: [releasedBreaker],
			unexpectedQueries: ['//default:LNode[@iedName="P1"]', '//default:LNode[@lnUuid]'],
		},

		'newer template adding an input naming its device to an LNode the project holds -> the input added without that name':
			{
				sourceXml: templateXml({
					functionContent: /* xml */ `
						<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="lnode-src-uuid">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="Trip" extRefAddr="P1/LD0/Q0XCBR2.Trip.general" extRefUuid="source-ext-ref-uuid" uuid="source-ref-src-uuid"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					`,
				}),
				targetXml: projectXml({ bayContent: instanceOfF1() }),
				verb: 'fsd',
				ref: functionSource,
				anchor: projectBay,
				scenario: 'template',
				expectedQueries: ['//v2019C1:SourceRef[@input="Trip"][not(@extRefAddr)][not(@extRefUuid)]'],
			},

		'newer template adding an input to an LNode the project holds bound to a logical node it lacks -> its binding left as it is':
			{
				sourceXml: templateXml({
					functionContent: /* xml */ `
						<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="lnode-src-uuid">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="Trip" uuid="source-ref-src-uuid"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					`,
				}),
				targetXml: projectXml({
					bayContent: instanceOfF1({
						// bound by its naming: an update would also remove an lnUuid the template does not carry
						binding: 'iedName="P9" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2"',
					}),
				}),
				verb: 'fsd',
				ref: functionSource,
				anchor: projectBay,
				scenario: 'template',
				expectedQueries: [
					'//default:Function[@name="F1"]/default:LNode[@iedName="P9"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"]',
					'//default:LNode[@iedName="P9"]//v2019C1:SourceRef[@input="Trip"]',
				],
			},

		'newer revision of the same file, project holding the logical node -> the binding kept': {
			sourceXml: templateXml({ functionContent: boundBreaker }),
			targetXml: projectXml({
				beside: device,
				bayContent: /* xml */ `
					<Function name="F1" uuid="function-src-uuid">
						<!-- missing: the breaker LNode the newer revision adds -->
					</Function>
				`,
			}),
			verb: 'fsd',
			ref: functionSource,
			anchor: projectBay,
			scenario: 'fork',
			expectedQueries: [
				'//default:Function[@name="F1"]/default:LNode[@iedName="P1"][@ldInst="LD0"][@prefix="Q0"][@lnInst="2"][@lnUuid="source-ln-uuid"]',
			],
		},

		'project LNode already bound to a logical node it lacks -> left as it is, only what the apply wrote released':
			{
				sourceXml: templateXml({ functionContent: boundBreaker }),
				targetXml: projectXml({
					bayContent: /* xml */ `
						<Function name="Existing" uuid="existing-function-uuid">
							<LNode iedName="P9" ldInst="LD0" lnClass="PDIS" lnInst="1" lnUuid="gone-ln-uuid"/>
						</Function>
					`,
				}),
				verb: 'fsd',
				ref: functionSource,
				anchor: projectBay,
				expectedQueries: [
					'//default:Function[@name="Existing"]/default:LNode[@iedName="P9"][@lnUuid="gone-ln-uuid"]',
					releasedBreaker,
				],
			},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: testCase.verb,
			scenario: testCase.scenario ?? 'instantiate',
			sourceQuery: source.query,
			ref: testCase.ref,
			anchor: testCase.anchor,
		} as Parameters<typeof report>[1]
		const lifecycleReport = await report(target.query, lifecycleTarget)
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
