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

// the template's data set: two entries on one logical node, the position then the opening block
const templateXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
							<DataSet name="DS1" uuid="ds-src" ${id}="ds-s">
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-src" ${id}="fcda-pos-s"/>
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="BlkOpn" fc="ST" lnUuid="xcbr-src" ${id}="fcda-blk-s"/>
							</DataSet>
						</LN0>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-src" ${id}="xcbr-s"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-s"/>
		</DataTypeTemplates>
	</SCL>
`

// the instance: the project added the closing block on the same logical node, first in the data set
const instanceAddedFirstXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
							<DataSet name="DS1" uuid="ds-ins" templateUuid="ds-src" ${id}="ds-t">
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="BlkCls" fc="ST" lnUuid="xcbr-ins" ${id}="fcda-cls-t"/>
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-ins" ${id}="fcda-pos-t"/>
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="BlkOpn" fc="ST" lnUuid="xcbr-ins" ${id}="fcda-blk-t"/>
							</DataSet>
						</LN0>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-ins" templateUuid="xcbr-src" ${id}="xcbr-t"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-t"/>
		</DataTypeTemplates>
	</SCL>
`

describe('pairing of the data-flow references of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each decision group: `<change> <tag>:<instance id> <suggested action>`. */
		expectedGroups: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"the project added a data set entry on the logical node of the template ones, first → only that entry listed, the project's own":
			{
				sourceXml: templateXml,
				targetXml: instanceAddedFirstXml,
				expectedGroups: ['target-only FCDA:fcda-cls-t skip'],
			},
		'the receivers of a GOOSE control block naming IEDs outside the file, in the other order → each paired with the one naming the same IED, nothing listed':
			{
				// the receivers RCV1 and RCV2 are IEDs no file of the case holds: they name them by name only
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<GSEControl name="GC1" appID="GC1" confRev="1" uuid="gc-src" ${id}="gc-s">
												<IEDName ${id}="rcv1-s">RCV1</IEDName>
												<IEDName ${id}="rcv2-s">RCV2</IEDName>
											</GSEControl>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-s">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
											<GSEControl name="GC1" appID="GC1" confRev="1" uuid="gc-ins" templateUuid="gc-src" ${id}="gc-t">
												<IEDName ${id}="rcv2-t">RCV2</IEDName>
												<IEDName ${id}="rcv1-t">RCV1</IEDName>
											</GSEControl>
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
				expectedGroups: [],
			},
		'one report client reached through two access points, and two associations of one client, in the other order → each paired with the one of the same access point or association id, nothing listed':
			{
				// the client IED HMI is in no file of the case: its logical node is named by names only
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<ReportControl name="RC1" confRev="1" uuid="rc-src" ${id}="rc-s">
												<RptEnabled ${id}="rpt-s">
													<ClientLN iedName="HMI" apRef="S1" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="cl-s1-s"/>
													<ClientLN iedName="HMI" apRef="S2" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="cl-s2-s"/>
												</RptEnabled>
											</ReportControl>
										</LN0>
									</LDevice>
									<Association kind="predefined" associationID="A1" iedName="HMI" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="as-a1-s"/>
									<Association kind="predefined" associationID="A2" iedName="HMI" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="as-a2-s"/>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-s">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
											<ReportControl name="RC1" confRev="1" uuid="rc-ins" templateUuid="rc-src" ${id}="rc-t">
												<RptEnabled ${id}="rpt-t">
													<ClientLN iedName="HMI" apRef="S2" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="cl-s2-t"/>
													<ClientLN iedName="HMI" apRef="S1" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="cl-s1-t"/>
												</RptEnabled>
											</ReportControl>
										</LN0>
									</LDevice>
									<Association kind="predefined" associationID="A2" iedName="HMI" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="as-a2-t"/>
									<Association kind="predefined" associationID="A1" iedName="HMI" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="as-a1-t"/>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-t">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
						</DataTypeTemplates>
					</SCL>
				`,
				expectedGroups: [],
			},
		"a report client naming by uuid a logical node only the template's file holds, the project's naming it by names only → paired by the names, nothing listed":
			{
				// the template file holds the client IED HMI; the project does not, so its client names it by names only
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<ReportControl name="RC1" confRev="1" uuid="rc-src" ${id}="rc-s">
												<RptEnabled ${id}="rpt-s">
													<ClientLN iedName="HMI" ldInst="LD0" lnClass="IHMI" lnInst="1" lnUuid="hmi-ln-src" ${id}="cl-s"/>
												</RptEnabled>
											</ReportControl>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="HMI" uuid="hmi-src" ${id}="hmi-s">
							<AccessPoint name="AP1" uuid="hmi-ap-src" ${id}="hmi-ap-s">
								<Server ${id}="hmi-srv-s">
									<Authentication ${id}="hmi-auth-s"/>
									<LDevice inst="LD0" uuid="hmi-ld-src" ${id}="hmi-ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="hmi-ln0-src" ${id}="hmi-ln0-s"/>
										<LN lnClass="IHMI" inst="1" lnType="IHMI_T" uuid="hmi-ln-src" ${id}="hmi-ln-s"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-s">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
							<LNodeType id="IHMI_T" lnClass="IHMI" ${id}="lnt1-s"/>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
											<ReportControl name="RC1" confRev="1" uuid="rc-ins" templateUuid="rc-src" ${id}="rc-t">
												<RptEnabled ${id}="rpt-t">
													<ClientLN iedName="HMI" ldInst="LD0" lnClass="IHMI" lnInst="1" ${id}="cl-t"/>
												</RptEnabled>
											</ReportControl>
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
				expectedGroups: [],
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

describe('reconcile of the data-flow references of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'the project added a data set entry on the logical node of the template ones, first, the fast track → every entry kept as it is, none rewritten':
			{
				sourceXml: templateXml,
				targetXml: instanceAddedFirstXml,
				expectedQueries: [
					'//default:IED[@name="IED7"]//default:DataSet[@name="DS1"][count(default:FCDA)=3]',
					'//default:DataSet[@name="DS1"]/default:FCDA[@doName="BlkCls"][@lnUuid="xcbr-ins"]',
					'//default:DataSet[@name="DS1"][count(default:FCDA[@doName="Pos"])=1]',
					'//default:DataSet[@name="DS1"][count(default:FCDA[@doName="BlkOpn"])=1]',
				],
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

/** A decision group as `<change> <tag>:<instance id> <suggested action>`. */
function describeGroup(group: DecisionGroup): string {
	const primary = group.primary.instanceRef ?? group.primary.sourceRef
	return `${group.change} ${group.primary.tagName}:${primary?.id} ${group.suggestedAction}`
}
