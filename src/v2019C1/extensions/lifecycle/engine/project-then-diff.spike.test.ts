import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>

/**
 * SPIKE (go / no-go for the lifecycle engine, ENGINE.md §8/§14) — kept as premise
 * evidence. Validates "project then diff": a v2 projection placed beside the
 * existing v1 instance differs ONLY by the real change, both lineage-aligned by
 * `templateUuid` and both instance-space. The projection is played in a
 * `prepare()` sandbox and asserted against its (uncommitted) snapshot.
 */
describe('SPIKE: project-then-diff premise (lifecycle engine go/no-go)', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'projection of v2 differs from the v1 instance only by the real change, lineage-aligned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
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
				</SCL>`,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="S1" ${id}="sub-t">
						<VoltageLevel name="V1" ${id}="vl-t">
							<Bay name="B1" ${id}="bay-t1"/>
							<Bay name="B2" ${id}="bay-t2"/>
						</VoltageLevel>
					</Substation>
				</SCL>`,
			expectedQueries: [
				// v1 instance in B1 and v2 projection in B2 are BOTH lineage-aligned
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				'//default:Bay[@name="B2"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				// the projection carries the real v2 change (isolated to B2)
				'//default:Bay[@name="B2"]/default:Function[@name="Prot"][@desc="v2"]',
				'//default:Bay[@name="B2"]/default:Function[@name="Prot"]/default:LNode[@lnClass="XCBR"]',
				// unchanged content present under both
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"]',
				'//default:Bay[@name="B2"]/default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"]',
			],
			unexpectedQueries: [
				// the change does NOT bleed onto the existing instance (B1 unchanged)
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@desc="v2"]',
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:LNode[@lnClass="XCBR"]',
				// instance-space: no element carries the raw source uuid
				'//default:Function[@uuid="fn-src-uuid"]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// 1. instantiate v1 into B1 (commit) -> the existing instance
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef,
				targetParent: { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>,
			})
		})

		// 2. mutate the source template in place -> v2 (change desc + add an LNode)
		await source.transaction(async (tx) => {
			await tx.update(functionRef, { attributes: { desc: 'v2' } })
			await tx.addChild(functionRef, {
				tagName: 'LNode',
				attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '1', lnType: 'CSWI_Type' },
			})
		})

		// 3. project v2 into B2 in a prepare() sandbox and snapshot without committing
		const prepared = await target.prepare(async (tx) => {
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef,
				targetParent: { tagName: 'Bay', id: 'bay-t2' } as Scl.Ref<'Bay'>,
			})
		})
		const xmlString = await prepared.query.getSnapshot({ as: 'xml' })
		prepared.discard()

		return { assertOn: 'custom', xmlString }
	}

	runSclTestCases.withExport({ testCases, act })
})
