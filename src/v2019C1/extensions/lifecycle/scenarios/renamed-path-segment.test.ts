import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// Engine-hardening scenario (hand-authored, schema-checked). A Variable applies to an
// LNode nested under a SubFunction ("Mid"), so its VariableApplyTo.element path
// traverses that middle segment. On instantiate the path is rebuilt into instance
// space (uuid-derived). Then the middle segment is renamed IN THE PROJECT.
//
// This pins the rename-coherence behaviour:
//  - instantiate rebuilds the path (S1/V1/B1/Prot/Mid/CSWI1) — asserted present;
//  - a project-side rename updates the SubFunction name (MidRenamed — asserted present)
//    but does NOT rebuild the dependent ref path: the coherent MidRenamed path is
//    absent (asserted), so the element path stays STALE while the uuid stays correct.
// Rebuild-on-rename is a deferred coherence-pass hook. When it lands, the two path
// assertions flip.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="sub">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Variable name="Prefix" value="x" uuid="var-1" ${id}="var-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/Mid/CSWI1" elementUuid="ln-1" ${id}="vat-s"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="fn-1" ${id}="fn-1">
						<SubFunction name="Mid" uuid="sf-1" ${id}="sf-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="ln-1" ${id}="ln-1"/>
						</SubFunction>
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

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('lifecycle scenario — renamed middle path segment (project-side rename coherence)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'instantiate rebuilds the ref path; a later project rename leaves the path stale': {
			sourceXml,
			targetXml,
			expectedQueries: [
				'//default:SubFunction[@name="MidRenamed"]',
				// STALE: the path still traverses the old segment name
				'//v2019C1:VariableApplyTo[@element="S1/V1/B1/Prot/Mid/CSWI1"]',
			],
			// the coherent (rebuilt) path is NOT produced — pins the deferred hook
			unexpectedQueries: ['//v2019C1:VariableApplyTo[@element="S1/V1/B1/Prot/MidRenamed/CSWI1"]'],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		// project-side rename of the middle segment
		const root = await target.query.getRoot()
		const { SubFunction = [] } = await target.query.findDescendants(root)
		await target.transaction(async (tx) => {
			await tx.update(SubFunction[0], { attributes: { name: 'MidRenamed' } })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
