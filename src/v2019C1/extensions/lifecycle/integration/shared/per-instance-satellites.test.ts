import { reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// A variable or a behaviour description a template carries belongs to each instance it is placed as: one per
// instance, never mapped onto nor merged into an element of that name the project holds, told apart by its name
// where two land side by side. An update reads each instance's own one.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const variableRef = { tagName: 'Variable', id: 'variable-s' } as Scl.Ref<'Variable'>
const behaviourRef = {
	tagName: 'BehaviorDescription',
	id: 'behaviour-s',
} as Scl.Ref<'BehaviorDescription'>
const subFunctionRef = { tagName: 'SubFunction', id: 'trip-s' } as Scl.Ref<'SubFunction'>

/** The tags whose elements belong to the instance they apply to, and their references. */
const SATELLITE_TAGS = ['Variable', 'BehaviorDescription'] as const
const SATELLITE_NODE_TAGS = new Set<string>([...SATELLITE_TAGS, 'VariableApplyTo', 'InputVar'])

const dataTypeTemplates = /* xml */ `
	<DataTypeTemplates ${id}="templates-s">
		<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnode-type-s">
			<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
		</LNodeType>
		<DOType id="DPC_Type" cdc="DPC" ${id}="do-type-s">
			<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
		</DOType>
	</DataTypeTemplates>
`

const satellitesPrivate = /* xml */ `
	<Private type="eIEC61850-6-100" ${id}="private-s">
		<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-source-uuid" ${id}="variable-s">
			<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="function-source-uuid" ${id}="variable-apply-to-s"/>
		</eIEC61850-6-100:Variable>
		<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="behaviour-source-uuid" ${id}="behaviour-s">
			<eIEC61850-6-100:InputVar varName="in1" dataName="TEMPLATE/Prot/CSWI1" lnodeUuid="lnode-source-uuid" doName="Pos" ${id}="input-s"/>
		</eIEC61850-6-100:BehaviorDescription>
	</Private>
`

const templateFunction = /* xml */ `
	<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
		<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-source-uuid" ${id}="lnode-s"/>
	</Function>
`

// A function library file whose variable and behaviour description sit on its substation.
const substationSatellitesXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			${satellitesPrivate}
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					${templateFunction}
				</Bay>
			</VoltageLevel>
		</Substation>
		${dataTypeTemplates}
	</SCL>
`

// The same file, its variable and behaviour description on the bay of the function.
const baySatellitesXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					${satellitesPrivate}
					${templateFunction}
				</Bay>
			</VoltageLevel>
		</Substation>
		${dataTypeTemplates}
	</SCL>
`

// The substation file without its behaviour description.
const substationVariableXml = substationSatellitesXml.replace(
	/<eIEC61850-6-100:BehaviorDescription [\s\S]*?<\/eIEC61850-6-100:BehaviorDescription>/,
	'',
)

// An application file composing the function, whose variable applies to the application.
const applicationXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="CB_App" type="Interface" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="function-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:Variable name="VAPP" uuid="application-variable-source-uuid" ${id}="application-variable-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/CB_App" elementUuid="application-source-uuid" ${id}="application-variable-apply-to-s"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					${templateFunction}
				</Bay>
			</VoltageLevel>
		</Substation>
		${dataTypeTemplates}
	</SCL>
`

const projectTypes = /* xml */ `
	<DataTypeTemplates ${id}="templates-t">
		<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnode-type-t">
			<DO name="Pos" type="DPC_Type" ${id}="do-t"/>
		</LNodeType>
		<DOType id="DPC_Type" cdc="DPC" ${id}="do-type-t">
			<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
		</DOType>
	</DataTypeTemplates>
`

// A project of two bays.
const twoBaysXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-b1"/>
				<Bay name="B2" ${id}="bay-b2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project whose function G, in the second bay, has a variable and a behaviour description of the template's names.
const namesakesXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-b1"/>
				<Bay name="B2" ${id}="bay-b2">
					<Private type="eIEC61850-6-100" ${id}="bay-b2-private">
						<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-g-uuid" ${id}="variable-g">
							<eIEC61850-6-100:VariableApplyTo element="S1/V1/B2/G" elementUuid="function-g-uuid" ${id}="variable-apply-to-g"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="behaviour-g-uuid" ${id}="behaviour-g">
							<eIEC61850-6-100:InputVar varName="in1" dataName="S1/V1/B2/G/CSWI1" lnodeUuid="lnode-g-uuid" doName="Pos" ${id}="input-g"/>
						</eIEC61850-6-100:BehaviorDescription>
					</Private>
					<Function name="G" uuid="function-g-uuid" ${id}="function-g">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-g-uuid" ${id}="lnode-g"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		${projectTypes}
	</SCL>
`

const instanceFunctions = /* xml */ `
	<Bay name="B1" ${id}="bay-b1">
		<Function name="Prot" uuid="prot-1-uuid" templateUuid="function-source-uuid" ${id}="prot-1">
			<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-1-uuid" templateUuid="lnode-source-uuid" ${id}="lnode-1"/>
		</Function>
		<Function name="Local" uuid="local-uuid" ${id}="local"/>
	</Bay>
	<Bay name="B2" ${id}="bay-b2">
		<Function name="Prot" uuid="prot-2-uuid" templateUuid="function-source-uuid" ${id}="prot-2">
			<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-2-uuid" templateUuid="lnode-source-uuid" ${id}="lnode-2"/>
		</Function>
	</Bay>
`

// A project an earlier version wrote: one variable made from the template's, applying to both instances.
const mergedEarlierXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-merged-uuid" templateUuid="variable-source-uuid" ${id}="variable-merged">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="prot-1-uuid" ${id}="apply-to-1"/>
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B2/Prot" elementUuid="prot-2-uuid" ${id}="apply-to-2"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				${instanceFunctions}
			</VoltageLevel>
		</Substation>
		${projectTypes}
	</SCL>
`

// A function library file whose variable applies to a subfunction of its function only.
const subFunctionVariableXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Variable name="VTRIP" uuid="variable-source-uuid" ${id}="variable-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot/Trip" elementUuid="trip-source-uuid" ${id}="variable-apply-to-s"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
						<SubFunction name="Trip" uuid="trip-source-uuid" ${id}="trip-s"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project an earlier version wrote: the template's variable mapped onto the project's of its name, which applies
// to the instance only.
const mappedOnlyForInstanceXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:Variable name="VXCBR" desc="Project breaker variable" uuid="variable-project-uuid" ${id}="variable-project">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="prot-1-uuid" ${id}="apply-to-1"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				${instanceFunctions}
			</VoltageLevel>
		</Substation>
		${projectTypes}
	</SCL>
`

// A project an earlier version wrote: the template's behaviour description mapped onto the project's of its name.
const behaviourMappedByNameEarlierXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:BehaviorDescription name="BD1" desc="Project behaviour" uuid="behaviour-project-uuid" ${id}="behaviour-project">
					<eIEC61850-6-100:InputVar varName="local" dataName="S1/V1/B1/Local/CSWI1" lnodeUuid="local-lnode-uuid" doName="Pos" ${id}="input-local"/>
					<eIEC61850-6-100:InputVar varName="in1" dataName="S1/V1/B1/Prot/CSWI1" lnodeUuid="lnode-1-uuid" doName="Pos" ${id}="input-1"/>
				</eIEC61850-6-100:BehaviorDescription>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-b1">
					<Function name="Prot" uuid="prot-1-uuid" templateUuid="function-source-uuid" ${id}="prot-1">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-1-uuid" templateUuid="lnode-source-uuid" ${id}="lnode-1"/>
					</Function>
					<Function name="Local" uuid="local-uuid" ${id}="local">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="local-lnode-uuid" ${id}="local-lnode"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		${projectTypes}
	</SCL>
`

// The substation file, its variable applying to the function's logical node, which its behaviour description documents.
const logicalNodeSatellitesXml = substationSatellitesXml.replace(
	'element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="function-source-uuid"',
	'element="TEMPLATE/TEMPLATE/TEMPLATE/Prot/CSWI1" elementUuid="lnode-source-uuid"',
)

// A project an earlier version wrote: the template's variable and behaviour description mapped onto the project's of
// their names, both naming the instance's logical node.
const bothMappedByNameEarlierXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-project-uuid" ${id}="variable-project">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot/CSWI1" elementUuid="lnode-1-uuid" ${id}="apply-to-lnode"/>
				</eIEC61850-6-100:Variable>
				<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="behaviour-project-uuid" ${id}="behaviour-project">
					<eIEC61850-6-100:InputVar varName="in1" dataName="S1/V1/B1/Prot/CSWI1" lnodeUuid="lnode-1-uuid" doName="Pos" ${id}="input-1"/>
				</eIEC61850-6-100:BehaviorDescription>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				${instanceFunctions}
			</VoltageLevel>
		</Substation>
		${projectTypes}
	</SCL>
`

// A project of the template's instance whose own variable of the template variable's name applies to the instance's
// logical node and to a function of its own: nothing of what the template's variable applies to.
const ownNamesakeXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:Variable name="VXCBR" desc="Project variable" uuid="variable-project-uuid" ${id}="variable-project">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Local" elementUuid="local-uuid" ${id}="apply-to-local"/>
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot/CSWI1" elementUuid="lnode-1-uuid" ${id}="apply-to-lnode"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				${instanceFunctions}
			</VoltageLevel>
		</Substation>
		${projectTypes}
	</SCL>
`

// A project an earlier version wrote: the template's variable mapped onto the project's of its name.
const mappedByNameEarlierXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:Variable name="VXCBR" desc="Project breaker variable" uuid="variable-project-uuid" ${id}="variable-project">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Local" elementUuid="local-uuid" ${id}="apply-to-local"/>
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="prot-1-uuid" ${id}="apply-to-1"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				${instanceFunctions}
			</VoltageLevel>
		</Substation>
		${projectTypes}
	</SCL>
`

/** What a case does, in order: place the template under a bay, change the template, update the instance of a bay. */
type Operation =
	| { place: string }
	| { revise: Scl.Ref<Scl.ElementsOf>; attributes: Record<string, string> }
	| { template: (tx: Core.Transaction<Config>) => Promise<void> }
	| { drop: Scl.Ref<Scl.ElementsOf> }
	| { update: string; withoutDecisions?: true }

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	verb?: 'fsd' | 'asd'
	operations: Operation[]
	/** A choice the consumer sends with the first placement. */
	chosen?: [string, DecisionMapping]
	expected: {
		/** Every variable and behaviour description of the project: `<tag> <name> [desc] @<level>: <what it applies to>`. */
		held?: string[]
		/** What the last report lists of them and their references, as `<change> <tag>`. */
		listed?: string[]
		/** What the last report's groups say their removals do outside them, as `<effect> <tag>`. */
		sideEffects?: string[]
		/** A fragment of the refusal of the first report; nothing else is checked. */
		rejection?: string
	}
}

