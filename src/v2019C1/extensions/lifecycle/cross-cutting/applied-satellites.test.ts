import { resolveAppliedSatellites } from './applied-satellites'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<Scl.ElementsOf>

type TestCase = SclTest.BaseXmlTestCase & {
	expectedTags: string[]
	primaryRef?: Scl.Ref<Scl.ElementsOf>
}

describe('resolveAppliedSatellites (cross-cutting: applies to any element in the subtree)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'finds a Variable applying to the function LNode (not just the function root)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
							<eIEC61850-6-100:Variable name="Prefix" value="DVNAME" uuid="var-src-uuid" ${id}="var-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-src-uuid" ${id}="vat-s"/>
							</eIEC61850-6-100:Variable>
						</Private>
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
									<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedTags: ['Variable'],
		},

		'excludes a Variable that lives INSIDE the function subtree (internal, not a satellite)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
									<Private type="eIEC61850-6-100" ${id}="fn-priv-s">
										<eIEC61850-6-100:Variable name="Inner" uuid="inner-var-uuid" ${id}="inner-var-s">
											<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot" elementUuid="fn-src-uuid" ${id}="inner-vat-s"/>
										</eIEC61850-6-100:Variable>
									</Private>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedTags: [],
		},

		'finds a BehaviorDescription referencing the function LNode': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
							<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="bd-src-uuid" ${id}="bd-s">
								<eIEC61850-6-100:InputVar dataName="TEMPLATE/Prot/CSWI1" lnodeUuid="lnode-src-uuid" doName="Pos" ${id}="iv-s"/>
							</eIEC61850-6-100:BehaviorDescription>
						</Private>
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
									<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedTags: ['BehaviorDescription'],
		},

		'finds a Variable applying to a non-function element type (global target scope — Bay)': {
			primaryRef: bayRef,
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
							<eIEC61850-6-100:Variable name="BayTag" value="B1" uuid="var-src-uuid" ${id}="var-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE" elementUuid="bay-src-uuid" ${id}="vat-s"/>
							</eIEC61850-6-100:Variable>
						</Private>
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s" uuid="bay-src-uuid"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedTags: ['Variable'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const primaryRef = testCase.primaryRef ?? functionRef
		const satellites = await resolveAppliedSatellites(source.query, { primaryRef })
		expect(satellites.map((ref) => ref.tagName).sort()).toEqual(testCase.expectedTags.sort())
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** An application composing two functions; a variable of the bay applies to each, one lives inside the second. */
const composedXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-priv">
						<eIEC61850-6-100:Application name="App" uuid="app-uuid" ${id}="app">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="app-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="app-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/F1" functionUuid="f1-uuid" ${id}="ref-1"/>
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/F2" functionUuid="f2-uuid" ${id}="ref-2"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="ON_F1" uuid="on-f1-uuid" ${id}="on-f1">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F1" elementUuid="f1-uuid" ${id}="on-f1-apply"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:Variable name="ON_F2" uuid="on-f2-uuid" ${id}="on-f2">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F2" elementUuid="f2-uuid" ${id}="on-f2-apply"/>
						</eIEC61850-6-100:Variable>
					</Private>
					<Function name="F1" uuid="f1-uuid" ${id}="f1"/>
					<Function name="F2" uuid="f2-uuid" ${id}="f2">
						<Private type="eIEC61850-6-100" ${id}="f2-priv">
							<eIEC61850-6-100:Variable name="IN_F2" uuid="in-f2-uuid" ${id}="in-f2">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F1" elementUuid="f1-uuid" ${id}="in-f2-apply"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`
const applicationRef = { tagName: 'Application', id: 'app' } as Scl.Ref<Scl.ElementsOf>
const composedRefs = [
	{ tagName: 'Function', id: 'f1' },
	{ tagName: 'Function', id: 'f2' },
] as Scl.Ref<Scl.ElementsOf>[]

type ComposedCase = SclTest.BaseXmlTestCase & {
	composedRefs?: Scl.Ref<Scl.ElementsOf>[]
	leftOut?: string[]
	/** The satellites resolved, by record id, sorted. */
	expectedIds: string[]
}

describe('resolveAppliedSatellites with what the primary composes', () => {
	const testCases: SclTest.TestCases<ComposedCase> = {
		'none composed given → what applies to the application only: nothing': {
			sourceXml: composedXml,
			expectedIds: [],
		},
		'its functions given → what applies to each, but what lives inside one of them': {
			sourceXml: composedXml,
			composedRefs,
			expectedIds: ['on-f1', 'on-f2'],
		},
		'the second function left out → what applies to the first alone': {
			sourceXml: composedXml,
			composedRefs,
			leftOut: ['f2'],
			expectedIds: ['on-f1'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ComposedCase>): Promise<void> {
		const satellites = await resolveAppliedSatellites(source.query, {
			primaryRef: applicationRef,
			...(testCase.composedRefs ? { composedRefs: testCase.composedRefs } : {}),
			...(testCase.leftOut ? { leftOut: new Set(testCase.leftOut) } : {}),
		})
		expect(satellites.map((ref) => ref.id).sort()).toEqual(testCase.expectedIds)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
