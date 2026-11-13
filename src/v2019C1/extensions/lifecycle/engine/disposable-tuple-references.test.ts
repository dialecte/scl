import { diff } from './diff'
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

describe('diff of the bare tuple references of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		expectedRemoved: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an FCDA and a KDC no template one pairs with → both removed, the FCDA naming the logical node of the template one paired':
			{
				sourceXml: templateXml,
				targetXml: instanceXml,
				expectedRemoved: ['FCDA:fcda-mod-t', 'KDC:kdc-t'],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
		})
		expect(removedOf(report.root).sort()).toEqual(testCase.expectedRemoved)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('reconcile of the bare tuple references of an instance', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'an FCDA and a KDC no template one pairs with, the fast track → both deleted, the paired FCDA naming its own logical node':
			{
				sourceXml: templateXml,
				targetXml: instanceXml,
				expectedQueries: [
					'//default:IED[@name="IED7"]//default:DataSet[@name="DS1"]/default:FCDA[@doName="Pos"][@lnUuid="xcbr-ins"]',
				],
				unexpectedQueries: [
					'//default:FCDA[@doName="Mod"]',
					'//default:IED[@name="IED7"]/default:KDC',
					'//default:FCDA[@lnUuid="xcbr-src"]',
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

/** The `tag:id` of every element a diff tree lists as removed. */
function removedOf(node: DiffNode): string[] {
	const own =
		node.change === 'removed' && node.instanceRef ? [`${node.tagName}:${node.instanceRef.id}`] : []
	return [...own, ...node.children.flatMap(removedOf)]
}
