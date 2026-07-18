import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// Engine-hardening scenario (hand-authored, schema-checked against the Dialecte
// definition). Two functions in one template share a single LNodeType. Instantiating
// both into a target must import the type ONCE (content-addressed dedup by
// dataModel.importTypes), not once per function.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const fnA = { tagName: 'Function', id: 'fn-a' } as Scl.Ref<'Function'>
const fnB = { tagName: 'Function', id: 'fn-b' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="sub">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Alpha" uuid="fn-a" ${id}="fn-a">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SharedType" uuid="ln-a" ${id}="ln-a"/>
					</Function>
					<Function name="Beta" uuid="fn-b" ${id}="fn-b">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SharedType" uuid="ln-b" ${id}="ln-b"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="SharedType" lnClass="CSWI" ${id}="lnt-s">
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

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('lifecycle scenario — shared type across scopes (importTypes dedup)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'instantiating two functions that share one LNodeType imports the type once': {
			sourceXml,
			targetXml,
			expectedQueries: [
				'//default:Function[@name="Alpha"]',
				'//default:Function[@name="Beta"]',
				'//default:DataTypeTemplates/default:LNodeType[@lnClass="CSWI"]',
				'//default:DataTypeTemplates/default:DOType',
			],
			// dedup: the shared type is imported ONCE — there is no second LNodeType/DOType
			unexpectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[2]',
				'//default:DataTypeTemplates/default:DOType[2]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef: fnA,
				targetParent: bayRef,
			})
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef: fnB,
				targetParent: bayRef,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
