import { apply } from './apply'
import { report } from './report'

import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup, DecisionMap } from './engine/diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

// Two sibling LNodes so each change is its OWN top-level group (the Function
// stays unchanged), which is what lets us accept one and skip the other.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="ln-1" uuid="ln1-uuid"/>
						<LNode iedName="None" lnClass="MMXU" lnInst="1" lnType="CSWI_Type" ${id}="ln-2" uuid="ln2-uuid"/>
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
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

const skipWhere =
	(predicate: (g: DecisionGroup) => boolean) =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.filter(predicate).map((g) => [g.id, 'skip'] as const))

describe('lifecycle.apply — decision-gated (full track)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accept all (empty decisions) -> every accepted group applies': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update({ tagName: 'LNode', id: 'ln-1' } as Scl.Ref<'LNode'>, {
					attributes: { desc: 'v2' },
				})
				await tx.update({ tagName: 'LNode', id: 'ln-2' } as Scl.Ref<'LNode'>, {
					attributes: { desc: 'v2' },
				})
			},
			decide: () => new Map(),
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"][@desc="v2"]',
				'//default:Function[@name="Prot"]/default:LNode[@lnClass="MMXU"][@desc="v2"]',
			],
		},

		'skip one modified group -> only the accepted one updates': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update({ tagName: 'LNode', id: 'ln-1' } as Scl.Ref<'LNode'>, {
					attributes: { desc: 'v2' },
				})
				await tx.update({ tagName: 'LNode', id: 'ln-2' } as Scl.Ref<'LNode'>, {
					attributes: { desc: 'v2' },
				})
			},
			// skip the group whose primary is the MMXU LNode (source id ln-2)
			decide: skipWhere((g) => g.primary.sourceRef?.id === 'ln-2'),
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"][@desc="v2"]',
			],
			unexpectedQueries: [
				'//default:Function[@name="Prot"]/default:LNode[@lnClass="MMXU"][@desc="v2"]',
			],
		},

		'skip all groups -> nothing is written': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update({ tagName: 'LNode', id: 'ln-1' } as Scl.Ref<'LNode'>, {
					attributes: { desc: 'v2' },
				})
				await tx.update({ tagName: 'LNode', id: 'ln-2' } as Scl.Ref<'LNode'>, {
					attributes: { desc: 'v2' },
				})
			},
			decide: skipWhere(() => true),
			unexpectedQueries: [
				'//default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"][@desc="v2"]',
				'//default:Function[@name="Prot"]/default:LNode[@lnClass="MMXU"][@desc="v2"]',
			],
		},

		'skip an added group -> its graft is dropped': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.addChild(functionRef, {
					tagName: 'LNode',
					attributes: { iedName: 'None', lnClass: 'GGIO', lnInst: '1', lnType: 'CSWI_Type' },
				})
			},
			decide: skipWhere((g) => g.change === 'added'),
			unexpectedQueries: ['//default:Function[@name="Prot"]/default:LNode[@lnClass="GGIO"]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		await source.transaction(testCase.mutate)

		const rep = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		})

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
				decisions: testCase.decide(rep.groups),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