describe('lifecycle — a variable or a behaviour description belongs to its instance', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a project function in another bay has a variable and a behaviour description of those names → the placed function gets its own, the project ones keep their single reference':
			{
				sourceXml: substationSatellitesXml,
				targetXml: namesakesXml,
				operations: [{ place: 'bay-b1' }],
				expected: {
					held: [
						'BehaviorDescription BD1 @B2: B2/G/CSWI1',
						'BehaviorDescription BD1 @S1: B1/Prot/CSWI1',
						'Variable VXCBR @B2: B2/G',
						'Variable VXCBR @S1: B1/Prot',
					],
					listed: [
						'added BehaviorDescription',
						'added InputVar',
						'added Variable',
						'added VariableApplyTo',
					],
				},
			},
		'placed in two bays, the template holds them on its bay → one of each in each bay': {
			sourceXml: baySatellitesXml,
			targetXml: twoBaysXml,
			operations: [{ place: 'bay-b1' }, { place: 'bay-b2' }],
			expected: {
				held: [
					'BehaviorDescription BD1 @B1: B1/Prot/CSWI1',
					'BehaviorDescription BD1 @B2: B2/Prot/CSWI1',
					'Variable VXCBR @B1: B1/Prot',
					'Variable VXCBR @B2: B2/Prot',
				],
				listed: [
					'added BehaviorDescription',
					'added InputVar',
					'added Variable',
					'added VariableApplyTo',
				],
			},
		},
		'placed in two bays, the template holds them on its substation → two of each on the project substation, the second numbered':
			{
				sourceXml: substationSatellitesXml,
				targetXml: twoBaysXml,
				operations: [{ place: 'bay-b1' }, { place: 'bay-b2' }],
				expected: {
					held: [
						'BehaviorDescription BD1 @S1: B1/Prot/CSWI1',
						'BehaviorDescription BD1_1 @S1: B2/Prot/CSWI1',
						'Variable VXCBR @S1: B1/Prot',
						'Variable VXCBR_1 @S1: B2/Prot',
					],
				},
			},
		'placed in two bays, the template revises its variable, the first bay updated → only its variable follows':
			{
				sourceXml: baySatellitesXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ place: 'bay-b2' },
					{ revise: variableRef, attributes: { desc: 'revision 2' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: [
						'BehaviorDescription BD1 @B1: B1/Prot/CSWI1',
						'BehaviorDescription BD1 @B2: B2/Prot/CSWI1',
						'Variable VXCBR @B2: B2/Prot',
						'Variable VXCBR [revision 2] @B1: B1/Prot',
					],
					listed: ['modified Variable'],
				},
			},
		'placed in two bays, the template drops its variable, the first bay updated → its variable removed, the second bay keeps its own':
			{
				sourceXml: baySatellitesXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ place: 'bay-b2' },
					{ drop: variableRef },
					{ update: 'bay-b1' },
				],
				expected: {
					held: [
						'BehaviorDescription BD1 @B1: B1/Prot/CSWI1',
						'BehaviorDescription BD1 @B2: B2/Prot/CSWI1',
						'Variable VXCBR @B2: B2/Prot',
					],
					listed: ['removed Variable'],
				},
			},
		'an earlier version merged the variable of two instances, the first updated after a revision of its function → read as it is: nothing listed of it, both applications kept':
			{
				sourceXml: substationVariableXml,
				targetXml: mergedEarlierXml,
				operations: [
					{ revise: functionRef, attributes: { desc: 'revision 2' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: ['Variable VXCBR @S1: B1/Prot, B2/Prot'],
					listed: [],
				},
			},
		'an earlier version gave the instance the project variable of that name → the update keeps it as the instance own, adds none':
			{
				sourceXml: substationVariableXml,
				targetXml: mappedByNameEarlierXml,
				operations: [
					{ revise: functionRef, attributes: { desc: 'revision 2' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: ['Variable VXCBR [Project breaker variable] @S1: B1/Local, B1/Prot'],
					listed: [],
				},
			},
		'an earlier version gave the instance the project variable of that name, the template drops it → the project variable stays, without what the instance gave it':
			{
				sourceXml: substationVariableXml,
				targetXml: mappedByNameEarlierXml,
				operations: [{ drop: variableRef }, { update: 'bay-b1' }],
				expected: {
					held: ['Variable VXCBR [Project breaker variable] @S1: B1/Local'],
					listed: ['removed VariableApplyTo'],
				},
			},
		'an earlier version gave the instance the project variable of that name, which applies to nothing else, the template drops it → only what the instance gave it is listed; the variable, left applying to nothing, goes at the commit':
			{
				sourceXml: substationVariableXml,
				targetXml: mappedOnlyForInstanceXml,
				operations: [{ drop: variableRef }, { update: 'bay-b1' }],
				expected: {
					held: [],
					listed: ['removed VariableApplyTo'],
					// the variable left applying to nothing, and the wrapper it leaves empty
					sideEffects: ['deleted Private', 'deleted Variable'],
				},
			},
		'an earlier version gave the instance the project variable of that name, nothing changed since, the update applied without decisions → as it was':
			{
				sourceXml: substationVariableXml,
				targetXml: mappedByNameEarlierXml,
				operations: [{ update: 'bay-b1', withoutDecisions: true }],
				expected: {
					held: ['Variable VXCBR [Project breaker variable] @S1: B1/Local, B1/Prot'],
					listed: [],
				},
			},
		'the template drops a subfunction and the variable applying to it only, the instance updated → both removed, nothing left naming the subfunction':
			{
				sourceXml: subFunctionVariableXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ drop: variableRef },
					{ drop: subFunctionRef },
					{ update: 'bay-b1' },
				],
				expected: { held: [], listed: ['removed Variable'] },
			},
		'placed, then the template drops its behaviour description, the instance updated → its behaviour description removed':
			{
				sourceXml: baySatellitesXml,
				targetXml: twoBaysXml,
				operations: [{ place: 'bay-b1' }, { drop: behaviourRef }, { update: 'bay-b1' }],
				expected: {
					held: ['Variable VXCBR @B1: B1/Prot'],
					listed: ['removed BehaviorDescription'],
				},
			},
		'an earlier version gave the instance the project behaviour description of that name, the template drops it → it stays, without the input the instance gave it':
			{
				sourceXml: substationSatellitesXml,
				targetXml: behaviourMappedByNameEarlierXml,
				operations: [{ drop: behaviourRef }, { update: 'bay-b1' }],
				expected: {
					held: [
						'BehaviorDescription BD1 [Project behaviour] @S1: B1/Local/CSWI1',
						'Variable VXCBR @S1: B1/Prot',
					],
					listed: ['added Variable', 'added VariableApplyTo', 'removed InputVar'],
				},
			},
		'a project variable of the template variable name applies to the instance by other references → the instance gets the template one beside it; what the project variable applied to in the instance reads as given by an earlier placement, and goes':
			{
				sourceXml: substationVariableXml,
				targetXml: ownNamesakeXml,
				operations: [
					{ revise: functionRef, attributes: { desc: 'revision 2' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: [
						'Variable VXCBR [Project variable] @S1: B1/Local',
						'Variable VXCBR_1 @S1: B1/Prot',
					],
					listed: ['added Variable', 'added VariableApplyTo', 'removed VariableApplyTo'],
				},
			},
		'placed in two bays, the template gains a variable, each bay updated in turn → each instance gets its own, the second numbered':
			{
				sourceXml: substationVariableXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ place: 'bay-b2' },
					{ template: gainVariable },
					{ update: 'bay-b1' },
					{ update: 'bay-b2' },
				],
				expected: {
					held: [
						'Variable VNEW @S1: B1/Prot',
						'Variable VNEW_1 @S1: B2/Prot',
						'Variable VXCBR @S1: B1/Prot',
						'Variable VXCBR_1 @S1: B2/Prot',
					],
					listed: ['added Variable', 'added VariableApplyTo'],
				},
			},
		'an earlier version gave the instance a variable and a behaviour description naming the same logical node → each found as the one of its kind, nothing added':
			{
				sourceXml: logicalNodeSatellitesXml,
				targetXml: bothMappedByNameEarlierXml,
				operations: [
					{ revise: functionRef, attributes: { desc: 'revision 2' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: ['BehaviorDescription BD1 @S1: B1/Prot/CSWI1', 'Variable VXCBR @S1: B1/Prot/CSWI1'],
					listed: [],
				},
			},
		'a choice sent for the variable → refused: where it lands is not the consumer to choose': {
			sourceXml: substationSatellitesXml,
			targetXml: twoBaysXml,
			operations: [{ place: 'bay-b1' }],
			chosen: ['variable-s', { create: {} }],
			expected: { rejection: 'the report lists no shared element "variable-s"' },
		},
		'an application whose variable applies to it, placed in two bays → one per placement, the second numbered':
			{
				sourceXml: applicationXml,
				targetXml: twoBaysXml,
				verb: 'asd',
				operations: [{ place: 'bay-b1' }, { place: 'bay-b2' }],
				expected: {
					held: ['Variable VAPP @S1: CB_App', 'Variable VAPP_1 @S1: CB_App_1'],
				},
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const verb = testCase.verb ?? 'fsd'
		const ref = verb === 'fsd' ? functionRef : applicationRef

		function targetFor(params: {
			bay: string
			scenario: 'instantiate' | 'template'
		}): LifecycleTarget {
			return {
				verb,
				scenario: params.scenario,
				sourceQuery: source.query,
				ref,
				anchor: { tagName: 'Bay', id: params.bay } as Scl.Ref<'Bay'>,
			} as LifecycleTarget
		}

		if (testCase.expected.rejection) {
			const [place] = testCase.operations
			if (!place || !('place' in place)) throw new Error('a refused case starts with a placement')
			const refused = report(target.query, {
				...targetFor({ bay: place.place, scenario: 'instantiate' }),
				resolution: { mappings: new Map(testCase.chosen ? [testCase.chosen] : []) },
			})
			await expect(refused).rejects.toThrow(testCase.expected.rejection)
			return
		}

		let lastReport: DiffReport | undefined
		for (const operation of testCase.operations) {
			if ('place' in operation) {
				const placed = await reportAndApply({
					document: target,
					lifecycle: targetFor({ bay: operation.place, scenario: 'instantiate' }),
				})
				lastReport = placed.report
			} else if ('template' in operation) {
				await source.transaction(operation.template)
			} else if ('revise' in operation) {
				await source.transaction(async function revise(tx) {
					await tx.update(operation.revise, { attributes: operation.attributes })
				})
			} else if ('drop' in operation) {
				await source.transaction(async function drop(tx) {
					await tx.delete(operation.drop)
				})
			} else {
				const instance = await findInstanceIn(target.query, { bay: operation.update })
				const updated = await reportAndApply({
					document: target,
					lifecycle: {
						...targetFor({ bay: operation.update, scenario: 'template' }),
						targetInstance: instance,
					} as LifecycleTarget,
					withoutDecisions: operation.withoutDecisions,
				})
				lastReport = updated.report
			}
		}
		if (!lastReport) throw new Error('a case reports at least once')

		// they are the instance's, never the consumer's to map
		expect(
			lastReport.mappings.filter((mapping) =>
				(SATELLITE_TAGS as readonly string[]).includes(mapping.tagName),
			),
			'report',
		).toEqual([])
		if (testCase.expected.sideEffects) {
			const sideEffects = allGroups(lastReport).flatMap((group) =>
				(group.sideEffects ?? []).map((effect) => `${effect.effect} ${effect.element.tagName}`),
			)
			expect(sideEffects.sort(), 'report').toEqual(testCase.expected.sideEffects)
		}
		if (testCase.expected.listed) {
			expect(listSatelliteNodes(lastReport), 'report').toEqual(testCase.expected.listed)
		}
		const held = await describeSatellites(target.query)
		expect(held, 'apply').toEqual(testCase.expected.held)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The template gains a variable applying to its function, beside the one it holds. */
async function gainVariable(tx: Core.Transaction<Config>): Promise<void> {
	const held = await tx.any.getRecord(variableRef)
	if (!held?.parent) throw new Error('the template holds its variable')
	const variable = await tx.any.addChild(held.parent, {
		tagName: 'Variable',
		namespace: held.namespace,
		attributes: { name: 'VNEW', uuid: 'new-variable-source-uuid' },
	})
	await tx.any.addChild(variable, {
		tagName: 'VariableApplyTo',
		namespace: held.namespace,
		attributes: {
			element: 'TEMPLATE/TEMPLATE/TEMPLATE/Prot',
			elementUuid: 'function-source-uuid',
		},
	})
}

/** The template's function placed under a bay. */
async function findInstanceIn(
	query: Core.Query<Config>,
	params: { bay: string },
): Promise<Scl.Ref<'Function'>> {
	const { Function: functions = [] } = await query.findDescendants(
		{ tagName: 'Bay', id: params.bay } as Scl.Ref<'Bay'>,
		{ collect: 'Function' },
	)
	for (const candidate of functions) {
		const templateUuid = await query.getAttribute(candidate, { name: 'templateUuid' })
		if (templateUuid === 'function-source-uuid') return { tagName: 'Function', id: candidate.id }
	}
	throw new Error(`no instance of the template in ${params.bay}`)
}

/** The satellite nodes of a report's groups and their references, as `<change> <tag>`, each node once. */
function listSatelliteNodes(lifecycleReport: DiffReport): string[] {
	const nodes = new Set<DiffNode>()
	function visit(node: DiffNode): void {
		nodes.add(node)
		for (const child of node.children) visit(child)
	}
	for (const group of allGroups(lifecycleReport)) {
		for (const node of [group.primary, ...group.companions]) visit(node)
	}
	const listed = new Set<string>()
	for (const node of nodes) {
		if (node.change === 'unchanged' || !SATELLITE_NODE_TAGS.has(node.tagName)) continue
		listed.add(`${node.change} ${node.tagName}`)
	}
	return [...listed].sort()
}

/** Every variable and behaviour description of a project, with the level holding it and what it applies to. */
async function describeSatellites(query: Core.Query<Config>): Promise<string[]> {
	const described: string[] = []
	for (const tagName of SATELLITE_TAGS) {
		for (const satellite of await query.getRecordsByTagName(tagName)) {
			const { name, desc } = await query.any.getAttributes(satellite)
			const [, level] = await query.any.findAncestors(satellite)
			const levelName = level ? await query.any.getAttribute(level, { name: 'name' }) : undefined
			const targets: string[] = []
			const tree = await query.any.getTree(satellite)
			for (const reference of tree?.tree ?? []) {
				const { elementUuid, lnodeUuid } = await query.any.getAttributes(reference)
				const described = await describeElement(query, elementUuid ?? lnodeUuid)
				targets.push(described)
			}
			const description = desc ? ` [${desc}]` : ''
			described.push(`${tagName} ${name}${description} @${levelName}: ${targets.sort().join(', ')}`)
		}
	}
	return described.sort()
}

/** The tags whose names place an element in its bay. */
const BAY_PATH_TAGS = new Set(['Bay', 'Function'])

/** An element named by its uuid, as the bay-relative path of its names (a logical node by its class and instance). */
async function describeElement(
	query: Core.Query<Config>,
	uuid: string | undefined,
): Promise<string> {
	for (const tagName of ['Application', 'Function', 'LNode'] as const) {
		const [element] = await query.findByAttributes({ tagName, attributes: { uuid: uuid ?? '' } })
		if (!element) continue
		const { name, lnClass, lnInst } = await query.any.getAttributes(element)
		const names = [name ?? `${lnClass}${lnInst}`]
		for (const ancestor of await query.any.findAncestors(element)) {
			if (!BAY_PATH_TAGS.has(ancestor.tagName)) continue
			const ancestorName = await query.any.getAttribute(ancestor, { name: 'name' })
			names.unshift(ancestorName ?? '')
		}
		return names.join('/')
	}
	return `nothing (${uuid})`
}
