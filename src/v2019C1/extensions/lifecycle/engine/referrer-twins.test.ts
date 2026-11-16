import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

describe('pairing of identical data-flow references', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		sourceRoot: Scl.Ref<Scl.ElementsOf>
		instanceRoot: Scl.Ref<Scl.ElementsOf>
		/** The instance ids of the nodes paired among identical references, as `<instance id> <- <source id>`. */
		expectedTwins: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the same data set entry twice in the template and the instance → paired in order, both said paired among identical ones':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<DataSet name="DS1" uuid="ds-src" ${id}="ds-s">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-src" ${id}="fcda-1-s"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-src" ${id}="fcda-2-s"/>
											</DataSet>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-s">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
											<DataSet name="DS1" uuid="ds-ins" templateUuid="ds-src" ${id}="ds-t">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-ins" ${id}="fcda-1-t"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-ins" ${id}="fcda-2-t"/>
											</DataSet>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-t">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
						</DataTypeTemplates>
					</SCL>
				`,
				sourceRoot: sourceRootRef,
				instanceRoot: instanceRootRef,
				expectedTwins: ['fcda-1-t <- fcda-1-s', 'fcda-2-t <- fcda-2-s'],
			},
		'an application composing two instances of one template function → its two function references are no twins':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="asd">
						<Substation name="TEMPLATE" ${id}="asd-substation">
							<Private type="eIEC61850-6-100" ${id}="asd-substation-private">
								<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${id}="application-source">
									<eIEC61850-6-100:FunctionRole name="ROOT" uuid="role-uuid" ${id}="role-source">
										<eIEC61850-6-100:FunctionRoleContent ${id}="role-content-source">
											<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="function-ref-source"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
								</eIEC61850-6-100:Application>
							</Private>
							<VoltageLevel name="TEMPLATE" ${id}="asd-voltage-level">
								<Bay name="TEMPLATE" ${id}="asd-bay">
									<Function name="Prot" uuid="function-uuid" ${id}="function-source"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				// both functions are instances of the template's Prot: the references name two elements, not one
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Substation name="S1" ${id}="project-substation">
							<VoltageLevel name="V1" ${id}="project-voltage-level">
								<Bay name="B1" ${id}="project-bay">
									<Private type="eIEC61850-6-100" ${id}="project-bay-private">
										<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-instance-uuid" templateUuid="application-uuid" ${id}="application-instance">
											<eIEC61850-6-100:FunctionRole name="ROOT" uuid="role-instance-uuid" templateUuid="role-uuid" ${id}="role-instance">
												<eIEC61850-6-100:FunctionRoleContent ${id}="role-content-instance">
													<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="first-function-uuid" ${id}="first-function-ref"/>
													<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot_1" functionUuid="second-function-uuid" ${id}="second-function-ref"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="first-function-uuid" templateUuid="function-uuid" ${id}="first-function"/>
									<Function name="Prot_1" uuid="second-function-uuid" templateUuid="function-uuid" ${id}="second-function"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceRoot: { tagName: 'Application', id: 'application-source' } as Scl.Ref<Scl.ElementsOf>,
				instanceRoot: {
					tagName: 'Application',
					id: 'application-instance',
				} as Scl.Ref<Scl.ElementsOf>,
				expectedTwins: [],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef: testCase.sourceRoot,
			instanceRootRef: testCase.instanceRoot,
			diffPolicy: readDiffPolicy({}),
		})
		expect(twinsOf(report.root).sort()).toEqual(testCase.expectedTwins)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The nodes of a tree paired among identical references, as `<instance id> <- <source id>`. */
function twinsOf(node: DiffNode): string[] {
	const own = node.pairedAmongTwins ? [`${node.instanceRef?.id} <- ${node.sourceRef?.id}`] : []
	return [...own, ...node.children.flatMap(twinsOf)]
}
