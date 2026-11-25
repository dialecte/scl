import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { BoundIed, BoundIedAssignment, BoundIedsParams } from './bound-ieds.types'
import type { IedClassificationBasis, IedKind } from './classify-ieds.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
const OTHER = 'a0000000-0000-4000-8000-000000000002'
const A_PTOC1 = 'b0000000-0000-4000-8000-000000000001'
const A_PTOC2 = 'b0000000-0000-4000-8000-000000000002'
const A_PTOC3 = 'b0000000-0000-4000-8000-000000000003'

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

type TestCase = SclTest.BaseXmlTestCase & {
	scopeRef: BoundIedsParams['scopeRef']
	expected: Expected[]
}

async function actBoundIeds({ source, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
	const read = source.query.lifecycle.boundIeds({ scopeRef: testCase.scopeRef })
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

const BAY = { tagName: 'Bay', id: 'q01' } as const

describe('boundIeds - what the frame of the scope writes', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode held by the voltage level above the bay → carried, the extract writes the own content of that level':
			{
				scopeRef: BAY,
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl">
						<Substation name="S1">
							<VoltageLevel name="E1">
								<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="2" lnUuid="${A_PTOC2}" ${id}="ln-2"/>
								<Bay name="Q01" ${id}="q01"/>
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
					boundIed({ ied: 'ied-a', name: 'A', inside: { implements: ['ln-2'], specifies: [] } }),
				],
			},
		'an LNode of a function of the voltage level above the bay → outside, the extract places the functions of the bay only':
			{
				scopeRef: BAY,
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl">
						<Substation name="S1">
							<VoltageLevel name="E1">
								<Bay name="Q01" ${id}="q01">
									<Function name="PROT" uuid="${PROT}">
										<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
									</Function>
								</Bay>
								<Function name="VLF" uuid="${OTHER}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="3" lnUuid="${A_PTOC3}" ${id}="ln-3"/>
								</Function>
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
						inside: { implements: ['ln-1'], specifies: [] },
						outside: { implements: ['ln-3'], specifies: [] },
					}),
				],
			},
		'an LNode under a circuit breaker of the bay → carried with the equipment of the bay': {
			scopeRef: BAY,
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<ConductingEquipment name="QA1" type="CBR">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
								</ConductingEquipment>
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
		'an LNode held directly by the bay beside the scope → outside, the extract writes only the levels above the bay':
			{
				scopeRef: BAY,
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
								</Function>
							</Bay>
							<Bay name="Q02">
								<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="3" lnUuid="${A_PTOC3}" ${id}="ln-3"/>
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
						inside: { implements: ['ln-1'], specifies: [] },
						outside: { implements: ['ln-3'], specifies: [] },
					}),
				],
			},
		'a voltage level as the scope → the LNodes of all its bays carried': {
			scopeRef: { tagName: 'VoltageLevel', id: 'e1' },
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1" ${id}="e1">
							<Bay name="Q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
								</Function>
							</Bay>
							<Bay name="Q02">
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
					inside: { implements: ['ln-1', 'ln-3'], specifies: [] },
				}),
			],
		},
		'an LNode inside a Private of the bay → ignored, vendor payload': {
			scopeRef: BAY,
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Private type="vendor">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
								</Private>
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
