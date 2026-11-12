import { describe, expect } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleVerb } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ReportWarning } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The case's document is the project; the template is opened beside it and placed by `verb` in the project's bay. */
type PlacementTestCase = SclTest.BaseXmlTestCase & {
	templateXml: string
	verb: LifecycleVerb
	ref: Scl.Ref<Scl.ElementsOf>
	/** Where it is placed. Default: the project's bay. */
	anchor?: Scl.Ref<Scl.ElementsOf>
	expectedWarnings: ReportWarning[]
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/**
 * A reference of what a placement places that names an element of the template it does not place would name nothing in
 * the project: it is not written, and the report tells of it.
 */
describe('report - a reference by uuid to what the placement does not place', () => {
	const testCases: SclTest.TestCases<PlacementTestCase> = {
		"one application placed, its role allocating the other application's function too → that allocation warned":
			{
				verb: 'asd',
				ref: { tagName: 'Application', id: 'application-1-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Header id="asd-header" uuid="asd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source-uuid" ${id}="role-s">
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="role-prot-ref-s"/>
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="role-ctrl-ref-s"/>
										</eIEC61850-6-100:AllocationRole>
										<eIEC61850-6-100:Application name="Protection" type="DCS" uuid="application-1-source-uuid" ${id}="application-1-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-1-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-1-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="application-1-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
											<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source-uuid" ${id}="role-ref-1-s"/>
										</eIEC61850-6-100:Application>
										<!-- the other application: not placed -->
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-2-source-uuid" ${id}="application-2-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-2-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-2-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="application-2-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
											<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source-uuid" ${id}="role-ref-2-s"/>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s"/>
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'FunctionRef', id: 'role-ctrl-ref-s' },
						attribute: 'function',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
				],
			},
		'one function placed, its category classifying another function too → that classification warned':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
											<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="category-prot-ref-s"/>
											<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="category-ctrl-ref-s"/>
										</eIEC61850-6-100:FunctionCategory>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s"/>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'FunctionCatRef', id: 'category-ctrl-ref-s' },
						attribute: 'function',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
				],
			},
		'one function placed, a variable applying to it and to another function → that application warned':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
											<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source-uuid" ${id}="pickup-prot-s"/>
											<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
										</eIEC61850-6-100:Variable>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s"/>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'VariableApplyTo', id: 'pickup-ctrl-s' },
						attribute: 'element',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
				],
			},
		'one function placed, its category classifying another function, its breaker on a node the template does not hold → both warned':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
											<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="category-prot-ref-s"/>
											<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="category-ctrl-ref-s"/>
										</eIEC61850-6-100:FunctionCategory>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<ConductingEquipment name="CBR1" type="CBR" uuid="breaker-source-uuid" ${id}="breaker-s">
											<!-- Bay_HV is not in the template: this path names nothing it holds -->
											<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_HV/L2" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_HV" cNodeName="L2" ${id}="terminal-s"/>
										</ConductingEquipment>
									</Function>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'FunctionCatRef', id: 'category-ctrl-ref-s' },
						attribute: 'function',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
					{
						code: 'reference-not-placed',
						reference: { tagName: 'Terminal', id: 'terminal-s' },
						attribute: 'connectivityNode',
						path: 'TEMPLATE/TEMPLATE/Bay_HV/L2',
					},
				],
			},
		"one application placed, its role allocating the other application's function, its function's breaker on a node the template does not hold → both warned":
			{
				verb: 'asd',
				ref: { tagName: 'Application', id: 'application-1-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Header id="asd-header" uuid="asd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source-uuid" ${id}="role-s">
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="role-prot-ref-s"/>
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="role-ctrl-ref-s"/>
										</eIEC61850-6-100:AllocationRole>
										<eIEC61850-6-100:Application name="Protection" type="DCS" uuid="application-1-source-uuid" ${id}="application-1-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-1-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-1-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="application-1-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
											<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source-uuid" ${id}="role-ref-1-s"/>
										</eIEC61850-6-100:Application>
										<!-- the other application: not placed -->
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-2-source-uuid" ${id}="application-2-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-2-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-2-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="application-2-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
											<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source-uuid" ${id}="role-ref-2-s"/>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<ConductingEquipment name="CBR1" type="CBR" uuid="breaker-source-uuid" ${id}="breaker-s">
											<!-- Bay_HV is not in the template: this path names nothing it holds -->
											<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_HV/L2" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_HV" cNodeName="L2" ${id}="terminal-s"/>
										</ConductingEquipment>
									</Function>
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'FunctionRef', id: 'role-ctrl-ref-s' },
						attribute: 'function',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
					{
						code: 'reference-not-placed',
						reference: { tagName: 'Terminal', id: 'terminal-s' },
						attribute: 'connectivityNode',
						path: 'TEMPLATE/TEMPLATE/Bay_HV/L2',
					},
				],
			},
		"one application placed, a variable its function holds applying to it and to the other application's function → that application warned":
			{
				verb: 'asd',
				ref: { tagName: 'Application', id: 'application-1-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Header id="asd-header" uuid="asd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:Application name="Protection" type="DCS" uuid="application-1-source-uuid" ${id}="application-1-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-1-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-1-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="application-1-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
										<!-- the other application: not placed -->
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-2-source-uuid" ${id}="application-2-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-2-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-2-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="application-2-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<Private type="eIEC61850-6-100" ${id}="prot-private-s">
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source-uuid" ${id}="pickup-prot-s"/>
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
											</eIEC61850-6-100:Variable>
										</Private>
									</Function>
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'VariableApplyTo', id: 'pickup-ctrl-s' },
						attribute: 'element',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
				],
			},
		"one application placed, its role referring to a variable applying to the bay and to the other application's function → that application warned":
			{
				verb: 'asd',
				ref: { tagName: 'Application', id: 'application-1-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Header id="asd-header" uuid="asd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" uuid="bay-source-uuid" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
											<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE" elementUuid="bay-source-uuid" ${id}="pickup-bay-s"/>
											<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
										</eIEC61850-6-100:Variable>
										<eIEC61850-6-100:Application name="Protection" type="DCS" uuid="application-1-source-uuid" ${id}="application-1-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-1-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-1-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="application-1-function-ref-s"/>
													<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/TEMPLATE/PICKUP" variableUuid="pickup-source-uuid" ${id}="application-1-variable-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
										<!-- the other application: not placed -->
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-2-source-uuid" ${id}="application-2-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-2-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-2-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="application-2-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s"/>
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'VariableApplyTo', id: 'pickup-ctrl-s' },
						attribute: 'element',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
				],
			},
		'one substation placed, a variable its bay holds applying to its function and to one of another substation → that application warned':
			{
				verb: 'ssd',
				ref: { tagName: 'Substation', id: 'substation-1-s' },
				anchor: { tagName: 'SCL', id: 'scd' } as Scl.Ref<Scl.ElementsOf>,
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="S2" uuid="substation-1-source-uuid" ${id}="substation-1-s">
							<VoltageLevel name="V2" uuid="voltage-level-1-source-uuid" ${id}="voltage-level-1-s">
								<Bay name="B2" uuid="bay-1-source-uuid" ${id}="bay-1-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
											<eIEC61850-6-100:VariableApplyTo element="S2/V2/B2/Prot" elementUuid="prot-source-uuid" ${id}="pickup-prot-s"/>
											<eIEC61850-6-100:VariableApplyTo element="S3/V3/B3/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
										</eIEC61850-6-100:Variable>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
						<!-- the other substation: not placed -->
						<Substation name="S3" uuid="substation-2-source-uuid" ${id}="substation-2-s">
							<VoltageLevel name="V3" uuid="voltage-level-2-source-uuid" ${id}="voltage-level-2-s">
								<Bay name="B3" uuid="bay-2-source-uuid" ${id}="bay-2-s">
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'VariableApplyTo', id: 'pickup-ctrl-s' },
						attribute: 'element',
						path: 'S3/V3/B3/Ctrl',
					},
				],
			},
		'one function placed, a variable it holds applying to it and to another function → that application warned':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<Private type="eIEC61850-6-100" ${id}="prot-private-s">
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source-uuid" ${id}="pickup-prot-s"/>
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
											</eIEC61850-6-100:Variable>
										</Private>
									</Function>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'VariableApplyTo', id: 'pickup-ctrl-s' },
						attribute: 'element',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
				],
			},
		'one function placed, a variable it holds applying only to another function → not written, that application warned':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<Private type="eIEC61850-6-100" ${id}="prot-private-s">
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
											</eIEC61850-6-100:Variable>
										</Private>
									</Function>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'VariableApplyTo', id: 'pickup-ctrl-s' },
						attribute: 'element',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
				],
			},
		"one application placed, a variable its function holds applying only to the other application's function → not written, that application warned":
			{
				verb: 'asd',
				ref: { tagName: 'Application', id: 'application-1-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Header id="asd-header" uuid="asd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="private-s">
										<eIEC61850-6-100:Application name="Protection" type="DCS" uuid="application-1-source-uuid" ${id}="application-1-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-1-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-1-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-source-uuid" ${id}="application-1-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
										<!-- the other application: not placed -->
										<eIEC61850-6-100:Application name="Control" type="DCS" uuid="application-2-source-uuid" ${id}="application-2-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-2-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-2-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-source-uuid" ${id}="application-2-function-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<Private type="eIEC61850-6-100" ${id}="prot-private-s">
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="ctrl-source-uuid" ${id}="pickup-ctrl-s"/>
											</eIEC61850-6-100:Variable>
										</Private>
									</Function>
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'VariableApplyTo', id: 'pickup-ctrl-s' },
						attribute: 'element',
						path: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					},
				],
			},
		'one function placed, a variable it holds applying to it and to the bay it lands on → nothing warned':
			{
				verb: 'fsd',
				ref: { tagName: 'Function', id: 'prot-s' },
				templateXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="fsd-header" uuid="fsd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
								<Bay name="TEMPLATE" uuid="bay-source-uuid" ${id}="bay-s">
									<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
										<Private type="eIEC61850-6-100" ${id}="prot-private-s">
											<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="prot-source-uuid" ${id}="pickup-prot-s"/>
												<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE" elementUuid="bay-source-uuid" ${id}="pickup-bay-s"/>
											</eIEC61850-6-100:Variable>
										</Private>
									</Function>
									<!-- the other function: not placed -->
									<Function name="Ctrl" uuid="ctrl-source-uuid" ${id}="ctrl-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceXml: projectXml,
				expectedWarnings: [],
			},
	}

	async function act({
		testCase,
		project,
		source,
	}: SclTest.ActParams<PlacementTestCase>): Promise<void> {
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
		})
		const reported = await report(source.query, {
			verb: testCase.verb,
			scenario: 'instantiate',
			sourceQuery: template.query,
			ref: testCase.ref,
			anchor: testCase.anchor ?? { tagName: 'Bay', id: 'bay-t' },
		} as Parameters<typeof report>[1])
		// warned once each, in no particular order
		const warnings = reported.warnings ?? []
		expect(warnings).toHaveLength(testCase.expectedWarnings.length)
		expect(warnings).toEqual(expect.arrayContaining(testCase.expectedWarnings))
	}

	runSclTestCases.withoutExport({ testCases, act })
})
