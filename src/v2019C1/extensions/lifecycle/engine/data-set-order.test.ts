import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import { reconcile } from './reconcile'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

// the template's data set DS1 sends the position, then the opening block; a report control block sends each data set
const templateXml = /* xml */ `
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
							<DataSet name="DS2" uuid="ds2-src" ${id}="ds2-s">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-src" ${id}="mod-s"/>
							</DataSet>
							<ReportControl name="RC1" datSet="DS1" confRev="1" uuid="rc1-src" ${id}="rc1-s"/>
							<ReportControl name="RC2" datSet="DS2" confRev="1" uuid="rc2-src" ${id}="rc2-s"/>
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

// the instance's DS1 holds the two the other way round, with the project's own entry between them
const instanceReorderedXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
							<DataSet name="DS1" uuid="ds1-ins" templateUuid="ds1-src" ${id}="ds1-t">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkOpn" fc="ST" lnUuid="ln0-ins" ${id}="blk-t"/>
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Beh" fc="ST" lnUuid="ln0-ins" ${id}="beh-t"/>
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
							</DataSet>
							<DataSet name="DS2" uuid="ds2-ins" templateUuid="ds2-src" ${id}="ds2-t">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-ins" ${id}="mod-t"/>
							</DataSet>
							<ReportControl name="RC1" datSet="DS1" confRev="1" uuid="rc1-ins" templateUuid="rc1-src" ${id}="rc1-t"/>
							<ReportControl name="RC2" datSet="DS2" confRev="1" uuid="rc2-ins" templateUuid="rc2-src" ${id}="rc2-t"/>
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

// the same template without the report control block of DS1
const templateWithoutRc1Xml = /* xml */ `
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
							<DataSet name="DS2" uuid="ds2-src" ${id}="ds2-s">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-src" ${id}="mod-s"/>
							</DataSet>
							<ReportControl name="RC2" datSet="DS2" confRev="1" uuid="rc2-src" ${id}="rc2-s"/>
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

