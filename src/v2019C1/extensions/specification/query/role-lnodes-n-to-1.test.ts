import { roleLNodes } from './role-lnodes'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
const R_PTOC1 = 'b0000000-0000-4000-8000-000000000001'
const S_PTOC1 = 'b0000000-0000-4000-8000-000000000002'
const GONE = 'b0000000-0000-4000-8000-0000000000ff'

/** An LNode implemented with others by one LN: its data names the LN, unless its own lnUuid decides. */
describe('roleLNodes - an LNode implemented through its data', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		implementers: { ied: string; kind: IedKind; lnodes: string[] }[]
		unimplemented: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'no iedName, its DOS mappedLnUuid naming an LN of R → under R': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT" functionUuid="${PROT}"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode lnClass="PTOC" lnInst="2" ${id}="ptoc2">
										<!-- no iedName -->
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:DOS name="Op" mappedLnUuid="${R_PTOC1}" mappedDoName="Op"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="R" ${id}="ied-r">
						<IEDSourceFiles><SclFileReference fileType="ICD" fileName="r.icd"/></IEDSourceFiles>
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="PROT"><LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/><LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${R_PTOC1}"/></LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
			implementers: [{ ied: 'ied-r', kind: 'implemented', lnodes: ['ptoc2'] }],
			unimplemented: [],
		},
		'its DOS naming an LN of specification IED S, its DAS one of real IED R → under R': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT" functionUuid="${PROT}"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="2" ${id}="ptoc2">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:DOS name="Op" mappedLnUuid="${S_PTOC1}" mappedDoName="Op">
												<eIEC61850-6-100:DAS name="general" mappedLnUuid="${R_PTOC1}" mappedDaName="Op.general"/>
											</eIEC61850-6-100:DOS>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="R" ${id}="ied-r">
						<IEDSourceFiles><SclFileReference fileType="ICD" fileName="r.icd"/></IEDSourceFiles>
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="PROT"><LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/><LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${R_PTOC1}"/></LDevice>
						</Server></AccessPoint>
					</IED>
					<IED name="S" ${id}="ied-s">
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="PROT"><LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/><LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${S_PTOC1}"/></LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
			implementers: [{ ied: 'ied-r', kind: 'implemented', lnodes: ['ptoc2'] }],
			unimplemented: [],
		},
		'an lnUuid naming nothing, its DOS naming an LN of R → unimplemented, the lnUuid decides': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT" functionUuid="${PROT}"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="2" lnUuid="${GONE}" ${id}="ptoc2">
										<!-- no LN carries the GONE uuid -->
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:DOS name="Op" mappedLnUuid="${R_PTOC1}" mappedDoName="Op"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="R" ${id}="ied-r">
						<IEDSourceFiles><SclFileReference fileType="ICD" fileName="r.icd"/></IEDSourceFiles>
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="PROT"><LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/><LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${R_PTOC1}"/></LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
			allowIncoherentReferences: 'the lnUuid names nothing: that is what the case reports',
			implementers: [],
			unimplemented: ['ptoc2'],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await roleLNodes(source.query, {
				allocationRole: { tagName: 'AllocationRole', id: 'role' },
			})
			expect({
				implementers: result.implementers.map((implementer) => ({
					ied: implementer.ied.id,
					kind: implementer.kind,
					lnodes: implementer.lnodes.map((lnode) => lnode.id),
				})),
				unimplemented: result.unimplemented.map((lnode) => lnode.id),
			}).toEqual({ implementers: testCase.implementers, unimplemented: testCase.unimplemented })
		},
	})
})
