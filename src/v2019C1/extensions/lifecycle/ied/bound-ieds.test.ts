import realIedSpecifiedOnAnSIedXml from './fixtures/real-ied-specified-on-an-s-ied.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { BoundIed, BoundIedAssignment } from './bound-ieds.types'
import type { IedClassificationBasis, IedKind } from './classify-ieds.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
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

describe('boundIeds - which IED an LNode is tied to', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode whose lnUuid names an LN of IED A → A, the LNode among what it implements': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${A_PTOC1}" ${id}="ln-1"/>
								</Function>
							</Bay>
							<Bay name="Q02" ${id}="q02"/>
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
		'an LNode with no lnUuid whose name path names an LN of A → A implements it': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="2" ${id}="ln-1"/>
								</Function>
							</Bay>
							<Bay name="Q02" ${id}="q02"/>
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
		'an unassigned LNode whose DOS mappedLnUuid names an LN of A → A implements it': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="9" ${id}="ln-1">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:DOS name="Op" mappedLnUuid="${A_PTOC1}" mappedDoName="Op"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
							<Bay name="Q02" ${id}="q02"/>
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
		'an unassigned LNode with nothing mapped and no specified naming → no IED': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ln-1"/>
								</Function>
							</Bay>
							<Bay name="Q02" ${id}="q02"/>
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
		'an LNode implemented by real IED R whose specified naming names S-IED S → R implements, S specifies':
			{
				// ln-1 of bay Q01 is bound to real IED R (ICD source file) by its lnUuid, its LNodeSpecNaming names S-IED S
				sourceXml: realIedSpecifiedOnAnSIedXml,
				expected: [
					boundIed({
						ied: 'ied-r',
						name: 'R',
						kind: 'implemented',
						basis: 'provenance',
						inside: { implements: ['ln-1'], specifies: [] },
					}),
					boundIed({ ied: 'ied-s', name: 'S', inside: { implements: [], specifies: ['ln-1'] } }),
				],
			},
		'a specified naming naming no IED of the document → ignored': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ln-1">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming sIedName="GONE" sLdInst="LD1" sLnClass="PTOC" sLnInst="1"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
							<Bay name="Q02" ${id}="q02"/>
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
