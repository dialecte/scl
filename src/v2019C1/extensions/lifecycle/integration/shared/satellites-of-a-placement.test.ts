import { describeSatellites, findByName, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { CROSS_CUTTING_SATELLITE_TAGS } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.constants'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DecisionMap,
	DiffNode,
	DiffReport,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// A variable or a behaviour description travels with the placement it applies to, or whose roles refer to it: placed
// once, applying only to what the placement places, and listed once, as written.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * An application composing two functions of a bay, a variable of the bay applying to both, one of the second applying
 * to the first; its engineering role refers to a variable applying to the bay and to the first function, and to a
 * behaviour description of a third function's logical node.
 */
function templateXml(params: { bay: string }): string {
	const { bay } = params
	const path = `TEMPLATE/TEMPLATE/${bay}`
	return /* xml */ `
		<SCL ${ns} ${id}="template">
			<Header id="template" uuid="template-file" version="0" revision="1" ${id}="template-header"/>
			<Substation name="TEMPLATE" ${id}="substation-s">
				<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
					<Bay name="${bay}" uuid="bay-source" ${id}="bay-s">
						<Private type="eIEC61850-6-100" ${id}="bay-private-s">
							<eIEC61850-6-100:Application name="P_App" uuid="application-source" ${id}="application-s">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="root-role-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="root-content-s">
										<eIEC61850-6-100:FunctionRef function="${path}/F1" functionUuid="f1-source" ${id}="f1-ref-s"/>
										<eIEC61850-6-100:FunctionRef function="${path}/F2" functionUuid="f2-source" ${id}="f2-ref-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
								<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="engineering-role-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="engineering-content-s">
										<eIEC61850-6-100:VariableRef variable="${path}/VROLE" variableUuid="vrole-source" ${id}="vrole-ref-s"/>
										<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="${path}/BDROLE" behaviorDescriptionUuid="bdrole-source" ${id}="bdrole-ref-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
							<eIEC61850-6-100:Variable name="VBOTH" value="1" uuid="vboth-source" ${id}="vboth-s">
								<eIEC61850-6-100:VariableApplyTo element="${path}/F1" elementUuid="f1-source" ${id}="vboth-f1-s"/>
								<eIEC61850-6-100:VariableApplyTo element="${path}/F2" elementUuid="f2-source" ${id}="vboth-f2-s"/>
							</eIEC61850-6-100:Variable>
							<eIEC61850-6-100:Variable name="VROLE" value="2" uuid="vrole-source" ${id}="vrole-s">
								<eIEC61850-6-100:VariableApplyTo element="${path}" elementUuid="bay-source" ${id}="vrole-bay-s"/>
								<eIEC61850-6-100:VariableApplyTo element="${path}/F1" elementUuid="f1-source" ${id}="vrole-f1-s"/>
							</eIEC61850-6-100:Variable>
							<eIEC61850-6-100:BehaviorDescription name="BDROLE" uuid="bdrole-source" ${id}="bdrole-s">
								<eIEC61850-6-100:InputVar varName="pos" dataName="${path}/F3/CSWI1" lnodeUuid="f3-lnode-source" doName="Pos" ${id}="bdrole-input-s"/>
							</eIEC61850-6-100:BehaviorDescription>
						</Private>
						<Function name="F1" uuid="f1-source" ${id}="f1-s"/>
						<Function name="F2" uuid="f2-source" ${id}="f2-s">
							<Private type="eIEC61850-6-100" ${id}="f2-private-s">
								<eIEC61850-6-100:Variable name="VIN_F2" value="3" uuid="vin-f2-source" ${id}="vin-f2-s">
									<eIEC61850-6-100:VariableApplyTo element="${path}/F1" elementUuid="f1-source" ${id}="vin-f2-f1-s"/>
								</eIEC61850-6-100:Variable>
							</Private>
						</Function>
						<Function name="F3" uuid="f3-source" ${id}="f3-s">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="f3-lnode-source" ${id}="f3-lnode-s"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

// A bay whose application composes a function of its voltage level, a variable of the level applying to that function.
const functionAboveXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Header id="template" uuid="template-file" version="0" revision="1" ${id}="template-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Private type="eIEC61850-6-100" ${id}="voltage-level-private-s">
					<eIEC61850-6-100:Variable name="VABOVE" value="4" uuid="vabove-source" ${id}="vabove-s">
						<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/LEVEL_F" elementUuid="level-f-source" ${id}="vabove-apply-s"/>
					</eIEC61850-6-100:Variable>
				</Private>
				<Bay name="B9" uuid="bay-source" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="P_App" uuid="application-source" ${id}="application-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="root-role-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="root-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/LEVEL_F" functionUuid="level-f-source" ${id}="level-f-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
				<Function name="LEVEL_F" uuid="level-f-source" ${id}="level-f-s"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A function template whose function holds a variable applying to itself.
const functionHoldingXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Header id="template" uuid="template-file" version="0" revision="1" ${id}="template-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="F_IN" uuid="f-in-source" ${id}="f-in-s">
						<Private type="eIEC61850-6-100" ${id}="f-in-private-s">
							<eIEC61850-6-100:Variable name="VIN" value="5" uuid="vin-source" ${id}="vin-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F_IN" elementUuid="f-in-source" ${id}="vin-apply-s"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A bay of two applications, the first one's role referring to a variable of the function only the second composes and
// to one of a function of the bay no application composes.
const laterFunctionsXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Header id="template" uuid="template-file" version="0" revision="1" ${id}="template-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="B9" uuid="bay-source" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="A1" uuid="a1-source" ${id}="a1-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="a1-root-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="a1-root-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/F1" functionUuid="f1-source" ${id}="a1-f1-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="a1-engineering-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="a1-engineering-content-s">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/F2/V_TWO" variableUuid="v-two-source" ${id}="v-two-ref-s"/>
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/F_ALONE/V_ALONE" variableUuid="v-alone-source" ${id}="v-alone-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Application name="A2" uuid="a2-source" ${id}="a2-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="a2-root-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="a2-root-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/F2" functionUuid="f2-source" ${id}="a2-f2-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="F1" uuid="f1-source" ${id}="f1-s"/>
					<Function name="F2" uuid="f2-source" ${id}="f2-s">
						<Private type="eIEC61850-6-100" ${id}="f2-private-s">
							<eIEC61850-6-100:Variable name="V_TWO" value="1" uuid="v-two-source" ${id}="v-two-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/F2" elementUuid="f2-source" ${id}="v-two-apply-s"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</Function>
					<Function name="F_ALONE" uuid="f-alone-source" ${id}="f-alone-s">
						<Private type="eIEC61850-6-100" ${id}="f-alone-private-s">
							<eIEC61850-6-100:Variable name="V_ALONE" value="2" uuid="v-alone-source" ${id}="v-alone-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/F_ALONE" elementUuid="f-alone-source" ${id}="v-alone-apply-s"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" uuid="project-bay-uuid" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project whose bay holds the behaviour description of the template's uuid: placed from it earlier.
const holdingTheLogicXml = projectXml.replace(
	`<Bay name="B1" uuid="project-bay-uuid" ${id}="project-bay"/>`,
	[
		`<Bay name="B1" uuid="project-bay-uuid" ${id}="project-bay">`,
		`<Private type="eIEC61850-6-100" ${id}="project-bay-private">`,
		`<eIEC61850-6-100:BehaviorDescription name="BDROLE" uuid="bdrole-source" ${id}="project-bdrole"/>`,
		`</Private>`,
		`</Bay>`,
	].join(''),
)

// The same, the bay holding too the variable the role refers to, applying to a function the application composes.
const holdingTheVariableXml = holdingTheLogicXml.replace(
	`<eIEC61850-6-100:BehaviorDescription name="BDROLE" uuid="bdrole-source" ${id}="project-bdrole"/>`,
	[
		`<eIEC61850-6-100:BehaviorDescription name="BDROLE" uuid="bdrole-source" ${id}="project-bdrole"/>`,
		`<eIEC61850-6-100:Variable name="VROLE" value="2" uuid="vrole-source" ${id}="project-vrole">`,
		`<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1" elementUuid="project-bay-uuid" ${id}="project-vrole-bay"/>`,
		`</eIEC61850-6-100:Variable>`,
	].join(''),
)

// A bay of a substation template whose application composes Prot, beside a function of its own (Alone); the bay holds
// a variable applying to each, which the application's role refers to.
const claimXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Header id="template" uuid="template-file" version="0" revision="1" ${id}="template-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="B9" uuid="bay-source" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="P_App" uuid="application-source" ${id}="application-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="root-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="root-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/Prot" functionUuid="prot-source" ${id}="prot-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="engineering-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="engineering-content-s">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VOUT" variableUuid="vout-source" ${id}="vout-ref-s"/>
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VX" variableUuid="vx-source" ${id}="vx-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="VOUT" value="1" uuid="vout-source" ${id}="vout-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/Prot" elementUuid="prot-source" ${id}="vout-prot-s"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:Variable name="VX" value="2" uuid="vx-source" ${id}="vx-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9/Alone" elementUuid="alone-source" ${id}="vx-alone-s"/>
						</eIEC61850-6-100:Variable>
					</Private>
					<Function name="Prot" uuid="prot-source" ${id}="prot-s"/>
					<Function name="Alone" uuid="alone-source" ${id}="alone-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A bay template whose two applications' roles refer to one variable of the bay applying to the bay.
const sharedBayVariableXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Header id="template" uuid="template-file" version="0" revision="1" ${id}="template-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="B9" uuid="bay-source" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="APP_A" uuid="a-source" ${id}="a-s">
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="a-engineering-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="a-engineering-content-s">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VBB" variableUuid="vbb-source" ${id}="a-vbb-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Application name="APP_B" uuid="b-source" ${id}="b-s">
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="b-engineering-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="b-engineering-content-s">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VBB" variableUuid="vbb-source" ${id}="b-vbb-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="VBB" value="3" uuid="vbb-source" ${id}="vbb-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9" elementUuid="bay-source" ${id}="vbb-bay-s"/>
						</eIEC61850-6-100:Variable>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project whose bay holds a behaviour description of its own.
const holdingOtherLogicXml = holdingTheLogicXml.replace(
	`name="BDROLE" uuid="bdrole-source"`,
	`name="OWN_LOGIC" uuid="own-logic-uuid"`,
)

