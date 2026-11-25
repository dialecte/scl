import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { BoundIed, BoundIedAssignment, BoundIedsParams } from './bound-ieds.types'
import type { IedClassificationBasis, IedKind } from './classify-ieds.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
const OTHER = 'a0000000-0000-4000-8000-000000000002'
const S_PTOC1 = 'd0000000-0000-4000-8000-000000000001'

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

describe('boundIeds - the S-IED an LNode is specified on', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode bound to S-IED S whose specified naming names S → listed once, as implemented': {
			scopeRef: BAY,
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="S" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${S_PTOC1}" ${id}="ln-1">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming sIedName="S" sLdInst="LD1" sLnClass="PTOC" sLnInst="1"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="S" ${id}="ied-s">
						<AccessPoint name="AP1">
							<Server>
								<Authentication/>
								<LDevice inst="LD1">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
									<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${S_PTOC1}"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			expected: [
				boundIed({ ied: 'ied-s', name: 'S', inside: { implements: ['ln-1'], specifies: [] } }),
			],
		},
		'an unassigned LNode specified on S-IED S → S specifies it': {
			scopeRef: BAY,
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ln-1">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming sIedName="S" sLdInst="LD1" sLnClass="PTOC" sLnInst="1"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="S" ${id}="ied-s">
						<AccessPoint name="AP1">
							<Server>
								<Authentication/>
								<LDevice inst="LD1">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
									<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${S_PTOC1}"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			expected: [
				boundIed({ ied: 'ied-s', name: 'S', inside: { implements: [], specifies: ['ln-1'] } }),
			],
		},
		'an S-IED specified on an LNode of the bay and on one of another bay → shared, the other one outside':
			{
				scopeRef: BAY,
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<VoltageLevel name="E1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ln-1">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming sIedName="S" sLdInst="LD1" sLnClass="PTOC" sLnInst="1"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
							<Bay name="Q02">
								<Function name="OTHER" uuid="${OTHER}">
									<LNode iedName="None" lnClass="PTOC" lnInst="3" ${id}="ln-3">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming sIedName="S" sLdInst="LD1" sLnClass="PTOC" sLnInst="1"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="S" ${id}="ied-s">
						<AccessPoint name="AP1">
							<Server>
								<Authentication/>
								<LDevice inst="LD1">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
									<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${S_PTOC1}"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
				expected: [
					boundIed({
						ied: 'ied-s',
						name: 'S',
						assignment: 'shared',
						inside: { implements: [], specifies: ['ln-1'] },
						outside: { implements: [], specifies: ['ln-3'] },
					}),
				],
			},
	}

	runSclTestCases.withoutExport<TestCase>({ testCases, act: actBoundIeds })
})
