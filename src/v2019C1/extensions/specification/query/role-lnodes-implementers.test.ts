import specificationIedS from './fixtures/role-split-over-real-r-and-specification-s.xml?raw'
import r2BeforeR from './fixtures/role-split-over-two-real-ieds.xml?raw'
import rPtoc1BoundPtrc1Free from './fixtures/role-with-r-implementing-ptoc1.xml?raw'
import { roleLNodes } from './role-lnodes'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
const R_PTOC1 = 'b0000000-0000-4000-8000-000000000001'

/** Who implements a role's LNodes: grouped by IED in document order, each with its kind; the rest unimplemented. */
describe('roleLNodes - who implements the role', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		implementers: { ied: string; name: string; kind: IedKind; lnodes: string[] }[]
		unimplemented: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'PTOC1 bound to real IED R by lnUuid, PTRC1 unbound → R implements PTOC1, PTRC1 unimplemented':
			{
				// R holds an ICD source file and the LN PTOC1 names by lnUuid; PTRC1 carries iedName None
				sourceXml: rPtoc1BoundPtrc1Free,
				implementers: [{ ied: 'ied-r', name: 'R', kind: 'implemented', lnodes: ['ptoc1'] }],
				unimplemented: ['ptrc1'],
			},
		'PTRC1 bound to specification IED S → R and S each with its LNode and kind': {
			// as above, and S (no source file) holds the LN PTRC1 names by lnUuid
			sourceXml: specificationIedS,
			implementers: [
				{ ied: 'ied-r', name: 'R', kind: 'implemented', lnodes: ['ptoc1'] },
				{ ied: 'ied-s', name: 'S', kind: 'specification', lnodes: ['ptrc1'] },
			],
			unimplemented: [],
		},
		'two real IEDs, R2 before R in the document → both listed, in IED document order': {
			// PTOC1 bound to R, PTRC1 bound to R2; R2 stands before R
			sourceXml: r2BeforeR,
			implementers: [
				{ ied: 'ied-r2', name: 'R2', kind: 'implemented', lnodes: ['ptrc1'] },
				{ ied: 'ied-r', name: 'R', kind: 'implemented', lnodes: ['ptoc1'] },
			],
			unimplemented: [],
		},
		'PTOC1 mapped to R by its names only → R implements it': {
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
									<LNode iedName="R" ldInst="PROT" prefix="" lnClass="PTOC" lnInst="1" ${id}="ptoc1"/>
									<!-- no lnUuid: the name path names R's LN -->
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="R" ${id}="ied-r">
						<IEDSourceFiles><SclFileReference fileType="ICD" fileName="r.icd"/></IEDSourceFiles>
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="PROT">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
								<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T"/>
							</LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
			implementers: [{ ied: 'ied-r', name: 'R', kind: 'implemented', lnodes: ['ptoc1'] }],
			unimplemented: [],
		},
		'PTOC1 implemented N to 1, iedName None and its DOS mappedLnUuid naming an LN of R → under R': {
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
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ptoc1">
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
							<LDevice inst="PROT">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
								<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${R_PTOC1}"/>
							</LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
			implementers: [{ ied: 'ied-r', name: 'R', kind: 'implemented', lnodes: ['ptoc1'] }],
			unimplemented: [],
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
					name: implementer.name,
					kind: implementer.kind,
					lnodes: implementer.lnodes.map((lnode) => lnode.id),
				})),
				unimplemented: result.unimplemented.map((lnode) => lnode.id),
			}).toEqual({ implementers: testCase.implementers, unimplemented: testCase.unimplemented })
		},
	})
})

describe('roleLNodes - an unknown role', () => {
	it('a role the document does not hold → ELEMENT_NOT_FOUND', async () => {
		const { source } = await createSclTestProject({ sourceXml: rPtoc1BoundPtrc1Free })

		await expect(
			roleLNodes(source.document.query, {
				allocationRole: { tagName: 'AllocationRole', id: 'no-such-role' },
			}),
		).rejects.toMatchObject({ cause: { key: 'ELEMENT_NOT_FOUND' } })
	})
})
