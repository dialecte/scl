import { reportAsd } from './report-asd'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// ASD rev2 (source): same uuids, Application `type` + composed Function `desc` bumped.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-v2">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS2" uuid="app-src-uuid" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" desc="rev2" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

// ASD rev1 (target): identical uuids, no templateUuid, `type="DCS"`, `desc="rev1"`.
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="asd-v1">
		<Substation name="TEMPLATE" ${id}="sub-t">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-t">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-t">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-t">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-t">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-t"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-t">
				<Bay name="TEMPLATE" ${id}="bay-t">
					<Function name="Prot" desc="rev1" ${id}="fn-t" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-t" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-t">
				<DO name="Pos" type="DPC_Type" ${id}="do-t"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-t">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

describe('reportAsd — fork (same-file revision preview, both layers)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fork reports the Application and its composed Function as linked modified instances': {
			sourceXml,
			targetXml,
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const report = await reportAsd(target.query, {
			sourceQuery: source.query,
			applicationRef,
			scenario: 'fork',
		})

		// both layers recognised the prior revision (matched by uuid) -> full-track modify
		expect(report.needsDecisions).toBe(true)
		// one Application instance + one composed Function instance, each matched (rootRef set)
		expect(report.instances.length).toBe(2)
		expect(report.instances.every((instance) => instance.rootRef !== undefined)).toBe(true)

		const groups = allGroups(report)
		expect(groups.some((group) => group.primary.tagName === 'Application')).toBe(true)
		expect(groups.some((group) => group.primary.tagName === 'Function')).toBe(true)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
