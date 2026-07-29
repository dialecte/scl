import { reportFsd } from './report-fsd'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// The source (FSD revision 2) Function to preview a fork FROM.
const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
// The parent in the target (revision 1) that already holds the prior revision.
const targetBayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// FSD revision 2 (source): SAME element uuids as rev1, `desc` bumped to `rev2`.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v2">
		<Substation name="TEMPLATE" ${id}="sub-s">
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
	</SCL>`

// FSD revision 1 (target): identical element `uuid`s (fork matches by uuid), `desc="rev1"`,
// and NO `templateUuid` anywhere (a pure template file).
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v1">
		<Substation name="TEMPLATE" ${id}="sub-t">
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
	</SCL>`

describe('reportFsd — fork (same-file revision preview)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fork reports the same-uuid revision as a LINKED modified instance (not a first-time add)': {
			sourceXml,
			targetXml,
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const report = await reportFsd(target.query, {
			sourceQuery: source.query,
			functionRef,
			targetParent: targetBayRef,
			scenario: 'fork',
		})

		// fork must recognise the prior revision as the existing instance (matched by uuid),
		// so the review is a full-track modify — NOT a fast-track first-time add. The match is
		// carried by `rootRef` (the matched element); `linked` stays instantiation-lineage-specific
		// (templateUuid/originUuid), which a same-file revision legitimately lacks.
		expect(report.needsDecisions).toBe(true)
		expect(report.instances).toHaveLength(1)
		expect(report.instances[0]?.rootRef).toBeDefined()
		expect(report.instances[0]?.upToDate).toBe(false)

		const functionGroup = allGroups(report).find((group) => group.primary.tagName === 'Function')
		expect(functionGroup).toBeDefined()
	}

	runSclTestCases.withoutExport({ testCases, act })
})