describe('the order of the entries of a data set an instance holds', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each decision group: `<change> <tag>:<instance or source id> <suggested action>` and its order change. */
		expectedGroups: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the template sends its two entries in another order than the instance → the data set listed, its order changed, the control block naming it bumped':
			{
				sourceXml: templateXml,
				targetXml: instanceReorderedXml,
				expectedGroups: [
					'modified DataSet:ds1-t accept order FCDA, confRev rc1-t 1 -> 2',
					'target-only FCDA:beh-t skip',
				],
			},
		'the instance holds the two in the template order, with an entry of its own after them → only that entry listed':
			{
				sourceXml: templateXml,
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
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Beh" fc="ST" lnUuid="ln0-ins" ${id}="beh-t"/>
											</DataSet>
											<DataSet name="DS2" uuid="ds2-ins" templateUuid="ds2-src" ${id}="ds2-t">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-ins" ${id}="mod-t"/>
											</DataSet>
											<ReportControl name="RC1" datSet="DS1" confRev="1" uuid="rc1-ins" templateUuid="rc1-src" ${id}="rc1-t"/>
											<ReportControl name="RC2" datSet="DS2" confRev="1" uuid="rc2-ins" templateUuid="rc2-src" ${id}="rc2-t"/>
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
				expectedGroups: ['target-only FCDA:beh-t skip'],
			},
		'the template reorders the data set and drops the control block naming it → the order listed with no bump, the block removed':
			{
				sourceXml: templateWithoutRc1Xml,
				targetXml: instanceReorderedXml,
				expectedGroups: [
					'modified DataSet:ds1-t accept order FCDA',
					'removed ReportControl:rc1-t accept',
					'target-only FCDA:beh-t skip',
				],
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
		expect(report.groups.map(describeGroup).sort()).toEqual(testCase.expectedGroups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('reconcile of the order of the entries of a data set an instance holds', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const testCases: SclTest.TestCases<TestCase> = {
		"the template sends its two entries in another order, the project's own between them, the fast track → the template order, the project's entry after the one it followed, the control block naming the data set bumped":
			{
				sourceXml: templateXml,
				targetXml: instanceReorderedXml,
				expectedQueries: [
					'//default:DataSet[@name="DS1"][count(default:FCDA)=3]',
					'//default:DataSet[@name="DS1"]/default:FCDA[1][@doName="Pos"]',
					'//default:DataSet[@name="DS1"]/default:FCDA[2][@doName="BlkOpn"]',
					'//default:DataSet[@name="DS1"]/default:FCDA[3][@doName="Beh"]',
					'//default:ReportControl[@name="RC1"][@confRev="2"]',
					'//default:ReportControl[@name="RC2"][@confRev="1"]',
				],
			},
		'the template reorders the data set and drops the control block naming it, the fast track → the template order, the block removed, nothing bumped':
			{
				sourceXml: templateWithoutRc1Xml,
				targetXml: instanceReorderedXml,
				expectedQueries: [
					'//default:DataSet[@name="DS1"]/default:FCDA[1][@doName="Pos"]',
					'//default:DataSet[@name="DS1"]/default:FCDA[2][@doName="BlkOpn"]',
					'//default:ReportControl[@name="RC2"][@confRev="1"]',
				],
				unexpectedQueries: ['//default:ReportControl[@name="RC1"]'],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async (tx) => {
			await reconcile(tx, {
				sourceQuery: source.query,
				sourceRootRef,
				instanceRootRef,
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

/** A decision group as `<change> <tag>:<id> <action>`, with its primary's order change and the bumps it brings. */
function describeGroup(group: DecisionGroup): string {
	const primary = group.primary.instanceRef ?? group.primary.sourceRef
	const order = group.primary.orderChange
	const bumps = (group.primary.confRevBumps ?? []).map(
		(bump) => `confRev ${bump.controlBlock.id} ${bump.before} -> ${bump.after}`,
	)
	const orderPart = order ? [` order ${order.tagName}`, ...bumps].join(', ') : ''
	return `${group.change} ${group.primary.tagName}:${primary?.id} ${group.suggestedAction}${orderPart}`
}

describe('the copies an update reports when it writes a data set again in the template order', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each source record the update copied, as `<source id> <tag> held`: the record it names is in the document. */
		expectedCopies: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the template adds an entry and lists the others in another order → the copy reported for the entry names its record as written':
			{
				sourceXml: templateXml,
				// the instance holds the opening block only: the position is new, and goes before it
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
											</DataSet>
											<DataSet name="DS2" uuid="ds2-ins" templateUuid="ds2-src" ${id}="ds2-t">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-ins" ${id}="mod-t"/>
											</DataSet>
											<ReportControl name="RC1" datSet="DS1" confRev="1" uuid="rc1-ins" templateUuid="rc1-src" ${id}="rc1-t"/>
											<ReportControl name="RC2" datSet="DS2" confRev="1" uuid="rc2-ins" templateUuid="rc2-src" ${id}="rc2-t"/>
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
				allowInvalidOutput: {
					reason:
						"the engine's reconcile leaves an entry it adds naming the template's logical node: repointing an added tuple reference is a later lot's",
					violations: [{ check: 'references', code: 'dangling' }],
				},
				expectedCopies: ['pos-s FCDA held'],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const copies = await target.transaction(async (tx) => {
			const { cloneMappings } = await reconcile(tx, {
				sourceQuery: source.query,
				sourceRootRef,
				instanceRootRef,
				matchKey: 'templateUuid',
				identityMode: 'stamp-template',
				bumpsCollisions: true,
				removalBase: { kind: 'lineage' },
				namesFollow: 'project',
			})
			const records = await tx.getRecords(cloneMappings.map((mapping) => mapping.target))
			return cloneMappings.map(
				(mapping, position) =>
					`${mapping.source.id} ${mapping.target.tagName} ${records[position] ? 'held' : 'gone'}`,
			)
		})
		expect(copies).toEqual(testCase.expectedCopies)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