type TestCase = SclTest.BaseXmlTestCase & {
	verb: 'asd' | 'ssd' | 'fsd'
	/** The operation placing it. Default `instantiate`. */
	scenario?: 'fork'
	targetXml: string
	/** The consumer leaves out every application the report lists. */
	skipsApplications?: true
	/** And every group depending on one of them. */
	skipsDependents?: true
	/** The consumer leaves out this application only (its source record id). */
	skipsApplication?: string
	expected: {
		/** What the report lists added of them: `<tag> <name>: <its references>`, one entry per node, sorted. */
		listed: string[]
		/** Every variable and behaviour description of the project: `<tag> <name> @<holder>: <what it applies to>`. */
		held: string[]
	}
}

describe('lifecycle — what travels with a placement is placed once, as listed', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the application placed → the variable applying to both functions once, what its role refers to applying to what it places or lands on':
			{
				sourceXml: templateXml({ bay: 'TEMPLATE' }),
				targetXml: projectXml,
				verb: 'asd',
				expected: {
					listed: [
						'BehaviorDescription BDROLE: 0 (Application P_App)',
						'Variable VBOTH: 2 (Function F1)',
						'Variable VIN_F2: 1 (Function F2)',
						'Variable VROLE: 2 (Function F1)',
					],
					held: [
						'BehaviorDescription BDROLE @B1: ',
						'Variable VBOTH @B1: B1/F1, B1/F2',
						'Variable VIN_F2 @F2: B1/F1',
						'Variable VROLE @B1: B1, B1/F1',
					],
				},
			},
		'the bay placed → the same, what the role refers to applying to the bay and the third function placed with it':
			{
				sourceXml: templateXml({ bay: 'B9' }),
				targetXml: projectXml,
				verb: 'ssd',
				expected: {
					listed: [
						'BehaviorDescription BDROLE: 1 (Function F3)',
						'Variable VBOTH: 2 (Function F1)',
						'Variable VIN_F2: 1 (Function F2)',
						'Variable VROLE: 2 (Function F1)',
					],
					held: [
						'BehaviorDescription BDROLE @B9: B9/F3/CSWI1',
						'Variable VBOTH @B9: B9/F1, B9/F2',
						'Variable VIN_F2 @F2: B9/F1',
						'Variable VROLE @B9: B9, B9/F1',
					],
				},
			},
		'a bay whose application composes a function of its level → the variable applying to that function placed with it':
			{
				sourceXml: functionAboveXml,
				targetXml: projectXml,
				verb: 'ssd',
				expected: {
					listed: ['Variable VABOVE: 1 (Function LEVEL_F)'],
					held: ['Variable VABOVE @V1: LEVEL_F'],
				},
			},
		'a bay whose application composing a function of its level is left out with what depends on it → that function placed on its own, with what applies to it':
			{
				sourceXml: functionAboveXml,
				targetXml: projectXml,
				verb: 'ssd',
				skipsApplications: true,
				skipsDependents: true,
				expected: {
					listed: ['Variable VABOVE: 1 (Function LEVEL_F)'],
					held: ['Variable VABOVE @V1: LEVEL_F'],
				},
			},
		"the bay placed, the application skipped, its role referring to variables applying to the bay's functions → each listed with its function and written":
			{
				sourceXml: claimXml,
				targetXml: projectXml,
				verb: 'ssd',
				skipsApplications: true,
				expected: {
					listed: ['Variable VOUT: 1 (Function Prot)', 'Variable VX: 1 (Function Alone)'],
					held: ['Variable VOUT @B9: B9/Prot', 'Variable VX @B9: B9/Alone'],
				},
			},
		"the bay placed, both applications' roles referring to a variable of the bay applying to it → listed with the bay, written once":
			{
				sourceXml: sharedBayVariableXml,
				targetXml: projectXml,
				verb: 'ssd',
				expected: {
					listed: ['Variable VBB: 1 (Bay B9)'],
					held: ['Variable VBB @B9: B9'],
				},
			},
		"the bay placed, the first application skipped, both applications' roles referring to a variable of the bay applying to it → the second placed, the variable written":
			{
				sourceXml: sharedBayVariableXml,
				targetXml: projectXml,
				verb: 'ssd',
				skipsApplication: 'a-s',
				expected: {
					listed: ['Variable VBB: 1 (Bay B9)'],
					held: ['Variable VBB @B9: B9'],
				},
			},
		"the bay placed, the second application skipped, both applications' roles referring to a variable of the bay applying to it → the first placed, the variable written":
			{
				sourceXml: sharedBayVariableXml,
				targetXml: projectXml,
				verb: 'ssd',
				skipsApplication: 'b-s',
				expected: {
					listed: ['Variable VBB: 1 (Bay B9)'],
					held: ['Variable VBB @B9: B9'],
				},
			},
		'the application forked into a project already holding what its role refers to → not listed, not placed again':
			{
				sourceXml: templateXml({ bay: 'TEMPLATE' }),
				targetXml: holdingTheLogicXml,
				verb: 'asd',
				scenario: 'fork',
				expected: {
					listed: [
						'Variable VBOTH: 2 (Function F1)',
						'Variable VIN_F2: 1 (Function F2)',
						'Variable VROLE: 2 (Function F1)',
					],
					held: [
						'BehaviorDescription BDROLE @B1: ',
						'Variable VBOTH @B1: B1/F1, B1/F2',
						'Variable VIN_F2 @F2: B1/F1',
						'Variable VROLE @B1: B1, B1/F1',
					],
				},
			},
		'the application forked into a project already holding the variable its role refers to, applying to a function it composes → not listed, not placed again':
			{
				sourceXml: templateXml({ bay: 'TEMPLATE' }),
				targetXml: holdingTheVariableXml,
				verb: 'asd',
				scenario: 'fork',
				expected: {
					listed: ['Variable VBOTH: 2 (Function F1)', 'Variable VIN_F2: 1 (Function F2)'],
					held: [
						'BehaviorDescription BDROLE @B1: ',
						'Variable VBOTH @B1: B1/F1, B1/F2',
						'Variable VIN_F2 @F2: B1/F1',
						'Variable VROLE @B1: B1',
					],
				},
			},
		'the application placed in a project holding a behaviour description of its own → what its role refers to placed beside it':
			{
				sourceXml: templateXml({ bay: 'TEMPLATE' }),
				targetXml: holdingOtherLogicXml,
				verb: 'asd',
				expected: {
					listed: [
						'BehaviorDescription BDROLE: 0 (Application P_App)',
						'Variable VBOTH: 2 (Function F1)',
						'Variable VIN_F2: 1 (Function F2)',
						'Variable VROLE: 2 (Function F1)',
					],
					held: [
						'BehaviorDescription BDROLE @B1: ',
						'BehaviorDescription OWN_LOGIC @B1: ',
						'Variable VBOTH @B1: B1/F1, B1/F2',
						'Variable VIN_F2 @F2: B1/F1',
						'Variable VROLE @B1: B1, B1/F1',
					],
				},
			},
		"the bay placed, the first application's role referring to what functions placed after it hold → each once, in its function":
			{
				sourceXml: laterFunctionsXml,
				targetXml: projectXml,
				verb: 'ssd',
				expected: {
					listed: ['Variable V_ALONE: 1 (Function F_ALONE)', 'Variable V_TWO: 1 (Function F2)'],
					held: ['Variable V_ALONE @F_ALONE: B9/F_ALONE', 'Variable V_TWO @F2: B9/F2'],
				},
			},
		'a function holding a variable applying to itself placed → the variable once, with the function':
			{
				sourceXml: functionHoldingXml,
				targetXml: projectXml,
				verb: 'fsd',
				expected: {
					listed: ['Variable VIN: 1 (Function F_IN)'],
					held: ['Variable VIN @F_IN: B1/F_IN'],
				},
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await placementOf({ verb: testCase.verb, sourceQuery: source.query })
		const { report } = await reportAndApply({
			document: target,
			lifecycle: {
				...lifecycle,
				scenario: testCase.scenario ?? 'instantiate',
				sourceQuery: source.query,
			} as LifecycleTarget,
			decide: decisionsOf(testCase),
		})
		expect(await listSatellites({ report, sourceQuery: source.query }), 'report').toEqual(
			testCase.expected.listed,
		)
		expect(await describeSatellites(target.query), 'apply').toEqual(testCase.expected.held)
		// a role's reference names the copy placed
		expect(await listUnplacedVariableReferences(target.query), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** What the consumer of a case leaves out. */
function decisionsOf(testCase: TestCase): ((listed: DiffReport) => DecisionMap) | undefined {
	const { skipsApplication } = testCase
	if (skipsApplication) {
		return function skipTheApplication(listed) {
			return new Map(
				allGroups(listed)
					.filter((group) => group.primary.sourceRef?.id === skipsApplication)
					.map((group) => [group.id, 'skip'] as const),
			)
		}
	}
	if (testCase.skipsDependents) return skipApplicationsWithDependents
	return testCase.skipsApplications ? skipApplications : undefined
}

/** The consumer leaves out every application group of a report. */
function skipApplications(listed: DiffReport): DecisionMap {
	return new Map(
		allGroups(listed)
			.filter((group) => group.primary.tagName === 'Application')
			.map((group) => [group.id, 'skip'] as const),
	)
}

/** The consumer leaves out every application group of a report, and every group depending on one of them. */
function skipApplicationsWithDependents(listed: DiffReport): DecisionMap {
	const skipped = skipApplications(listed)
	for (const group of allGroups(listed)) {
		const dependsOnSkipped = group.dependsOn.some(function isSkipped(dependency) {
			return skipped.has(dependency)
		})
		if (dependsOnSkipped) skipped.set(group.id, 'skip')
	}
	return skipped
}

/** What a case places, and where. */
async function placementOf(params: {
	verb: TestCase['verb']
	sourceQuery: Core.Query<Config>
}): Promise<Omit<LifecycleTarget, 'scenario' | 'sourceQuery'>> {
	const { verb, sourceQuery } = params
	const projectBay = { tagName: 'Bay', id: 'project-bay' }
	if (verb === 'asd') {
		const ref = await findByName(sourceQuery, { tagName: 'Application', name: 'P_App' })
		return { verb, ref, anchor: projectBay } as Omit<LifecycleTarget, 'scenario' | 'sourceQuery'>
	}
	if (verb === 'fsd') {
		const ref = await findByName(sourceQuery, { tagName: 'Function', name: 'F_IN' })
		return { verb, ref, anchor: projectBay } as Omit<LifecycleTarget, 'scenario' | 'sourceQuery'>
	}
	const ref = await findByName(sourceQuery, { tagName: 'Bay', name: 'B9' })
	const anchor = { tagName: 'VoltageLevel', id: 'project-voltage-level' }
	return { verb, ref, anchor } as Omit<LifecycleTarget, 'scenario' | 'sourceQuery'>
}

/**
 * What a report lists added of the variables and behaviour descriptions, one entry per node, with the primary of the
 * group listing it: `<tag> <name>: <its references> (<primary tag> <primary name>)`, sorted.
 */
async function listSatellites(params: {
	report: DiffReport
	sourceQuery: Core.Query<Config>
}): Promise<string[]> {
	const { report, sourceQuery } = params
	async function nameOf(node: DiffNode): Promise<string> {
		if (!node.sourceRef) return ''
		return (await sourceQuery.any.getAttribute(node.sourceRef, { name: 'name' })) ?? ''
	}
	const seen = new Set<DiffNode>()
	const listed: string[] = []
	for (const group of allGroups(report)) {
		const nodes: DiffNode[] = []
		function visit(node: DiffNode): void {
			if (seen.has(node)) return
			seen.add(node)
			nodes.push(node)
			for (const child of node.children) visit(child)
		}
		for (const node of [group.primary, ...group.companions]) visit(node)
		const primary = `${group.primary.tagName} ${await nameOf(group.primary)}`
		for (const node of nodes) {
			if (node.change !== 'added' || !CROSS_CUTTING_SATELLITE_TAGS.has(node.tagName)) continue
			const references = node.children.filter((child) => child.tagName in UUID_REFERENCE_PAIRS)
			listed.push(`${node.tagName} ${await nameOf(node)}: ${references.length} (${primary})`)
		}
	}
	return listed.sort()
}

/** The variables a role of a document refers to that the document does not hold, by the uuid named. */
async function listUnplacedVariableReferences(query: Core.Query<Config>): Promise<string[]> {
	const held = new Set<string>()
	for (const variable of await query.getRecordsByTagName('Variable')) {
		const uuid = await query.any.getAttribute(variable, { name: 'uuid' })
		held.add(uuid ?? '')
	}
	const unplaced: string[] = []
	for (const reference of await query.getRecordsByTagName('VariableRef')) {
		const uuid = (await query.any.getAttribute(reference, { name: 'variableUuid' })) ?? ''
		if (!held.has(uuid)) unplaced.push(uuid)
	}
	return unplaced
}

/**
 * Two applications composing one function, which holds a variable both roles refer to; the first one's role also
 * refers to a variable of the bay applying to the bay only, and to one applying only to a function it does not compose.
 */
const rolesXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Header id="template" uuid="template-file" version="0" revision="1" ${id}="template-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" uuid="bay-source" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="APP_A" uuid="a-source" ${id}="a-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="a-root-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="a-root-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source" ${id}="a-prot-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="a-engineering-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="a-engineering-content-s">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="a-vf-ref-s"/>
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VBAY_ONLY" variableUuid="vbay-only-source" ${id}="a-vbay-ref-s"/>
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VAWAY" variableUuid="vaway-source" ${id}="a-vaway-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Application name="APP_B" uuid="b-source" ${id}="b-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="b-root-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="b-root-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source" ${id}="b-prot-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="b-engineering-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="b-engineering-content-s">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE" elementUuid="bay-source" ${id}="vbay-only-apply-s"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:Variable name="VAWAY" value="2" uuid="vaway-source" ${id}="vaway-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/OTHER" elementUuid="other-source" ${id}="vaway-apply-s"/>
						</eIEC61850-6-100:Variable>
					</Private>
					<Function name="Prot" uuid="prot-source" ${id}="prot-s">
						<Private type="eIEC61850-6-100" ${id}="prot-private-s">
							<eIEC61850-6-100:Variable name="VF" value="3" uuid="vf-source" ${id}="vf-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vf-apply-s"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</Function>
					<Function name="OTHER" uuid="other-source" ${id}="other-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A bay template whose application's role refers to a variable of the bay applying to its voltage level only.
const levelReferenceXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Header id="template" uuid="template-file" version="0" revision="1" ${id}="template-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" uuid="voltage-level-source" ${id}="voltage-level-s">
				<Bay name="B9" uuid="bay-source" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="APP_A" uuid="a-source" ${id}="a-s">
							<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="a-engineering-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="a-engineering-content-s">
									<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VVL" variableUuid="vvl-source" ${id}="a-vvl-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="VVL" value="4" uuid="vvl-source" ${id}="vvl-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE" elementUuid="voltage-level-source" ${id}="vvl-apply-s"/>
						</eIEC61850-6-100:Variable>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same, the variable held by a function of the bay its application composes.
const functionLevelXml = levelReferenceXml
	.replace(
		`<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="a-engineering-s">`,
		[
			`<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="a-root-s">`,
			`<eIEC61850-6-100:FunctionRoleContent ${id}="a-root-content-s">`,
			`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B9/F9" functionUuid="f9-source" ${id}="a-f9-ref-s"/>`,
			`</eIEC61850-6-100:FunctionRoleContent>`,
			`</eIEC61850-6-100:FunctionRole>`,
			`<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="a-engineering-s">`,
		].join(''),
	)
	.replace(
		`variable="TEMPLATE/TEMPLATE/B9/VVL" variableUuid="vvl-source"`,
		`variable="TEMPLATE/TEMPLATE/B9/F9/VVL" variableUuid="vvl-source"`,
	)
	.replace(
		`<eIEC61850-6-100:Variable name="VVL" value="4" uuid="vvl-source" ${id}="vvl-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE" elementUuid="voltage-level-source" ${id}="vvl-apply-s"/>
						</eIEC61850-6-100:Variable>
					</Private>`,
		[
			`</Private>`,
			`<Function name="F9" uuid="f9-source" ${id}="f9-s">`,
			`<Private type="eIEC61850-6-100" ${id}="f9-private-s">`,
			`<eIEC61850-6-100:Variable name="VVL" value="4" uuid="vvl-source" ${id}="vvl-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE" elementUuid="voltage-level-source" ${id}="vvl-apply-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`</Private>`,
			`</Function>`,
		].join(''),
	)

// The same, the role referring too to a variable of the bay applying to a function of another bay only: the reference
// links the two bays.
const levelAwayXml = levelReferenceXml
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VVL" variableUuid="vvl-source" ${id}="a-vvl-ref-s"/>`,
		[
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VVL" variableUuid="vvl-source" ${id}="a-vvl-ref-s"/>`,
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VB8" variableUuid="vb8-source" ${id}="a-vb8-ref-s"/>`,
		].join(''),
	)
	.replace(
		`</eIEC61850-6-100:Variable>
					</Private>
				</Bay>`,
		[
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VB8" value="5" uuid="vb8-source" ${id}="vb8-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B8/F8" elementUuid="f8-source" ${id}="vb8-apply-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`</Private>`,
			`</Bay>`,
			`<Bay name="B8" uuid="bay-8-source" ${id}="bay-8-s">`,
			`<Function name="F8" uuid="f8-source" ${id}="f8-s"/>`,
			`</Bay>`,
		].join(''),
	)

// The same, the template's voltage level holding a function no application composes, and the role referring too to a
// variable of the bay applying to that function (and to the bay, or not).
function levelFunctionXml(params: { alsoTheBay: boolean }): string {
	const bayApplication = params.alsoTheBay
		? `<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9" elementUuid="bay-source" ${id}="vmix-bay-s"/>`
		: ''
	return levelReferenceXml
		.replace(
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VVL" variableUuid="vvl-source" ${id}="a-vvl-ref-s"/>`,
			[
				`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VVL" variableUuid="vvl-source" ${id}="a-vvl-ref-s"/>`,
				`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VMIX" variableUuid="vmix-source" ${id}="a-vmix-ref-s"/>`,
			].join(''),
		)
		.replace(
			`</eIEC61850-6-100:Variable>
					</Private>
				</Bay>`,
			[
				`</eIEC61850-6-100:Variable>`,
				`<eIEC61850-6-100:Variable name="VMIX" value="6" uuid="vmix-source" ${id}="vmix-s">`,
				bayApplication,
				`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/LEVEL_G" elementUuid="level-g-source" ${id}="vmix-level-s"/>`,
				`</eIEC61850-6-100:Variable>`,
				`</Private>`,
				`</Bay>`,
				`<Function name="LEVEL_G" uuid="level-g-source" ${id}="level-g-s"/>`,
			].join(''),
		)
}

// The same, a second application composing a function of the voltage level that holds a variable the first application's
// role refers to: that function is placed with the second application, after the first.
const laterFunctionXml = levelReferenceXml
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VVL" variableUuid="vvl-source" ${id}="a-vvl-ref-s"/>`,
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/F_UP/VUP" variableUuid="vup-source" ${id}="a-vup-ref-s"/>`,
	)
	.replace(
		`</eIEC61850-6-100:Application>`,
		[
			`</eIEC61850-6-100:Application>`,
			`<eIEC61850-6-100:Application name="APP_B" uuid="b-source" ${id}="b-s">`,
			`<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="b-root-s">`,
			`<eIEC61850-6-100:FunctionRoleContent ${id}="b-root-content-s">`,
			`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/F_UP" functionUuid="f-up-source" ${id}="b-f-up-ref-s"/>`,
			`</eIEC61850-6-100:FunctionRoleContent>`,
			`</eIEC61850-6-100:FunctionRole>`,
			`</eIEC61850-6-100:Application>`,
		].join(''),
	)
	.replace(
		`</Bay>`,
		[
			`</Bay>`,
			`<Function name="F_UP" uuid="f-up-source" ${id}="f-up-s">`,
			`<Private type="eIEC61850-6-100" ${id}="f-up-private-s">`,
			`<eIEC61850-6-100:Variable name="VUP" value="7" uuid="vup-source" ${id}="vup-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/F_UP" elementUuid="f-up-source" ${id}="vup-f-up-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`</Private>`,
			`</Function>`,
		].join(''),
	)

// The same, the second application composing a sibling of the first's function (one template reference), its role
// referring to the variable that sibling holds, a sibling of the first function's variable.
const siblingXml = rolesXml
	.replace(
		`<Function name="Prot" uuid="prot-source" ${id}="prot-s">`,
		`<Function name="Prot" uuid="prot-source" templateUuid="lib-function" ${id}="prot-s">`,
	)
	.replace(
		`<Function name="OTHER" uuid="other-source" ${id}="other-s"/>`,
		[
			`<Function name="Prot_2" uuid="prot-2-source" templateUuid="lib-function" ${id}="prot-2-s">`,
			`<Private type="eIEC61850-6-100" ${id}="prot-2-private-s">`,
			`<eIEC61850-6-100:Variable name="VF" value="3" uuid="vf-2-source" templateUuid="lib-variable" ${id}="vf-2-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot_2" elementUuid="prot-2-source" ${id}="vf-2-apply-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`</Private>`,
			`</Function>`,
			`<Function name="OTHER" uuid="other-source" ${id}="other-s"/>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:Variable name="VF" value="3" uuid="vf-source" ${id}="vf-s">`,
		`<eIEC61850-6-100:Variable name="VF" value="3" uuid="vf-source" templateUuid="lib-variable" ${id}="vf-s">`,
	)
	.replace(
		`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source" ${id}="b-prot-ref-s"/>`,
		`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot_2" functionUuid="prot-2-source" ${id}="b-prot-ref-s"/>`,
	)
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>`,
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot_2/VF" variableUuid="vf-2-source" ${id}="b-vf-ref-s"/>`,
	)

// The same, the bay holding a variable applying to Prot only, which the second application's role refers to.
const sharedTargetXml = rolesXml
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>`,
		[
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>`,
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VSHARED" variableUuid="vshared-source" ${id}="b-vshared-ref-s"/>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
		[
			`<eIEC61850-6-100:Variable name="VSHARED" value="9" uuid="vshared-source" ${id}="vshared-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vshared-prot-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
		].join(''),
	)

// The same, the bay holding a variable applying to the first application itself, which its role refers to.
const applicationTargetXml = rolesXml
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VAWAY" variableUuid="vaway-source" ${id}="a-vaway-ref-s"/>`,
		[
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VAWAY" variableUuid="vaway-source" ${id}="a-vaway-ref-s"/>`,
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VAPP" variableUuid="vapp-source" ${id}="a-vapp-ref-s"/>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
		[
			`<eIEC61850-6-100:Variable name="VAPP" value="8" uuid="vapp-source" ${id}="vapp-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/APP_A" elementUuid="a-source" ${id}="vapp-app-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
		].join(''),
	)

// The same, the variable applying to the template bay too.
const sharedAndBayXml = sharedTargetXml.replace(
	`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vshared-prot-s"/>`,
	[
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vshared-prot-s"/>`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE" elementUuid="bay-source" ${id}="vshared-bay-s"/>`,
	].join(''),
)

// The same, the second application's role referring too to a behaviour description of no input or output and to a
// variable applying to the function stood on by path as well as by uuid: neither applies to it by uuid only.
const unnamedTargetsXml = rolesXml
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>`,
		[
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>`,
			`<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="TEMPLATE/TEMPLATE/TEMPLATE/BDX" behaviorDescriptionUuid="bdx-source" ${id}="b-bdx-ref-s"/>`,
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VPATH" variableUuid="vpath-source" ${id}="b-vpath-ref-s"/>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
		[
			`<eIEC61850-6-100:BehaviorDescription name="BDX" uuid="bdx-source" ${id}="bdx-s"/>`,
			`<eIEC61850-6-100:Variable name="VPATH" value="4" uuid="vpath-source" ${id}="vpath-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" ${id}="vpath-prot-s"/>`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vpath-prot-uuid-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
		].join(''),
	)

// The same, the variable Prot holds applying to the bay too: it is Prot's, whatever it applies to.
const insideAndBayXml = rolesXml.replace(
	`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vf-apply-s"/>`,
	[
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vf-apply-s"/>`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE" elementUuid="bay-source" ${id}="vf-bay-s"/>`,
	].join(''),
)

// The same, Prot holding a logical node and a behaviour description of it, which the second application's role refers to.
const functionLogicXml = rolesXml
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>`,
		`<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="TEMPLATE/TEMPLATE/TEMPLATE/Prot/BDP" behaviorDescriptionUuid="bdp-source" ${id}="b-bdp-ref-s"/>`,
	)
	.replace(
		`</eIEC61850-6-100:Variable>
						</Private>
					</Function>
					<Function name="OTHER"`,
		[
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:BehaviorDescription name="BDP" uuid="bdp-source" ${id}="bdp-s">`,
			`<eIEC61850-6-100:InputVar varName="pos" dataName="TEMPLATE/TEMPLATE/TEMPLATE/Prot/CSWI1" lnodeUuid="prot-ln-source" doName="Pos" ${id}="bdp-input-s"/>`,
			`</eIEC61850-6-100:BehaviorDescription>`,
			`</Private>`,
			`<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="prot-ln-source" ${id}="prot-ln-s"/>`,
			`</Function>`,
			`<Function name="OTHER"`,
		].join(''),
	)

// A project whose bay holds the copy of Prot with the copy of its behaviour description, and whose second bay, read
// after, holds a behaviour description of the same template reference about that function's logical node.
const twoLogicCopiesXml = projectXml.replace(
	`<Bay name="B1" uuid="project-bay-uuid" ${id}="project-bay"/>`,
	[
		`<Bay name="B1" uuid="project-bay-uuid" ${id}="project-bay">`,
		`<Function name="Prot" uuid="project-prot-uuid" templateUuid="prot-source" ${id}="project-prot">`,
		`<Private type="eIEC61850-6-100" ${id}="project-prot-private">`,
		`<eIEC61850-6-100:BehaviorDescription name="BDP" uuid="project-bdp-uuid" templateUuid="bdp-source" ${id}="project-bdp">`,
		`<eIEC61850-6-100:InputVar varName="pos" dataName="S1/V1/B1/Prot/CSWI1" lnodeUuid="project-ln-uuid" doName="Pos" ${id}="project-bdp-input"/>`,
		`</eIEC61850-6-100:BehaviorDescription>`,
		`</Private>`,
		`<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="project-ln-uuid" templateUuid="prot-ln-source" ${id}="project-ln"/>`,
		`</Function>`,
		`</Bay>`,
		`<Bay name="B2" uuid="project-bay-2-uuid" ${id}="project-bay-2">`,
		`<Private type="eIEC61850-6-100" ${id}="project-bay-2-private">`,
		`<eIEC61850-6-100:BehaviorDescription name="BDP" uuid="project-bdp-2-uuid" templateUuid="bdp-source" ${id}="project-bdp-2">`,
		`<eIEC61850-6-100:InputVar varName="pos" dataName="S1/V1/B1/Prot/CSWI1" lnodeUuid="project-ln-uuid" doName="Pos" ${id}="project-bdp-2-input"/>`,
		`</eIEC61850-6-100:BehaviorDescription>`,
		`</Private>`,
		`</Bay>`,
	].join(''),
)

// The same, the variable Prot holds applying to the other function only, which no application composes.
const carriedAwayXml = rolesXml.replace(
	`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vf-apply-s"/>`,
	`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/OTHER" elementUuid="other-source" ${id}="vf-apply-s"/>`,
)

// The same, the variable Prot holds applying to Prot and to the other function, which no application composes.
const carriedPartlyAwayXml = rolesXml.replace(
	`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vf-apply-s"/>`,
	[
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vf-apply-s"/>`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/OTHER" elementUuid="other-source" ${id}="vf-other-s"/>`,
	].join(''),
)

// The same, the variable held by a sub-function of Prot, described by a text.
const carriedDeepXml = carriedAwayXml
	.replaceAll(
		'variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF"',
		'variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/SUB/VF"',
	)
	.replace(
		`<Private type="eIEC61850-6-100" ${id}="prot-private-s">
							<eIEC61850-6-100:Variable name="VF" value="3" uuid="vf-source" ${id}="vf-s">`,
		[
			`<SubFunction name="SUB" uuid="sub-source" ${id}="sub-s">`,
			`<Private type="eIEC61850-6-100" ${id}="prot-private-s">`,
			`<eIEC61850-6-100:Variable name="VF" value="3" uuid="vf-source" ${id}="vf-s">`,
			`<eIEC61850-6-100:Text ${id}="vf-text-s">applies to the other function</eIEC61850-6-100:Text>`,
		].join(''),
	)
	.replace(
		`</eIEC61850-6-100:Variable>
						</Private>
					</Function>
					<Function name="OTHER"`,
		`</eIEC61850-6-100:Variable></Private></SubFunction></Function><Function name="OTHER"`,
	)

// The same, both applications composing a second function too, which holds a variable of the template reference of Prot's.
const siblingPairXml = rolesXml
	.replace(
		`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source" ${id}="a-prot-ref-s"/>`,
		[
			`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source" ${id}="a-prot-ref-s"/>`,
			`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot_2" functionUuid="prot-2-source" ${id}="a-prot-2-ref-s"/>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source" ${id}="b-prot-ref-s"/>`,
		[
			`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source" ${id}="b-prot-ref-s"/>`,
			`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot_2" functionUuid="prot-2-source" ${id}="b-prot-2-ref-s"/>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:Variable name="VF" value="3" uuid="vf-source" ${id}="vf-s">`,
		`<eIEC61850-6-100:Variable name="VF" value="3" uuid="vf-source" templateUuid="lib-variable" ${id}="vf-s">`,
	)
	.replace(
		`<Function name="OTHER" uuid="other-source" ${id}="other-s"/>`,
		[
			`<Function name="Prot_2" uuid="prot-2-source" ${id}="prot-2-s">`,
			`<Private type="eIEC61850-6-100" ${id}="prot-2-private-s">`,
			`<eIEC61850-6-100:Variable name="VG" value="5" uuid="vg-source" templateUuid="lib-variable" ${id}="vg-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot_2" elementUuid="prot-2-source" ${id}="vg-apply-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`</Private>`,
			`</Function>`,
			`<Function name="OTHER" uuid="other-source" ${id}="other-s"/>`,
		].join(''),
	)

// The same, the bay holding two variables of one template reference, one applying only to Prot, the other only to
// Prot_2; the second application's role refers to the first.
const siblingTargetsXml = siblingPairXml
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>`,
		[
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/Prot/VF" variableUuid="vf-source" ${id}="b-vf-ref-s"/>`,
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/VS1" variableUuid="vs1-source" ${id}="b-vs1-ref-s"/>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
		[
			`<eIEC61850-6-100:Variable name="VS1" value="11" uuid="vs1-source" templateUuid="lib-shared" ${id}="vs1-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vs1-prot-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VS2" value="12" uuid="vs2-source" templateUuid="lib-shared" ${id}="vs2-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot_2" elementUuid="prot-2-source" ${id}="vs2-prot-2-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
		].join(''),
	)

// A bay template whose variable applying to the voltage level also applies by a path only, beside a variable applying
// by a path only.
const levelPathXml = levelReferenceXml.replace(
	`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE" elementUuid="voltage-level-source" ${id}="vvl-apply-s"/>
						</eIEC61850-6-100:Variable>`,
	[
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE" elementUuid="voltage-level-source" ${id}="vvl-apply-s"/>`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9" ${id}="vvl-path-s"/>`,
		`</eIEC61850-6-100:Variable>`,
		`<eIEC61850-6-100:Variable name="VPATHONLY" value="5" uuid="vpath-only-source" ${id}="vpath-only-s">`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B9" ${id}="vpath-only-apply-s"/>`,
		`</eIEC61850-6-100:Variable>`,
	].join(''),
)

// The same, the variable of the bay no role refers to applying too to a function of the level no application composes.
const laterLevelFunctionXml = laterFunctionXml
	.replace(
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE" elementUuid="voltage-level-source" ${id}="vvl-apply-s"/>`,
		[
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE" elementUuid="voltage-level-source" ${id}="vvl-apply-s"/>`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/LEVEL_G" elementUuid="level-g-source" ${id}="vvl-level-g-s"/>`,
		].join(''),
	)
	.replace(
		`<Function name="F_UP" uuid="f-up-source" ${id}="f-up-s">`,
		`<Function name="LEVEL_G" uuid="level-g-source" ${id}="level-g-s"/><Function name="F_UP" uuid="f-up-source" ${id}="f-up-s">`,
	)

// The same, the first application's role referring too to a variable of the bay applying to F_UP only.
const laterFunctionTargetXml = laterFunctionXml
	.replace(
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/F_UP/VUP" variableUuid="vup-source" ${id}="a-vup-ref-s"/>`,
		[
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/F_UP/VUP" variableUuid="vup-source" ${id}="a-vup-ref-s"/>`,
			`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B9/VP4" variableUuid="vp4-source" ${id}="a-vp4-ref-s"/>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:Variable name="VVL" value="4" uuid="vvl-source" ${id}="vvl-s">`,
		[
			`<eIEC61850-6-100:Variable name="VP4" value="6" uuid="vp4-source" ${id}="vp4-s">`,
			`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/F_UP" elementUuid="f-up-source" ${id}="vp4-f-up-s"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VVL" value="4" uuid="vvl-source" ${id}="vvl-s">`,
		].join(''),
	)

// The same, the bay holding a variable no role refers to, applying to Prot and to the bay.
const mixedTargetsXml = rolesXml.replace(
	`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
	[
		`<eIEC61850-6-100:Variable name="VMIXED" value="5" uuid="vmixed-source" ${id}="vmixed-s">`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source" ${id}="vmixed-prot-s"/>`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE" elementUuid="bay-source" ${id}="vmixed-bay-s"/>`,
		`</eIEC61850-6-100:Variable>`,
		`<eIEC61850-6-100:Variable name="VBAY_ONLY" value="1" uuid="vbay-only-source" ${id}="vbay-only-s">`,
	].join(''),
)

// A project of a voltage level holding no bay, of a uuid.
const emptyLevelXml = projectXml
	.replace(
		`<VoltageLevel name="V1" ${id}="project-voltage-level">`,
		`<VoltageLevel name="V1" uuid="project-voltage-level-uuid" ${id}="project-voltage-level">`,
	)
	.replace(`<Bay name="B1" uuid="project-bay-uuid" ${id}="project-bay"/>`, '')

// The same, the variable the role refers to applying to an equipment of the template voltage level instead.
const levelEquipmentXml = levelReferenceXml
	.replace(
		`<Bay name="B9" uuid="bay-source" ${id}="bay-s">`,
		`<GeneralEquipment name="GE1" type="AXN" uuid="ge-source" ${id}="ge-s"/><Bay name="B9" uuid="bay-source" ${id}="bay-s">`,
	)
	.replace(
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE" elementUuid="voltage-level-source" ${id}="vvl-apply-s"/>`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/GE1" elementUuid="ge-source" ${id}="vvl-apply-s"/>`,
	)

// A project voltage level holding that equipment, of the template's lineage, and a copy of the variable applying to it.
const levelEquipmentCopyXml = emptyLevelXml.replace(
	`<VoltageLevel name="V1" uuid="project-voltage-level-uuid" ${id}="project-voltage-level">`,
	[
		`<VoltageLevel name="V1" uuid="project-voltage-level-uuid" ${id}="project-voltage-level">`,
		`<Private type="eIEC61850-6-100" ${id}="project-voltage-level-private">`,
		`<eIEC61850-6-100:Variable name="VVL" value="4" uuid="project-vvl-uuid" templateUuid="vvl-source" ${id}="project-vvl">`,
		`<eIEC61850-6-100:VariableApplyTo element="S1/V1/GE1" elementUuid="project-ge-uuid" ${id}="project-vvl-apply"/>`,
		`</eIEC61850-6-100:Variable>`,
		`</Private>`,
		`<GeneralEquipment name="GE1" type="AXN" uuid="project-ge-uuid" templateUuid="ge-source" ${id}="project-ge"/>`,
	].join(''),
)

/**
 * One placement of a case: an application of the template on the project bay (or its voltage level), merged onto the
 * functions it shares, or not; the bay of a substation template; or a change the project makes.
 */
type RoleStep =
	| { place: 'APP_A' | 'APP_B'; merge?: true; onLevel?: true; ontoTheBay?: true }
	| { placeUnit: 'B9' }
	| { project: (tx: Core.Transaction<Config>) => Promise<void> }

type RoleCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	steps: RoleStep[]
	/** What the last report lists added of the variables, as `listSatellites` writes it. */
	listed: string[]
	/** The warnings of the last report, as `<code> <name of the source element>`. */
	warnings: string[]
}

describe('lifecycle — what a role refers to lands where the placement lands', () => {
	const testCases: SclTest.TestCases<RoleCase> = {
		'the application placed on a bay → the variable applying to the template bay applies to that bay; the one applying to nothing placed is not written, nor referred to':
			{
				sourceXml: rolesXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }],
				listed: ['Variable VBAY_ONLY: 1 (Application APP_A)', 'Variable VF: 1 (Function Prot)'],
				warnings: ['satellite-not-placed VAWAY'],
				expectedQueries: [
					'//v2019C1:Variable[@name="VBAY_ONLY"]/v2019C1:VariableApplyTo[@elementUuid="project-bay-uuid"]',
					'//default:Function[@name="Prot"]/default:Private/v2019C1:Variable[@name="VF"]',
					'//v2019C1:Application[@name="APP_A"][count(.//v2019C1:VariableRef)=2]',
				],
				unexpectedQueries: ['//v2019C1:Variable[@name="VAWAY"]'],
			},
		'the application placed on a bay, its role referring to a variable applying to the application → listed with the application':
			{
				sourceXml: applicationTargetXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }],
				listed: [
					'Variable VAPP: 1 (Application APP_A)',
					'Variable VBAY_ONLY: 1 (Application APP_A)',
					'Variable VF: 1 (Function Prot)',
				],
				warnings: ['satellite-not-placed VAWAY'],
				expectedQueries: [
					'//v2019C1:Variable[@name="VAPP"]/v2019C1:VariableApplyTo[@elementUuid=//v2019C1:Application[@name="APP_A"]/@uuid]',
				],
			},
		'the application placed, its role referring to the variable its function holds, applying only to a function it does not compose → not placed, nor referred to, and told':
			{
				sourceXml: carriedAwayXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }],
				listed: ['Variable VBAY_ONLY: 1 (Application APP_A)'],
				warnings: ['satellite-not-placed VAWAY', 'satellite-not-placed VF'],
				expectedQueries: ['//default:Function[@name="Prot"]'],
				unexpectedQueries: ['//v2019C1:Variable[@name="VF"]'],
			},
		'the application placed, its role referring to the variable its function holds, applying to it and to a function it does not compose → applying to its function only':
			{
				sourceXml: carriedPartlyAwayXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }],
				listed: ['Variable VBAY_ONLY: 1 (Application APP_A)', 'Variable VF: 1 (Function Prot)'],
				warnings: ['satellite-not-placed VAWAY'],
				expectedQueries: [
					'//default:Function[@name="Prot"]/default:Private/v2019C1:Variable[@name="VF"][count(v2019C1:VariableApplyTo)=1]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="Prot"]/@uuid]',
				],
			},
		'the application placed, its role referring to the variable a sub-function of its function holds, applying only to a function it does not compose → not placed, nor referred to, and told':
			{
				sourceXml: carriedDeepXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }],
				listed: ['Variable VBAY_ONLY: 1 (Application APP_A)'],
				warnings: ['satellite-not-placed VAWAY', 'satellite-not-placed VF'],
				expectedQueries: ['//default:Function[@name="Prot"]/default:SubFunction[@name="SUB"]'],
				unexpectedQueries: ['//v2019C1:Variable[@name="VF"]'],
			},
		'the application placed on a voltage level, its bay created → the variable applying to the template bay applies to the bay created':
			{
				sourceXml: rolesXml,
				targetXml: emptyLevelXml,
				steps: [{ place: 'APP_A', onLevel: true }],
				listed: ['Variable VBAY_ONLY: 1 (Application APP_A)', 'Variable VF: 1 (Function Prot)'],
				warnings: ['satellite-not-placed VAWAY'],
				expectedQueries: [
					'//v2019C1:Variable[@name="VBAY_ONLY"]/v2019C1:VariableApplyTo[@elementUuid=//default:Bay[.//v2019C1:Application[@name="APP_A"]]/@uuid]',
				],
			},
		'the bay of a substation template placed, its role referring to a variable applying to the template voltage level → applying to the project level':
			{
				sourceXml: levelReferenceXml,
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }],
				listed: ['Variable VVL: 1 (Bay B9)'],
				warnings: [],
				expectedQueries: [
					'//v2019C1:Variable[@name="VVL"]/v2019C1:VariableApplyTo[@elementUuid="project-voltage-level-uuid"]',
				],
			},
		"the bay of a substation template placed, its role referring to a variable applying only to an equipment of the template voltage level, the project's level holding a copy applying to its own → not placed, nor referred to, and told":
			{
				sourceXml: levelEquipmentXml,
				targetXml: levelEquipmentCopyXml,
				steps: [{ placeUnit: 'B9' }],
				listed: [],
				warnings: ['satellite-not-placed VVL'],
				expectedQueries: [
					'//v2019C1:Application[@name="APP_A"][not(.//v2019C1:VariableRef)]',
					'/default:SCL[count(.//v2019C1:Variable)=1]',
				],
			},
		'the bay of a substation template placed, its role referring to a variable applying to a function of another bay → that bay placed with it, the variable applying to its copy':
			{
				sourceXml: levelAwayXml,
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }],
				listed: ['Variable VB8: 1 (Function F8)', 'Variable VVL: 1 (Variable VVL)'],
				warnings: [],
				expectedQueries: [
					'//v2019C1:Variable[@name="VB8"]/v2019C1:VariableApplyTo[@elementUuid=//default:Bay[@name="B8"]/default:Function[@name="F8"]/@uuid]',
					'//v2019C1:Application[@name="APP_A"][count(.//v2019C1:VariableRef)=2]',
				],
			},
		'the bay of a substation template placed, its role referring to a variable applying to the bay and to a function of the level no application composes → applying to the bay only':
			{
				sourceXml: levelFunctionXml({ alsoTheBay: true }),
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }],
				listed: ['Variable VMIX: 1 (Bay B9)', 'Variable VVL: 1 (Bay B9)'],
				warnings: [],
				expectedQueries: [
					'//v2019C1:Variable[@name="VMIX"][count(v2019C1:VariableApplyTo)=1]/v2019C1:VariableApplyTo[@elementUuid=//default:Bay[@name="B9"]/@uuid]',
				],
				unexpectedQueries: ['//default:Function[@name="LEVEL_G"]'],
			},
		'the bay of a substation template placed, its role referring to a variable applying only to a function of the level no application composes → not written, nor referred to, and told':
			{
				sourceXml: levelFunctionXml({ alsoTheBay: false }),
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }],
				listed: ['Variable VVL: 1 (Bay B9)'],
				warnings: ['satellite-not-placed VMIX'],
				expectedQueries: ['//v2019C1:Application[@name="APP_A"][count(.//v2019C1:VariableRef)=1]'],
				unexpectedQueries: ['//v2019C1:Variable[@name="VMIX"]'],
			},
		"the bay of a substation template placed, its first application's role referring to a variable a function of the level holds, which its second application composes → placed once, with that function":
			{
				sourceXml: laterFunctionXml,
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }],
				listed: ['Variable VUP: 1 (Function F_UP)', 'Variable VVL: 1 (Bay B9)'],
				warnings: [],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@value="7"])=1]',
					'//default:Function[@name="F_UP"]/default:Private/v2019C1:Variable[@name="VUP"]',
					// what the bay holds applying to the level travels with it, whatever refers to it
					'//default:Bay[@name="B9"]/default:Private/v2019C1:Variable[@name="VVL"]/v2019C1:VariableApplyTo[@elementUuid="project-voltage-level-uuid"]',
				],
			},
		'the second application merged onto the function the first placed → its role names the variable that function holds, none placed again':
			{
				sourceXml: rolesXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_B', merge: true }],
				listed: [],
				warnings: [],
				expectedQueries: [
					'//default:Bay[@name="B1"][count(.//v2019C1:Variable[@name="VF"])=1][count(default:Function[@name="Prot"])=1]',
					'//v2019C1:Application[@name="APP_B"]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VF"]/@uuid]',
				],
				unexpectedQueries: ['//v2019C1:Variable[@name="VF_1"]'],
			},
		"the second merged onto the first's function through a sibling of its template reference → its role names the copy of the sibling's variable that function holds":
			{
				sourceXml: siblingXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_B', merge: true }],
				listed: [],
				warnings: [],
				expectedQueries: [
					'//default:Bay[@name="B1"][count(.//v2019C1:Variable[@value="3"])=1][count(default:Function)=1]',
					'//v2019C1:Application[@name="APP_B"]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VF"]/@uuid]',
				],
			},
		"the second merged onto the first's function, its role referring to a variable applying to that function only → its role names the copy the first placed, none placed again":
			{
				sourceXml: sharedTargetXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_B', merge: true }],
				listed: [],
				warnings: [],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@value="9"])=1]',
					'//v2019C1:Application[@name="APP_B"]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VSHARED"]/@uuid]',
				],
				unexpectedQueries: ['//v2019C1:Variable[@name="VSHARED_1"]'],
			},
		"the second merged onto the first's function, its role referring to a variable applying to that function and to the bay, the first's copy applying to both → names that copy, none written":
			{
				sourceXml: sharedAndBayXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_B', merge: true }],
				listed: [],
				warnings: [],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@value="9"])=1]',
					'//v2019C1:Application[@name="APP_B"]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VSHARED"]/@uuid]',
				],
			},
		"the second merged onto the first's function, its role referring to what names it by uuid not only (a behaviour description of no input, a variable by path too) → placed, listed with the application, without what the first's copy applies to already":
			{
				sourceXml: unnamedTargetsXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_B', merge: true }],
				listed: [
					'BehaviorDescription BDX: 0 (Application APP_B)',
					'Variable VPATH: 1 (Application APP_B)',
				],
				warnings: [],
			},
		"the second merged onto the first's function, the project's copy of the variable applying to the bay instead → not that function's: not placed, warned":
			{
				sourceXml: sharedTargetXml,
				targetXml: projectXml,
				steps: [
					{ place: 'APP_A' },
					{ project: retargetTheSharedVariable },
					{ place: 'APP_B', merge: true },
				],
				listed: [],
				warnings: ['satellite-not-placed VSHARED'],
				expectedQueries: ['//v2019C1:Application[@name="APP_B"][count(.//v2019C1:VariableRef)=1]'],
			},
		"the second merged onto the first's function, its role referring to the variable that function holds, applying to the bay too → names the copy the function holds":
			{
				sourceXml: insideAndBayXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_B', merge: true }],
				listed: [],
				warnings: [],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@value="3"])=1]',
					'//v2019C1:Application[@name="APP_B"]//v2019C1:VariableRef[@variableUuid=//default:Function[@name="Prot"]//v2019C1:Variable[@name="VF"]/@uuid]',
				],
			},
		'the second merged onto a function of the project holding the copy of its behaviour description, another bay holding one of the same template reference → names the copy the function holds':
			{
				sourceXml: functionLogicXml,
				targetXml: twoLogicCopiesXml,
				steps: [{ place: 'APP_B', merge: true }],
				listed: [],
				warnings: [],
				expectedQueries: [
					'//v2019C1:Application[@name="APP_B"]//v2019C1:BehaviorDescriptionRef[@behaviorDescriptionUuid="project-bdp-uuid"]',
				],
			},
		"the second merged onto the first's function, the first's copy applying to that function only → a copy applying to the bay only":
			{
				sourceXml: sharedAndBayXml,
				targetXml: projectXml,
				steps: [
					{ place: 'APP_A' },
					{ project: narrowTheSharedVariable },
					{ place: 'APP_B', merge: true },
				],
				listed: ['Variable VSHARED: 1 (Application APP_B)'],
				warnings: [],
				expectedQueries: [
					'//v2019C1:Variable[@value="9"][count(v2019C1:VariableApplyTo)=1]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="Prot"]/@uuid]',
					'//v2019C1:Variable[@value="9"][count(v2019C1:VariableApplyTo)=1]/v2019C1:VariableApplyTo[@elementUuid=//default:Bay[@name="B1"]/@uuid]',
				],
			},
		'the application placed twice on one bay → the second names the variable the first wrote applying to the bay, none written again':
			{
				sourceXml: rolesXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_A' }],
				listed: ['Variable VF: 1 (Function Prot)'],
				warnings: ['satellite-not-placed VAWAY'],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@value="1"])=1]',
					'//default:Bay[@name="B1"][count(.//v2019C1:Application[@templateUuid="a-source"])=2]',
				],
			},
		'the application placed twice on one bay, a variable of the bay no role refers to applying to its function and to the bay → the second copy applies to its function only, the first applying to the bay':
			{
				sourceXml: mixedTargetsXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_A' }],
				listed: ['Variable VF: 1 (Function Prot)', 'Variable VMIXED: 1 (Function Prot)'],
				warnings: ['satellite-not-placed VAWAY'],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@value="5"])=2]',
					'/default:SCL[count(.//v2019C1:Variable[@value="5"]/v2019C1:VariableApplyTo[@elementUuid=//default:Bay[@name="B1"]/@uuid])=1]',
				],
			},
		'the bay of a substation template placed twice on one voltage level → the second names the variable the first wrote applying to it, none written again':
			{
				sourceXml: levelReferenceXml,
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }, { placeUnit: 'B9' }],
				listed: [],
				warnings: [],
				expectedQueries: ['/default:SCL[count(.//v2019C1:Variable[@name="VVL"])=1]'],
				unexpectedQueries: ['//v2019C1:Variable[@name="VVL_1"]'],
			},
		"the bay placed twice on one voltage level, its function holding a variable applying to the level → the second function's copy holds none, its role names the first's":
			{
				sourceXml: functionLevelXml,
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }, { placeUnit: 'B9' }],
				listed: [],
				warnings: [],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@name="VVL"])=1][count(.//default:Function[@name="F9"])=2]',
					'/default:SCL[count(.//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VVL"]/@uuid])=2]',
				],
				unexpectedQueries: ['//v2019C1:Variable[@name="VVL_1"]'],
			},
		'the bay placed twice on one voltage level, a variable of the bay applying to the level and to a function of the level no application composes → the second writes none':
			{
				sourceXml: laterLevelFunctionXml,
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }, { placeUnit: 'B9' }],
				listed: ['Variable VUP: 1 (Function F_UP)'],
				warnings: [],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@name="VVL"])=1][count(.//default:Bay)=2]',
					'//v2019C1:Variable[@name="VVL"][count(v2019C1:VariableApplyTo)=1]/v2019C1:VariableApplyTo[@elementUuid="project-voltage-level-uuid"]',
				],
				unexpectedQueries: ['//v2019C1:Variable[@name="VVL_1"]'],
			},
		"the second merged onto both functions, the copy of the variable applying only to Prot dropped, its sibling's copy applying only to Prot_2 → not placed, warned: a copy applying to another function is not its":
			{
				sourceXml: siblingTargetsXml,
				targetXml: projectXml,
				steps: [
					{ place: 'APP_A' },
					{ project: dropTheFirstSibling },
					{ place: 'APP_B', merge: true },
				],
				listed: [],
				warnings: ['satellite-not-placed VS1'],
				expectedQueries: ['//v2019C1:Variable[@name="VS2"]'],
				unexpectedQueries: [
					'//v2019C1:Variable[@name="VS1"]',
					'//v2019C1:Application[@name="APP_B"]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VS2"]/@uuid]',
				],
			},
		'the application placed twice on one bay, the second time from its voltage level, the template bay mapped onto that bay → the second names the variable the first wrote applying to it, none written again':
			{
				sourceXml: rolesXml,
				targetXml: projectXml,
				steps: [{ place: 'APP_A' }, { place: 'APP_A', onLevel: true, ontoTheBay: true }],
				listed: ['Variable VF: 1 (Function Prot)'],
				warnings: ['satellite-not-placed VAWAY'],
				expectedQueries: [
					'/default:SCL[count(.//v2019C1:Variable[@name="VBAY_ONLY"])=1][count(.//default:Bay)=1]',
					'//default:Bay[@name="B1"][count(.//v2019C1:Application[@templateUuid="a-source"])=2]',
				],
			},
		'the bay of a substation template placed, its variable applying to the voltage level and by a path → both its applications kept; one applying by a path only is no satellite of the frame':
			{
				sourceXml: levelPathXml,
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }],
				listed: ['Variable VVL: 2 (Bay B9)'],
				warnings: [],
				expectedQueries: [
					'//v2019C1:Variable[@name="VVL"][count(v2019C1:VariableApplyTo)=2]/v2019C1:VariableApplyTo[@elementUuid="project-voltage-level-uuid"]',
				],
				unexpectedQueries: ['//v2019C1:Variable[@name="VPATHONLY"]'],
			},
		"the second merged onto both functions, the copy of Prot's variable dropped, Prot_2 holding its sibling's → not placed, warned: a sibling's copy in another function is not Prot's":
			{
				sourceXml: siblingPairXml,
				targetXml: projectXml,
				steps: [
					{ place: 'APP_A' },
					{ project: dropTheFunctionVariable },
					{ place: 'APP_B', merge: true },
				],
				listed: [],
				warnings: ['satellite-not-placed VF'],
				expectedQueries: ['//v2019C1:Application[@name="APP_B"][not(.//v2019C1:VariableRef)]'],
			},
		"the bay placed, the first application's role referring to a variable applying only to the level function the second composes → listed with that function, placed with it":
			{
				sourceXml: laterFunctionTargetXml,
				targetXml: emptyLevelXml,
				steps: [{ placeUnit: 'B9' }],
				listed: [
					'Variable VP4: 1 (Function F_UP)',
					'Variable VUP: 1 (Function F_UP)',
					'Variable VVL: 1 (Bay B9)',
				],
				warnings: [],
				expectedQueries: [
					'//v2019C1:Variable[@name="VP4"]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="F_UP"]/@uuid]',
				],
			},
		"the second merged onto the first's function, the project holding no copy of the variable applying to it only → not placed, its role not referring to it":
			{
				sourceXml: sharedTargetXml,
				targetXml: projectXml,
				steps: [
					{ place: 'APP_A' },
					{ project: dropTheSharedVariable },
					{ place: 'APP_B', merge: true },
				],
				listed: [],
				warnings: ['satellite-not-placed VSHARED'],
				expectedQueries: ['//v2019C1:Application[@name="APP_B"][count(.//v2019C1:VariableRef)=1]'],
				unexpectedQueries: [
					'//v2019C1:Variable[@name="VSHARED"]',
					'//v2019C1:Variable[@name="VSHARED_1"]',
				],
			},
		"the second merged onto the first's function through a sibling of its template reference, that function holding the copy of another variable only → not placed, warned":
			{
				sourceXml: siblingXml,
				targetXml: projectXml,
				steps: [
					{ place: 'APP_A' },
					{ project: retargetTheFunctionVariable },
					{ place: 'APP_B', merge: true },
				],
				listed: [],
				warnings: ['satellite-not-placed VF'],
				expectedQueries: ['//v2019C1:Application[@name="APP_B"][not(.//v2019C1:VariableRef)]'],
			},
		'the second merged onto a function of the project holding the copy of another variable only → not placed, its role not referring to it':
			{
				sourceXml: rolesXml,
				targetXml: projectXml,
				steps: [
					{ place: 'APP_A' },
					{ project: retargetTheFunctionVariable },
					{ place: 'APP_B', merge: true },
				],
				listed: [],
				warnings: ['satellite-not-placed VF'],
				expectedQueries: ['//v2019C1:Application[@name="APP_B"][not(.//v2019C1:VariableRef)]'],
				unexpectedQueries: ['//v2019C1:Variable[@name="VF"]'],
			},
		'the second merged onto a function of the project holding no copy of the variable → not placed, its role not referring to it':
			{
				sourceXml: rolesXml,
				targetXml: projectXml,
				steps: [
					{ place: 'APP_A' },
					{ project: dropTheFunctionVariable },
					{ place: 'APP_B', merge: true },
				],
				listed: [],
				warnings: ['satellite-not-placed VF'],
				expectedQueries: ['//v2019C1:Application[@name="APP_B"][not(.//v2019C1:VariableRef)]'],
				unexpectedQueries: ['//v2019C1:Variable[@name="VF"]'],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<RoleCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		let lastReport: DiffReport | undefined
		for (const step of testCase.steps) {
			if ('project' in step) {
				await target.transaction(step.project)
				continue
			}
			const placement = await rolePlacementOf({ step, sourceQuery: source.query })
			const sharedFunctions = 'merge' in step && step.merge ? 'merge' : 'clone'
			// placed on the level, the template bay mapped onto the project's
			const mappings = 'ontoTheBay' in step && step.ontoTheBay ? ontoTheProjectBay : undefined
			const listed = await report(target.query, {
				...placement,
				resolution: { sharedFunctions, mappings },
			})
			await target.transaction(async function placeApplication(tx) {
				await apply(tx, {
					...placement,
					report: listed,
					resolution: { sharedFunctions, decisions: new Map(), mappings },
				})
			})
			lastReport = listed
		}
		if (!lastReport) throw new Error('a case places an application')
		expect(
			await listSatellites({ report: lastReport, sourceQuery: source.query }),
			'report',
		).toEqual(testCase.listed)
		const warnings: string[] = []
		const notPlacedUuids = new Set<string>()
		for (const warning of lastReport.warnings ?? []) {
			if (warning.code !== 'satellite-not-placed') continue
			const { name, uuid } = await source.query.any.getAttributes(warning.source)
			warnings.push(`${warning.code} ${name}`)
			notPlacedUuids.add(uuid ?? '')
		}
		expect(warnings.sort(), 'report').toEqual(testCase.warnings)
		// nor does it list the role's reference to what it does not place
		const references = await listVariableReferences({
			report: lastReport,
			sourceQuery: source.query,
		})
		const toNotPlaced = references.filter(function namesNotPlaced(uuid) {
			return notPlacedUuids.has(uuid)
		})
		expect(toNotPlaced, 'report').toEqual([])
		// what is not placed is listed on the application's instance, and only then
		const notPlaced = lastReport.instances.filter(
			(instance) => instance.satellitesNotPlaced !== undefined,
		)
		expect(notPlaced.length, 'report').toBe(testCase.warnings.length > 0 ? 1 : 0)
		expect(await listUnplacedVariableReferences(target.query), 'apply').toEqual([])
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The variables the role references a report lists name (by the uuid each names). */
async function listVariableReferences(params: {
	report: DiffReport
	sourceQuery: Core.Query<Config>
}): Promise<string[]> {
	const { report, sourceQuery } = params
	const named: string[] = []
	const pending: DiffNode[] = allGroups(report).flatMap(function nodesOf(group) {
		return [group.primary, ...group.companions]
	})
	while (pending.length > 0) {
		const node = pending.pop() as DiffNode
		pending.push(...node.children)
		if (node.tagName !== 'VariableRef' || !node.sourceRef) continue
		const uuid = await sourceQuery.any.getAttribute(node.sourceRef, { name: 'variableUuid' })
		named.push(uuid ?? '')
	}
	return named
}

/** The template and the anchor of a step placing something. */
async function rolePlacementOf(params: {
	step: Exclude<RoleStep, { project: unknown }>
	sourceQuery: Core.Query<Config>
}): Promise<LifecycleTarget> {
	const { step, sourceQuery } = params
	const level = { tagName: 'VoltageLevel', id: 'project-voltage-level' }
	if ('placeUnit' in step) {
		const ref = await findByName(sourceQuery, { tagName: 'Bay', name: step.placeUnit })
		return {
			verb: 'ssd',
			scenario: 'instantiate',
			sourceQuery,
			ref,
			anchor: level,
		} as LifecycleTarget
	}
	const ref = await findByName(sourceQuery, { tagName: 'Application', name: step.place })
	const anchor = step.onLevel ? level : { tagName: 'Bay', id: 'project-bay' }
	return { verb: 'asd', scenario: 'instantiate', sourceQuery, ref, anchor } as LifecycleTarget
}

/**
 * The project turns the variable the function the first application placed holds into the copy of another variable of
 * the template (one of no template reference), and drops the role's reference to it.
 */
async function retargetTheFunctionVariable(tx: Core.Transaction<Config>): Promise<void> {
	const [variable] = await tx.findByAttributes({ tagName: 'Variable', attributes: { name: 'VF' } })
	if (!variable) throw new Error('the first placement wrote the variable')
	const uuid = await tx.getAttribute(variable, { name: 'uuid' })
	for (const reference of await tx.getRecordsByTagName('VariableRef')) {
		const named = await tx.getAttribute(reference, { name: 'variableUuid' })
		if (named === uuid) await tx.delete(reference)
	}
	await tx.update(variable, { attributes: { name: 'VOTHER', templateUuid: 'vaway-source' } })
}

/** The project makes the variable applying to the function the first application placed apply to the bay instead. */
async function retargetTheSharedVariable(tx: Core.Transaction<Config>): Promise<void> {
	const [variable] = await tx.findByAttributes({
		tagName: 'Variable',
		attributes: { name: 'VSHARED' },
	})
	if (!variable) throw new Error('the first placement wrote the variable')
	const [bay] = await tx.findByAttributes({ tagName: 'Bay', attributes: { name: 'B1' } })
	if (!bay) throw new Error('the project holds its bay')
	const bayUuid = await tx.getAttribute(bay, { name: 'uuid' })
	for (const application of await tx.getRecordsByTagName('VariableApplyTo')) {
		if (application.parent?.id !== variable.id) continue
		await tx.update(application, {
			attributes: { element: 'S1/V1/B1', elementUuid: bayUuid ?? '' },
		})
	}
}

/** The project makes the variable applying to the function the first application placed apply to that function only. */
async function narrowTheSharedVariable(tx: Core.Transaction<Config>): Promise<void> {
	const [variable] = await tx.findByAttributes({
		tagName: 'Variable',
		attributes: { name: 'VSHARED' },
	})
	if (!variable) throw new Error('the first placement wrote the variable')
	const [bay] = await tx.findByAttributes({ tagName: 'Bay', attributes: { name: 'B1' } })
	const bayUuid = bay ? await tx.getAttribute(bay, { name: 'uuid' }) : undefined
	for (const application of await tx.getRecordsByTagName('VariableApplyTo')) {
		if (application.parent?.id !== variable.id) continue
		const named = await tx.getAttribute(application, { name: 'elementUuid' })
		if (named === bayUuid) await tx.delete(application)
	}
}

/** The project drops the variable applying to the function the first application placed, and the references to it. */
async function dropTheSharedVariable(tx: Core.Transaction<Config>): Promise<void> {
	const [variable] = await tx.findByAttributes({
		tagName: 'Variable',
		attributes: { name: 'VSHARED' },
	})
	if (!variable) throw new Error('the first placement wrote the variable')
	const uuid = await tx.getAttribute(variable, { name: 'uuid' })
	for (const reference of await tx.getRecordsByTagName('VariableRef')) {
		const named = await tx.getAttribute(reference, { name: 'variableUuid' })
		if (named === uuid) await tx.delete(reference)
	}
	await tx.delete(variable)
}

/** The template bay mapped onto the project's bay. */
const ontoTheProjectBay: DecisionMappings = new Map([
	['bay-s', { existing: { tagName: 'Bay', id: 'project-bay' } }],
])

/** The project drops the copy of the first of two variables of one template reference. */
async function dropTheFirstSibling(tx: Core.Transaction<Config>): Promise<void> {
	const [variable] = await tx.findByAttributes({ tagName: 'Variable', attributes: { name: 'VS1' } })
	if (!variable) throw new Error('the first placement wrote the variable')
	await tx.delete(variable)
}

/** The project drops the variable the function the first application placed holds, and the role's reference to it. */
async function dropTheFunctionVariable(tx: Core.Transaction<Config>): Promise<void> {
	const [variable] = await tx.findByAttributes({ tagName: 'Variable', attributes: { name: 'VF' } })
	if (!variable) throw new Error('the first placement wrote the variable')
	const uuid = await tx.getAttribute(variable, { name: 'uuid' })
	for (const reference of await tx.getRecordsByTagName('VariableRef')) {
		const named = await tx.getAttribute(reference, { name: 'variableUuid' })
		if (named === uuid) await tx.delete(reference)
	}
	await tx.delete(variable)
}

describe("lifecycle — a function a role's satellite applies to is not left out without the application", () => {
	type RefusalCase = SclTest.BaseXmlTestCase & { targetXml: string; skipped: string }
	const testCases: SclTest.TestCases<RefusalCase> = {
		'the bay placed, the function the variable applies to skipped, the application kept → refused, nothing written':
			{
				sourceXml: claimXml,
				targetXml: projectXml,
				skipped: 'alone-s',
				unexpectedQueries: ['//v2019C1:Variable', '//default:Bay[@name="B9"]'],
			},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<RefusalCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await placementOf({ verb: 'ssd', sourceQuery: source.query })
		const placement = {
			...lifecycle,
			scenario: 'instantiate',
			sourceQuery: source.query,
		} as LifecycleTarget
		const listed = await report(target.query, placement)
		const decisions: DecisionMap = new Map(
			allGroups(listed)
				.filter(function isSkipped(group) {
					return group.primary.sourceRef?.id === testCase.skipped
				})
				.map(function skip(group) {
					return [group.id, 'skip'] as const
				}),
		)
		expect(decisions.size).toBe(1)
		const applied = target.transaction(async function placeTheBay(tx) {
			await apply(tx, { ...placement, report: listed, resolution: { decisions } })
		})
		await expect(applied).rejects.toThrow('is skipped')
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The bay whose application composes a function of its level, a second application of the bay composing it too.
const twoComposersAboveXml = functionAboveXml.replace(
	`</eIEC61850-6-100:Application>`,
	[
		`</eIEC61850-6-100:Application>`,
		`<eIEC61850-6-100:Application name="Q_App" uuid="q-application-source" ${id}="q-application-s">`,
		`<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="q-root-role-s">`,
		`<eIEC61850-6-100:FunctionRoleContent ${id}="q-root-content-s">`,
		`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/LEVEL_F" functionUuid="level-f-source" ${id}="q-level-f-ref-s"/>`,
		`</eIEC61850-6-100:FunctionRoleContent>`,
		`</eIEC61850-6-100:FunctionRole>`,
		`</eIEC61850-6-100:Application>`,
	].join(''),
)

describe('lifecycle — a function outside the unit is placed as its own group is decided, whatever the applications composing it', () => {
	type OwnDecisionCase = SclTest.BaseXmlTestCase & { targetXml: string; skipped: string[] }
	const testCases: SclTest.TestCases<OwnDecisionCase> = {
		'the bay placed, its application skipped, the function of its level it composes kept → that function placed with what applies to it, the application not':
			{
				sourceXml: functionAboveXml,
				targetXml: projectXml,
				skipped: ['application-s'],
				expectedQueries: [
					'//v2019C1:Variable[@name="VABOVE"]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="LEVEL_F"]/@uuid]',
				],
				unexpectedQueries: ['//v2019C1:Application[@name="P_App"]'],
			},
		'the bay placed, the first of two applications composing the function of its level skipped → the second placed with that function and what applies to it':
			{
				sourceXml: twoComposersAboveXml,
				targetXml: projectXml,
				skipped: ['application-s'],
				expectedQueries: [
					'//v2019C1:Variable[@name="VABOVE"]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="LEVEL_F"]/@uuid]',
					'//v2019C1:Application[@name="Q_App"]//v2019C1:FunctionRef[@functionUuid=//default:Function[@name="LEVEL_F"]/@uuid]',
				],
				unexpectedQueries: ['//v2019C1:Application[@name="P_App"]'],
			},
		"the bay placed, the application composing the function of the level skipped, the first application's role referring to the variables that function holds and applying to it → that function placed with both, the role naming them":
			{
				sourceXml: laterFunctionTargetXml,
				targetXml: emptyLevelXml,
				skipped: ['b-s'],
				expectedQueries: [
					'//default:Function[@name="F_UP"]//v2019C1:Variable[@name="VUP"]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="F_UP"]/@uuid]',
					'//v2019C1:Variable[@name="VP4"]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="F_UP"]/@uuid]',
					'//v2019C1:Application[@name="APP_A"]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VUP"]/@uuid]',
					'//v2019C1:Application[@name="APP_A"]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VP4"]/@uuid]',
				],
				unexpectedQueries: ['//v2019C1:Application[@name="APP_B"]'],
			},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<OwnDecisionCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await placementOf({ verb: 'ssd', sourceQuery: source.query })
		const skipped = new Set(testCase.skipped)
		const { report: listed } = await reportAndApply({
			document: target,
			lifecycle: {
				...lifecycle,
				scenario: 'instantiate',
				sourceQuery: source.query,
			} as LifecycleTarget,
			decide: function skipTheApplications(report) {
				return new Map(
					allGroups(report)
						.filter(function isSkipped(group) {
							return skipped.has(group.primary.sourceRef?.id ?? '')
						})
						.map(function skip(group) {
							return [group.id, 'skip'] as const
						}),
				)
			},
		})
		// each function is its own group, depending on no application
		const functionGroups = allGroups(listed).filter(function isFunction(group) {
			return group.primary.tagName === 'Function'
		})
		expect(functionGroups.length, 'report').toBe(1)
		const applicationIds = new Set(
			allGroups(listed)
				.filter(function isApplication(group) {
					return group.primary.tagName === 'Application'
				})
				.map(function idOf(group) {
					return group.id
				}),
		)
		const composerDependencies = functionGroups.flatMap(function dependenciesOf(group) {
			return group.dependsOn.filter(function isApplication(dependency) {
				return applicationIds.has(dependency)
			})
		})
		expect(composerDependencies, 'report').toEqual([])
		expect(await listUnplacedVariableReferences(target.query), 'apply').toEqual([])
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('lifecycle — on an update, a function of the level an application composes is decided on its own', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase & { targetXml: string }> = {
		'the bay placed, the newer template describing its application and the function of its level, the application skipped → the function depends on nothing, its description written':
			{
				sourceXml: functionAboveXml,
				targetXml: projectXml,
				expectedQueries: ['//default:Function[@name="LEVEL_F"][@desc="newer function"]'],
				unexpectedQueries: ['//v2019C1:Application[@name="P_App"][@desc]'],
			},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<
		SclTest.BaseXmlTestCase & { targetXml: string }
	>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await placementOf({ verb: 'ssd', sourceQuery: source.query })
		const placement = (scenario: 'instantiate' | 'template'): LifecycleTarget =>
			({ ...lifecycle, scenario, sourceQuery: source.query }) as LifecycleTarget
		await reportAndApply({ document: target, lifecycle: placement('instantiate') })
		await source.transaction(async function describeTheNewerRevision(tx) {
			await tx.update(
				{ tagName: 'Application', id: 'application-s' },
				{ attributes: { desc: 'newer application' } },
			)
			await tx.update(
				{ tagName: 'Function', id: 'level-f-s' },
				{ attributes: { desc: 'newer function' } },
			)
		})
		const { report: updated } = await reportAndApply({
			document: target,
			lifecycle: placement('template'),
			decide: function skipTheApplication(listed) {
				return new Map(
					allGroups(listed)
						.filter((group) => group.primary.tagName === 'Application')
						.map((group) => [group.id, 'skip'] as const),
				)
			},
		})
		const functionGroups = allGroups(updated).filter(
			(group) => group.primary.tagName === 'Function',
		)
		expect(functionGroups.map((group) => group.dependsOn)).toEqual([[]])
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
