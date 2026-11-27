import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import { reconcile } from './reconcile'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { AcceptedIds } from './decide.types'
import type { DecisionGroup, DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// the IED file imported again: its device, nodes and data set carry other uuids than the first import gave them
const reimportedXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-new" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-new" ${id}="ln0-s">
							<DataSet name="DS1" uuid="ds-new" ${id}="ds-s">
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-new" ${id}="fcda-s"/>
							</DataSet>
						</LN0>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-new" ${id}="xcbr-s"/>
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

// the instance placed from the first import: its lineages name uuids the file imported again no longer holds
const instanceOfFirstImportXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-old" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-old" ${id}="ln0-t">
							<DataSet name="DS1" uuid="ds-ins" templateUuid="ds-old" ${id}="ds-t">
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-ins" ${id}="fcda-t"/>
							</DataSet>
						</LN0>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-ins" templateUuid="xcbr-old" ${id}="xcbr-t"/>
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

describe('pairing by key of what an IED file imported again names by other uuids', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		sourceRoot: Scl.Ref<Scl.ElementsOf>
		instanceRoot: Scl.Ref<Scl.ElementsOf>
		/** Each decision group (`<change> <tag>:<id> <action>`), then each node paired by key (`by key <tag>:<id>`). */
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the device, nodes and data set of the instance of the first import → each paired by its key, its entry through it, nothing listed':
			{
				sourceXml: reimportedXml,
				targetXml: instanceOfFirstImportXml,
				sourceRoot: { tagName: 'IED', id: 'ied-s' } as Scl.Ref<Scl.ElementsOf>,
				instanceRoot: { tagName: 'IED', id: 'ied-t' } as Scl.Ref<Scl.ElementsOf>,
				expected: [
					'by key DataSet:ds-t',
					'by key LDevice:ld-t',
					'by key LN0:ln0-t',
					'by key LN:xcbr-t',
				],
			},
		"an input of the template and one of the project's own, of other lineages and other internal addresses, in the one input section of a logical node → not paired by key: the template's added, the project's its own":
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<Inputs ${id}="inputs-s">
												<ExtRef intAddr="Trip" uuid="ext-new" ${id}="ext-s"/>
											</Inputs>
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
											<Inputs ${id}="inputs-t">
												<ExtRef intAddr="Block" uuid="ext-own" ${id}="ext-t"/>
											</Inputs>
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
				sourceRoot: { tagName: 'IED', id: 'ied-s' } as Scl.Ref<Scl.ElementsOf>,
				instanceRoot: { tagName: 'IED', id: 'ied-t' } as Scl.Ref<Scl.ElementsOf>,
				expected: ['added ExtRef:ext-s accept', 'target-only ExtRef:ext-t skip'],
			},
		'a function the template replaced by another uuid of the same name → the template one added, the instance one removed':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<Substation name="TEMPLATE" ${id}="sub-s">
							<VoltageLevel name="TEMPLATE" ${id}="vl-s">
								<Bay name="TEMPLATE" uuid="bay-src" ${id}="bay-s">
									<Function name="Prot" uuid="fn-new" ${id}="fn-s"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t">
								<Bay name="B1" uuid="bay-ins" templateUuid="bay-src" ${id}="bay-t">
									<Function name="Prot" uuid="fn-ins" templateUuid="fn-old" ${id}="fn-t"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				sourceRoot: { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<Scl.ElementsOf>,
				instanceRoot: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<Scl.ElementsOf>,
				expected: ['added Function:fn-s accept', 'removed Function:fn-t accept'],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef: testCase.sourceRoot,
			instanceRootRef: testCase.instanceRoot,
			diffPolicy: readDiffPolicy({}),
		})
		const groups = report.groups.map(describeGroup)
		expect([...groups, ...pairedByKeyOf(report.root)].sort()).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('reconcile of what an IED file imported again names by other uuids', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		matchKey: MatchKey
		identityMode: Extract<IdentityMode, 'keep' | 'stamp-template'>
		/** The decided groups (`undefined`: the fast track, every group at its suggested action). */
		accepted?: AcceptedIds
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an update from the file imported again, the fast track → each element paired by key now names the new uuid, none added':
			{
				sourceXml: reimportedXml,
				targetXml: instanceOfFirstImportXml,
				matchKey: 'templateUuid',
				identityMode: 'stamp-template',
				expectedQueries: [
					'//default:IED[@name="IED7"][count(.//default:LN)=1][count(.//default:LDevice)=1]',
					'//default:LDevice[@uuid="ld-ins"][@templateUuid="ld-new"]',
					'//default:LN0[@uuid="ln0-ins"][@templateUuid="ln0-new"]',
					'//default:LN[@uuid="xcbr-ins"][@templateUuid="xcbr-new"]',
					'//default:DataSet[@uuid="ds-ins"][@templateUuid="ds-new"][count(default:FCDA)=1]',
				],
			},
		'an update from the file imported again listing its data set in another order, the fast track → the report control block paired by key raised':
			{
				// the file imported again: its data set sends the position first, its report control block names it
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-new" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-new" ${id}="ln0-s">
											<DataSet name="DS1" uuid="ds-new" ${id}="ds-s">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-new" ${id}="pos-s"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkOpn" fc="ST" lnUuid="ln0-new" ${id}="blk-s"/>
											</DataSet>
											<ReportControl name="RC1" datSet="DS1" confRev="1" uuid="rc-new" ${id}="rc-s"/>
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
				// the instance of the first import: its lineages name uuids the file imported again no longer holds
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-old" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-old" ${id}="ln0-t">
											<DataSet name="DS1" uuid="ds-ins" templateUuid="ds-old" ${id}="ds-t">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="BlkOpn" fc="ST" lnUuid="ln0-ins" ${id}="blk-t"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
											</DataSet>
											<ReportControl name="RC1" datSet="DS1" confRev="1" uuid="rc-ins" templateUuid="rc-old" ${id}="rc-t"/>
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
				matchKey: 'templateUuid',
				identityMode: 'stamp-template',
				expectedQueries: [
					'//default:DataSet[@name="DS1"]/default:FCDA[1][@doName="Pos"]',
					'//default:ReportControl[@name="RC1"][@uuid="rc-ins"][@confRev="10001"]',
				],
			},
		'an update from the file imported again, no group accepted → nothing paired by key names the new uuid':
			{
				sourceXml: reimportedXml,
				targetXml: instanceOfFirstImportXml,
				matchKey: 'templateUuid',
				identityMode: 'stamp-template',
				accepted: { sourceIds: new Set(), instanceIds: new Set(), typeChangeIds: new Set() },
				expectedQueries: [
					'//default:LDevice[@uuid="ld-ins"][@templateUuid="ld-old"]',
					'//default:LN[@uuid="xcbr-ins"][@templateUuid="xcbr-old"]',
				],
			},
		'a fork of the file imported again → each element paired by key keeps its own uuid, none added':
			{
				sourceXml: reimportedXml,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project">
					<IED name="TPL" uuid="ied-src" ${id}="ied-t">
						<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-t">
							<Server ${id}="srv-t">
								<Authentication ${id}="auth-t"/>
								<LDevice inst="LD1" uuid="ld-old" ${id}="ld-t">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-old" ${id}="ln0-t">
										<DataSet name="DS1" uuid="ds-old" ${id}="ds-t">
											<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-old" ${id}="fcda-t"/>
										</DataSet>
									</LN0>
									<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-old" ${id}="xcbr-t"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<DataTypeTemplates ${id}="dtt-t">
						<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
						<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-t"/>
					</DataTypeTemplates>
				</SCL>
			`,
				matchKey: 'uuid',
				identityMode: 'keep',
				expectedQueries: [
					'//default:IED[@name="TPL"][count(.//default:LN)=1][count(.//default:LDevice)=1]',
					'//default:LDevice[@uuid="ld-old"][not(@templateUuid)]',
					'//default:LN[@uuid="xcbr-old"][not(@templateUuid)]',
					'//default:DataSet[@uuid="ds-old"][count(default:FCDA)=1]',
				],
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
				sourceRootRef: { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>,
				instanceRootRef: { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>,
				accepted: testCase.accepted,
				matchKey: testCase.matchKey,
				identityMode: testCase.identityMode,
				bumpsCollisions: true,
				removalBase: { kind: 'lineage' },
				namesFollow: 'project',
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A decision group as `<change> <tag>:<instance or source id> <suggested action>`. */
function describeGroup(group: DecisionGroup): string {
	const primary = group.primary.instanceRef ?? group.primary.sourceRef
	return `${group.change} ${group.primary.tagName}:${primary?.id} ${group.suggestedAction}`
}

/** The nodes of a tree paired by key, as `by key <tag>:<instance id>`. */
function pairedByKeyOf(node: DiffNode): string[] {
	const own = node.pairedByKey ? [`by key ${node.tagName}:${node.instanceRef?.id}`] : []
	return [...own, ...node.children.flatMap(pairedByKeyOf)]
}
