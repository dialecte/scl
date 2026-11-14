import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import { reconcile } from './reconcile'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { AcceptedIds } from './decide.types'
import type { DecisionGroup } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

// the template's data set holds one FCDA on XCBR1, and the template no KDC
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

// the instance, its IED renamed IED7: its data set holds a second FCDA, on LLN0, and the IED a KDC, neither the template's
const instanceXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
							<DataSet name="DS1" uuid="ds-ins" templateUuid="ds-src" ${id}="ds-t">
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-ins" ${id}="fcda-pos-t"/>
								<FCDA ldInst="LD1" lnClass="LLN0" doName="Mod" fc="ST" lnUuid="ln0-ins" ${id}="fcda-mod-t"/>
							</DataSet>
						</LN0>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-ins" templateUuid="xcbr-src" ${id}="xcbr-t"/>
					</LDevice>
				</Server>
			</AccessPoint>
			<KDC iedName="IED7" apName="AP1" apUuid="ap-ins" ${id}="kdc-t"/>
		</IED>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-t"/>
		</DataTypeTemplates>
	</SCL>
`

// the template's data set given a description: a change of the data set itself
const templateDescribedXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
							<DataSet name="DS1" desc="Trips" uuid="ds-src" ${id}="ds-s">
								<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-src" ${id}="fcda-pos-s"/>
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

describe('diff of the bare tuple references of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The tags the consumer maintains itself (`Resolution.consumerManagedTags`). */
		consumerManagedTags?: Scl.ElementsOf[]
		/** Each decision group: `<change> <tag>:<instance id> <suggested action> [<companion ids>]`. */
		expectedGroups: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"an FCDA and a KDC no template one pairs with → each the project's own, kept unless its removal is accepted":
			{
				sourceXml: templateXml,
				targetXml: instanceXml,
				expectedGroups: ['target-only FCDA:fcda-mod-t skip []', 'target-only KDC:kdc-t skip []'],
			},
		'the data set holding the FCDA changed by the template → the FCDA a group of its own, not one riding the change':
			{
				sourceXml: templateDescribedXml,
				targetXml: instanceXml,
				expectedGroups: [
					'modified DataSet:ds-t accept []',
					'target-only FCDA:fcda-mod-t skip []',
					'target-only KDC:kdc-t skip []',
				],
			},
		'FCDA and KDC among the tags the consumer maintains → still listed, the template may have dropped them':
			{
				sourceXml: templateXml,
				targetXml: instanceXml,
				consumerManagedTags: ['FCDA', 'KDC'],
				expectedGroups: ['target-only FCDA:fcda-mod-t skip []', 'target-only KDC:kdc-t skip []'],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const diffPolicy = readDiffPolicy({
			resolution: { consumerManagedTags: testCase.consumerManagedTags },
		})
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy,
		})
		expect(report.groups.map(describeGroup).sort()).toEqual(testCase.expectedGroups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('reconcile of the bare tuple references of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; accepted?: AcceptedIds }

	const testCases: SclTest.TestCases<TestCase> = {
		'an FCDA and a KDC no template one pairs with, the fast track → both kept, the paired FCDA naming its own logical node':
			{
				sourceXml: templateXml,
				targetXml: instanceXml,
				expectedQueries: [
					'//default:IED[@name="IED7"]//default:DataSet[@name="DS1"]/default:FCDA[@doName="Pos"][@lnUuid="xcbr-ins"]',
					'//default:IED[@name="IED7"]//default:DataSet[@name="DS1"]/default:FCDA[@doName="Mod"][@lnUuid="ln0-ins"]',
					'//default:IED[@name="IED7"]/default:KDC[@apUuid="ap-ins"]',
				],
				unexpectedQueries: ['//default:FCDA[@lnUuid="xcbr-src"]'],
			},
		'the removal of the FCDA accepted → the FCDA removed, the KDC kept': {
			sourceXml: templateXml,
			targetXml: instanceXml,
			accepted: {
				sourceIds: new Set(),
				instanceIds: new Set(['fcda-mod-t']),
				typeChangeIds: new Set(),
			},
			expectedQueries: ['//default:IED[@name="IED7"]/default:KDC[@apUuid="ap-ins"]'],
			unexpectedQueries: ['//default:FCDA[@doName="Mod"]'],
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

/** A decision group as `<change> <tag>:<instance id> <suggested action> [<companion ids>]`. */
function describeGroup(group: DecisionGroup): string {
	const primary = group.primary.instanceRef ?? group.primary.sourceRef
	const companions = group.companions.map(
		(companion) => companion.instanceRef?.id ?? companion.sourceRef?.id,
	)
	return `${group.change} ${group.primary.tagName}:${primary?.id} ${group.suggestedAction} [${companions.join(', ')}]`
}
