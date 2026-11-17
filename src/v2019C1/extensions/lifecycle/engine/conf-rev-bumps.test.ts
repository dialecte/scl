import { acceptedRefIds } from './decide'
import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import { reconcile } from './reconcile'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

// the template sends DS1's entries in another order than the instance and raises RC1 to 5 itself
const templateRaisingRc1Xml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
							<DataSet name="DS1" uuid="ds1-src" ${id}="ds1-s">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-src" ${id}="pos-s"/>
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Beh" fc="ST" lnUuid="ln0-src" ${id}="beh-s"/>
							</DataSet>
							<ReportControl name="RC1" datSet="DS1" confRev="5" uuid="rc1-src" ${id}="rc1-s"/>
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

// the instance's DS1 holds the two the other way round; RC1 at revision 1
const instanceAtRevisionOneXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
							<DataSet name="DS1" uuid="ds1-ins" templateUuid="ds1-src" ${id}="ds1-t">
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Beh" fc="ST" lnUuid="ln0-ins" ${id}="beh-t"/>
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
							</DataSet>
							<ReportControl name="RC1" datSet="DS1" confRev="1" uuid="rc1-ins" templateUuid="rc1-src" ${id}="rc1-t"/>
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

describe('the configuration revisions a data set change raises, as the report lists them', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each raise on DS1's node (`<block> <before> -> <after>`, `if skipped` when it waits on the block's own change). */
		bumps: string[]
		/** Each block DS1's change cannot raise (`<block> <value> <refusal>`). */
		notRaised: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the template raising RC1 to 5 itself → its raise to 2 listed for when its own change is skipped':
			{
				sourceXml: templateRaisingRc1Xml,
				targetXml: instanceAtRevisionOneXml,
				bumps: ['rc1-t 1 -> 2 if skipped'],
				notRaised: [],
			},
		'RC1 of the instance at the limit of its counter → not raised, listed': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="template">
					<IED name="TPL" uuid="ied-src" ${id}="ied-s">
						<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
							<Server ${id}="srv-s">
								<Authentication ${id}="auth-s"/>
								<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
										<DataSet name="DS1" uuid="ds1-src" ${id}="ds1-s">
											<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-src" ${id}="pos-s"/>
											<FCDA ldInst="LD1" lnClass="LLN0" doName="Beh" fc="ST" lnUuid="ln0-src" ${id}="beh-s"/>
										</DataSet>
										<ReportControl name="RC1" datSet="DS1" confRev="4294967295" uuid="rc1-src" ${id}="rc1-s"/>
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
										<DataSet name="DS1" uuid="ds1-ins" templateUuid="ds1-src" ${id}="ds1-t">
											<FCDA ldInst="LD1" lnClass="LLN0" doName="Beh" fc="ST" lnUuid="ln0-ins" ${id}="beh-t"/>
											<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-ins" ${id}="pos-t"/>
										</DataSet>
										<ReportControl name="RC1" datSet="DS1" confRev="4294967295" uuid="rc1-ins" templateUuid="rc1-src" ${id}="rc1-t"/>
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
			bumps: [],
			notRaised: ['rc1-t 4294967295 overflow'],
		},
		'the template moving RC1 into the device health logical node, its revision kept → RC1 still raised, not read as dropped':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<DataSet name="DS1" uuid="ds1-src" ${id}="ds1-s">
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Pos" fc="ST" lnUuid="ln0-src" ${id}="pos-s"/>
												<FCDA ldInst="LD1" lnClass="LLN0" doName="Beh" fc="ST" lnUuid="ln0-src" ${id}="beh-s"/>
											</DataSet>
										</LN0>
										<LN lnClass="LPHD" inst="1" lnType="LPHD_T" uuid="lphd-src" ${id}="lphd-s">
											<ReportControl name="RC1" datSet="DS1" confRev="1" uuid="rc1-src" ${id}="rc1-s"/>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates ${id}="dtt-s">
							<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
							<LNodeType id="LPHD_T" lnClass="LPHD" ${id}="lnt1-s"/>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: instanceAtRevisionOneXml,
				bumps: ['rc1-t 1 -> 2'],
				notRaised: [],
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
		const dataSet = findNode({ node: report.root, id: 'ds1-t' })
		expect(
			(dataSet?.confRevBumps ?? []).map(
				(bump) =>
					`${bump.controlBlock.id} ${bump.before} -> ${bump.after}${bump.onlyIfBlockSkipped ? ' if skipped' : ''}`,
			),
		).toEqual(testCase.bumps)
		expect(
			(dataSet?.confRevNotRaised ?? []).map(
				(notRaised) => `${notRaised.controlBlock.id} ${notRaised.value} ${notRaised.refusal}`,
			),
		).toEqual(testCase.notRaised)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('reconcile of the configuration revision of a block the template raises itself', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The decision on RC1's own change (its revision 5); every other group accepted. */
		blockDecision: 'accept' | 'skip'
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"RC1's change accepted → the template's revision 5 written": {
			sourceXml: templateRaisingRc1Xml,
			targetXml: instanceAtRevisionOneXml,
			blockDecision: 'accept',
			expectedQueries: ['//default:ReportControl[@name="RC1"][@confRev="5"]'],
		},
		"RC1's change skipped, the data set's order accepted → the project's revision raised to 2": {
			sourceXml: templateRaisingRc1Xml,
			targetXml: instanceAtRevisionOneXml,
			blockDecision: 'skip',
			expectedQueries: [
				'//default:DataSet[@name="DS1"]/default:FCDA[1][@doName="Pos"]',
				'//default:ReportControl[@name="RC1"][@confRev="2"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy: readDiffPolicy({}),
		})
		const decisions = new Map(
			report.groups.map((group) => {
				const isBlock = group.primary.instanceRef?.id === 'rc1-t'
				return [group.id, isBlock ? testCase.blockDecision : 'accept'] as const
			}),
		)
		await target.transaction(async (tx) => {
			await reconcile(tx, {
				sourceQuery: source.query,
				sourceRootRef,
				instanceRootRef,
				accepted: acceptedRefIds({ groups: report.groups, decisions }),
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

/** The node of a report tree for a project element. */
function findNode(params: { node: DiffNode; id: string }): DiffNode | undefined {
	const { node, id: wanted } = params
	if (node.instanceRef?.id === wanted) return node
	for (const child of node.children) {
		const found = findNode({ node: child, id: wanted })
		if (found) return found
	}
	return undefined
}
