import { fsd as updateFsd } from './fsd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// The source (template document) Function to fork FROM (revision 2).
const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
// The parent in the TARGET (revision 1) that already holds the prior revision.
const targetBayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// FSD revision 2 (source): SAME element uuids as rev1, `desc` bumped to `rev2`,
// and the XCBR LNode that rev1 carried has been removed.
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

// FSD revision 1 (target): the prior revision of the SAME file — identical element
// `uuid`s (fork matches by uuid, not templateUuid), `desc="rev1"`, an extra XCBR
// LNode that rev2 dropped, and NO `templateUuid` anywhere (a pure template file).
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v1">
		<Substation name="TEMPLATE" ${id}="sub-t">
			<VoltageLevel name="TEMPLATE" ${id}="vl-t">
				<Bay name="TEMPLATE" ${id}="bay-t">
					<Function name="Prot" desc="rev1" ${id}="fn-t" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-t" uuid="lnode-src-uuid"/>
						<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="CSWI_Type" ${id}="lnode-old" uuid="lnode-old-uuid"/>
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
// FSD revision 2 that ADDS a new LNode (XCBR, uuid `lnode-new-uuid`) not present in rev1.
const addSourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v2-add">
		<Substation name="TEMPLATE" ${id}="sub-gs">
			<VoltageLevel name="TEMPLATE" ${id}="vl-gs">
				<Bay name="TEMPLATE" ${id}="bay-gs">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-gs" uuid="lnode-src-uuid"/>
						<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="CSWI_Type" ${id}="lnode-new" uuid="lnode-new-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-gs">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-gs">
				<DO name="Pos" type="DPC_Type" ${id}="do-gs"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-gs">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-gs"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

// FSD revision 1 (target of the add case): only the CSWI LNode, same uuids, no templateUuid.
const addTargetXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v1-add">
		<Substation name="TEMPLATE" ${id}="sub-gt">
			<VoltageLevel name="TEMPLATE" ${id}="vl-gt">
				<Bay name="TEMPLATE" ${id}="bay-t">
					<Function name="Prot" ${id}="fn-gt" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-gt" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-gt">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-gt">
				<DO name="Pos" type="DPC_Type" ${id}="do-gt"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-gt">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-gt"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`
describe('update.fsd — fork (same-file revision, keep identity)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fork reconciles the same-uuid revision in place: keep identity, no templateUuid, delete removed':
			{
				sourceXml,
				targetXml,
				expectedQueries: [
					// updated IN PLACE on the same-uuid element; uuid preserved
					'//default:Bay[@name="TEMPLATE"]/default:Function[@name="Prot"][@uuid="fn-src-uuid"][@desc="rev2"]',
					// the CSWI LNode survives (same uuid), kept in place
					'//default:Function[@uuid="fn-src-uuid"]/default:LNode[@lnClass="CSWI"][@uuid="lnode-src-uuid"]',
				],
				unexpectedQueries: [
					// fork keeps identity: it must NOT stamp a templateUuid
					'//default:Function[@uuid="fn-src-uuid"][@templateUuid]',
					// no stale value left behind
					'//default:Function[@uuid="fn-src-uuid"][@desc="rev1"]',
					// no duplicate function added alongside the original
					'//default:Function[@templateUuid="fn-src-uuid"]',
					// the LNode dropped by rev2 is deleted
					'//default:Function[@uuid="fn-src-uuid"]/default:LNode[@lnClass="XCBR"]',
				],
			},
		'fork adds a NEW revision element preserving its source uuid (keep identity)': {
			sourceXml: addSourceXml,
			targetXml: addTargetXml,
			expectedQueries: [
				// the added LNode keeps the SOURCE uuid from rev2 (fork converges to the same identity)
				'//default:Function[@uuid="fn-src-uuid"]/default:LNode[@lnClass="XCBR"][@uuid="lnode-new-uuid"]',
				// the pre-existing CSWI LNode is untouched
				'//default:Function[@uuid="fn-src-uuid"]/default:LNode[@lnClass="CSWI"][@uuid="lnode-src-uuid"]',
			],
			unexpectedQueries: [
				// fork keeps identity: the added element carries NO templateUuid
				'//default:LNode[@lnClass="XCBR"][@templateUuid]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await updateFsd(tx, {
				sourceQuery: source.query,
				functionRef,
				targetParent: targetBayRef,
				scenario: 'fork',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
