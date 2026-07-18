import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { GroupDecision } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// Full-track override surface (FSD, first-time instantiate). The UI decides on a GROUP and
// may edit its editable attributes (`name` = rename, `desc` = free). Those edits ride
// through `report -> apply` as `GroupDecision.values` and must land verbatim on the
// placed instance — this is the path the merge UI drives (distinct from the ASD test,
// which supplies pre-computed `overrides` directly to `instantiate.asd`).

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="sub">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="fn-1" desc="v1" ${id}="fn-1">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="ln-1" ${id}="ln-1"/>
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

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
}

describe('lifecycle scenario — instantiate.fsd applies user edits via decisions.values', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a user edit of name + desc rides report->apply and lands on the placed instance': {
			sourceXml,
			targetXml,
			expectedQueries: [
				// user-edited name + desc applied verbatim on the added instance
				'//default:Bay/default:Function[@name="Custom_Name"][@desc="edited-desc"]',
			],
			unexpectedQueries: [
				'//default:Bay/default:Function[@name="Prot"]', // template name did not win
				'//default:Bay/default:Function[@desc="v1"]', // template desc did not win
			],
		},
	}

	async function act({
		source,
		target,
		testCase: _testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		const rep = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		})

		// edit the root function's editable attributes, keyed by its group id
		const rootGroup = rep.groups.find((group) => group.primary.sourceRef?.id === functionRef.id)
		if (!rootGroup) throw new Error('root function group not found in report')

		const decisions = new Map<string, GroupDecision>([
			[rootGroup.id, { action: 'accept', values: { name: 'Custom_Name', desc: 'edited-desc' } }],
		])

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
				decisions,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
