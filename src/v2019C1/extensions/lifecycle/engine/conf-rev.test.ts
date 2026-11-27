import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import { reconcile } from './reconcile'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { AcceptedIds } from './decide.types'
import type { DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

// the template's data set sends the position and the opening block; a GOOSE control block sends it, at revision 1
const templateTwoEntriesXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
							<DataSet name="DS1" uuid="ds1-src" ${id}="ds1-s">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-src" ${id}="pos-s"/>
								<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkOpn" fc="ST" lnUuid="ln0-src" ${id}="blk-s"/>
							</DataSet>
							<GSEControl name="GC1" appID="GC1" datSet="DS1" confRev="1" uuid="gc1-src" ${id}="gc1-s"/>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
		</DataTypeTemplates>
	</SCL>
`

// the instance holds only the position, its GOOSE control block at revision 1
const instanceOneEntryXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
							<DataSet name="DS1" uuid="ds1-ins" templateUuid="ds1-src" ${id}="ds1-t">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
							</DataSet>
							<GSEControl name="GC1" appID="GC1" datSet="DS1" confRev="1" uuid="gc1-ins" templateUuid="gc1-src" ${id}="gc1-t"/>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
		</DataTypeTemplates>
	</SCL>
`

// the instance holds the template's two entries, its GOOSE control block already raised to revision 2
const instanceRaisedXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
							<DataSet name="DS1" uuid="ds1-ins" templateUuid="ds1-src" ${id}="ds1-t">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
								<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkOpn" fc="ST" lnUuid="ln0-ins" ${id}="blk-t"/>
							</DataSet>
							<GSEControl name="GC1" appID="GC1" datSet="DS1" confRev="2" uuid="gc1-ins" templateUuid="gc1-src" ${id}="gc1-t"/>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
		</DataTypeTemplates>
	</SCL>
`

describe('the configuration revision of the control blocks of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each change listed, as `<change> <tag>:<id>`, then each bump as `bump <block id> <before> -> <after>`. */
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"the template adds an entry to a data set → the data set's GOOSE control block listed raised": {
			sourceXml: templateTwoEntriesXml,
			targetXml: instanceOneEntryXml,
			expected: ['added FCDA:blk-s', 'bump gc1-t 1 -> 10001'],
		},
		"the project's control block at a higher revision than the template's → nothing listed, the revision kept":
			{
				sourceXml: templateTwoEntriesXml,
				targetXml: instanceRaisedXml,
				expected: ['kept GSEControl:gc1-t confRev 2 (template 1)'],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy: readDiffPolicy({}),
		})
		expect(describeTree(report.root).sort()).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('reconcile of the configuration revision of the control blocks of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The decided groups (`undefined`: the fast track, every group at its suggested action). */
		accepted?: AcceptedIds
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"the template adds an entry to a data set, the fast track → the entry added, the data set's GOOSE control block raised":
			{
				sourceXml: templateTwoEntriesXml,
				targetXml: instanceOneEntryXml,
				allowInvalidOutput: {
					reason:
						"the engine's reconcile leaves an entry it adds naming the template's logical node: repointing an added tuple reference is a later lot's",
					violations: [{ check: 'references', code: 'dangling' }],
				},
				expectedQueries: [
					'//default:DataSet[@name="DS1"][count(default:FCDA)=2]',
					'//default:GSEControl[@name="GC1"][@confRev="10001"]',
				],
			},
		"the removal of an entry of the project's own accepted → the entry removed, the data set's GOOSE control block raised":
			{
				sourceXml: templateTwoEntriesXml,
				// the instance holds an entry of its own, the closing block, besides the template's two
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
											<DataSet name="DS1" uuid="ds1-ins" templateUuid="ds1-src" ${id}="ds1-t">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkOpn" fc="ST" lnUuid="ln0-ins" ${id}="blk-t"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkCls" fc="ST" lnUuid="ln0-ins" ${id}="cls-t"/>
											</DataSet>
											<GSEControl name="GC1" appID="GC1" datSet="DS1" confRev="1" uuid="gc1-ins" templateUuid="gc1-src" ${id}="gc1-t"/>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-t">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
						</DataTypeTemplates>
					</SCL>
				`,
				accepted: {
					sourceIds: new Set(),
					instanceIds: new Set(['cls-t']),
					typeChangeIds: new Set(),
				},
				expectedQueries: [
					'//default:DataSet[@name="DS1"][count(default:FCDA)=2]',
					'//default:GSEControl[@name="GC1"][@confRev="10001"]',
				],
				unexpectedQueries: ['//default:FCDA[@doName="BlkCls"]'],
			},
		"a GOOSE control block of the project's own naming the data set the template reorders, the fast track → raised with the template's":
			{
				sourceXml: templateTwoEntriesXml,
				// GC2 is the project's: no lineage
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
											<DataSet name="DS1" uuid="ds1-ins" templateUuid="ds1-src" ${id}="ds1-t">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkOpn" fc="ST" lnUuid="ln0-ins" ${id}="blk-t"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
											</DataSet>
											<GSEControl name="GC1" appID="GC1" datSet="DS1" confRev="1" uuid="gc1-ins" templateUuid="gc1-src" ${id}="gc1-t"/>
											<GSEControl name="GC2" appID="GC2" datSet="DS1" confRev="7" uuid="gc2-own" ${id}="gc2-t"/>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-t">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
						</DataTypeTemplates>
					</SCL>
				`,
				expectedQueries: [
					'//default:GSEControl[@name="GC1"][@confRev="10001"]',
					'//default:GSEControl[@name="GC2"][@confRev="10007"]',
				],
			},
		"the project's control block already above the template's revision, the template reorders the data set, the fast track → raised from the project's":
			{
				sourceXml: templateTwoEntriesXml,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
											<DataSet name="DS1" uuid="ds1-ins" templateUuid="ds1-src" ${id}="ds1-t">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkOpn" fc="ST" lnUuid="ln0-ins" ${id}="blk-t"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
											</DataSet>
											<GSEControl name="GC1" appID="GC1" datSet="DS1" confRev="2" uuid="gc1-ins" templateUuid="gc1-src" ${id}="gc1-t"/>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-t">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
						</DataTypeTemplates>
					</SCL>
				`,
				expectedQueries: ['//default:GSEControl[@name="GC1"][@confRev="10002"]'],
			},
		"the project's control block at a higher revision than the template's, the fast track → the revision kept":
			{
				sourceXml: templateTwoEntriesXml,
				targetXml: instanceRaisedXml,
				expectedQueries: ['//default:GSEControl[@name="GC1"][@confRev="2"]'],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async (tx) => {
			await reconcile(tx, {
				sourceQuery: source.query,
				sourceRootRef,
				instanceRootRef,
				accepted: testCase.accepted,
				matchKey: 'templateUuid',
				identityMode: 'stamp-template',
				bumpsCollisions: true,
				removalBase: { kind: 'lineage' },
				namesFollow: 'project',
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** What a tree lists: each element added or removed, each kept difference, each configuration revision raised. */
function describeTree(node: DiffNode): string[] {
	const ref = node.instanceRef ?? node.sourceRef
	const own = [
		...(node.change === 'added' || node.change === 'removed'
			? [`${node.change} ${node.tagName}:${ref?.id}`]
			: []),
		...(node.keptAttributeChanges ?? []).map(
			(kept) =>
				`kept ${node.tagName}:${ref?.id} ${kept.name} ${kept.before} (template ${kept.after})`,
		),
		...(node.confRevBumps ?? []).map(
			(bump) => `bump ${bump.controlBlock.id} ${bump.before} -> ${bump.after}`,
		),
	]
	return [...own, ...node.children.flatMap(describeTree)]
}
