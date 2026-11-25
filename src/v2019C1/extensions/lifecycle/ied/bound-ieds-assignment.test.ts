import anSIedAndARealIedXml from './fixtures/an-s-ied-and-a-real-ied.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { BoundIed, BoundIedAssignment } from './bound-ieds.types'
import type { IedClassificationBasis, IedKind } from './classify-ieds.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
const OTHER = 'a0000000-0000-4000-8000-000000000002'
const A_PTOC1 = 'b0000000-0000-4000-8000-000000000001'
const A_PTOC2 = 'b0000000-0000-4000-8000-000000000002'
const A_PTOC3 = 'b0000000-0000-4000-8000-000000000003'
const APP = 'e0000000-0000-4000-8000-000000000001'

type Expected = {
	ied: string
	name: string
	kind: IedKind
	basis: IedClassificationBasis
	assignment: BoundIedAssignment
	inside: { implements: string[]; specifies: string[] }
	outside: { implements: string[]; specifies: string[] }
}

const NONE = { implements: [], specifies: [] }

function boundIed(params: Partial<Expected> & Pick<Expected, 'ied' | 'name'>): Expected {
	return {
		kind: 'specification',
		basis: 'no-provenance',
		assignment: 'full',
		inside: NONE,
		outside: NONE,
		...params,
	}
}

type TestCase = SclTest.BaseXmlTestCase & { expected: Expected[] }

async function actBoundIeds({ source, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
	const read = source.query.lifecycle.boundIeds({ scopeRef: { tagName: 'Bay', id: 'q01' } })
	await expect(read.then(({ ieds }) => ieds.map(summaryOf))).resolves.toEqual(testCase.expected)
}

/** What a case compares of a bound IED: ids instead of refs. */
function summaryOf(entry: BoundIed): Expected {
	return {
		ied: entry.ied.id,
		name: entry.name,
		kind: entry.kind,
		basis: entry.basis,
		assignment: entry.assignment,
		inside: {
			implements: entry.inside.implements.map((lnode) => lnode.id),
			specifies: entry.inside.specifies.map((lnode) => lnode.id),
		},
		outside: {
			implements: entry.outside.implements.map((lnode) => lnode.id),
			specifies: entry.outside.specifies.map((lnode) => lnode.id),
		},
	}
}

describe('boundIeds - carried or outside, full or shared', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'an IED tied to two LNodes of the scope and one of another bay → shared, the other one outside':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="2" lnUuid="${A_PTOC2}" ${id}="ln-2"/>
								</Function>
							</Bay>
							<Bay name="Q02" ${id}="q02">
								<Function name="OTHER" uuid="${OTHER}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="3" lnUuid="${A_PTOC3}" ${id}="ln-3"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="A" ${id}="ied-a">
						<AccessPoint name="AP1">
							<Server>
								<Authentication/>
								<LDevice inst="LD1">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
									<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${A_PTOC1}"/>
									<LN lnClass="PTOC" inst="2" prefix="" lnType="PTOC_T" uuid="${A_PTOC2}"/>
									<LN lnClass="PTOC" inst="3" prefix="" lnType="PTOC_T" uuid="${A_PTOC3}"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
				expected: [
					boundIed({
						ied: 'ied-a',
						name: 'A',
						assignment: 'shared',
						inside: { implements: ['ln-1', 'ln-2'], specifies: [] },
						outside: { implements: ['ln-3'], specifies: [] },
					}),
				],
			},
		'an IED tied only to LNodes of the scope → full, nothing outside': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
								</Function>
							</Bay>
							<Bay name="Q02" ${id}="q02">
								<Function name="OTHER" uuid="${OTHER}">
									<LNode iedName="None" lnClass="PTOC" lnInst="3" ${id}="ln-3"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="A" ${id}="ied-a">
						<AccessPoint name="AP1">
							<Server>
								<Authentication/>
								<LDevice inst="LD1">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
									<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${A_PTOC1}"/>
									<LN lnClass="PTOC" inst="2" prefix="" lnType="PTOC_T" uuid="${A_PTOC2}"/>
									<LN lnClass="PTOC" inst="3" prefix="" lnType="PTOC_T" uuid="${A_PTOC3}"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			expected: [
				boundIed({ ied: 'ied-a', name: 'A', inside: { implements: ['ln-1'], specifies: [] } }),
			],
		},
		'an LNode of a function an application of the scope composes, sitting in another bay → carried':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:Application name="App" type="DCS" uuid="${APP}">
										<eIEC61850-6-100:FunctionRole name="ROOT">
											<eIEC61850-6-100:FunctionRoleContent>
												<eIEC61850-6-100:FunctionRef function="S1/E1/Q02/OTHER" functionUuid="${OTHER}"/>
											</eIEC61850-6-100:FunctionRoleContent>
										</eIEC61850-6-100:FunctionRole>
									</eIEC61850-6-100:Application>
								</Private>
							</Bay>
							<Bay name="Q02" ${id}="q02">
								<Function name="OTHER" uuid="${OTHER}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="3" lnUuid="${A_PTOC3}" ${id}="ln-3"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="A" ${id}="ied-a">
						<AccessPoint name="AP1">
							<Server>
								<Authentication/>
								<LDevice inst="LD1">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
									<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${A_PTOC1}"/>
									<LN lnClass="PTOC" inst="2" prefix="" lnType="PTOC_T" uuid="${A_PTOC2}"/>
									<LN lnClass="PTOC" inst="3" prefix="" lnType="PTOC_T" uuid="${A_PTOC3}"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
				expected: [
					boundIed({ ied: 'ied-a', name: 'A', inside: { implements: ['ln-3'], specifies: [] } }),
				],
			},
		'a real IED with an ICD source file and an S-IED → each with the kind and basis classifyIeds gives':
			{
				// bay Q01 holds ln-1 bound to S-IED S and ln-2 bound to real IED R (ICD source file); S comes first in the document
				sourceXml: anSIedAndARealIedXml,
				expected: [
					boundIed({ ied: 'ied-s', name: 'S', inside: { implements: ['ln-1'], specifies: [] } }),
					boundIed({
						ied: 'ied-r',
						name: 'R',
						kind: 'implemented',
						basis: 'provenance',
						inside: { implements: ['ln-2'], specifies: [] },
					}),
				],
			},
		'an LNode whose lnUuid names an LN kept inside a Private → no IED, vendor payload implements nothing':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="V" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
								</Function>
							</Bay>
							<Bay name="Q02" ${id}="q02"/>
						</VoltageLevel>
					</Substation>
					<IED name="V" ${id}="ied-v">
						<Private type="vendor">
							<AccessPoint name="AP1">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
										<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${A_PTOC1}"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</Private>
					</IED>
				</SCL>
			`,
				allowIncoherentReferences:
					'the lnUuid names an LN inside a Private only: what the case reports',
				expected: [],
			},
		'a scope with no LNode tied to an IED → no IED': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01"/>
							<Bay name="Q02" ${id}="q02">
								<Function name="OTHER" uuid="${OTHER}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="3" lnUuid="${A_PTOC3}" ${id}="ln-3"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="A" ${id}="ied-a">
						<AccessPoint name="AP1">
							<Server>
								<Authentication/>
								<LDevice inst="LD1">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
									<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${A_PTOC1}"/>
									<LN lnClass="PTOC" inst="2" prefix="" lnType="PTOC_T" uuid="${A_PTOC2}"/>
									<LN lnClass="PTOC" inst="3" prefix="" lnType="PTOC_T" uuid="${A_PTOC3}"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({ testCases, act: actBoundIeds })
})
