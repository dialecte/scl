import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// An input of an IED file imported again, its lineage missing, pairs with the project's by its key: an input offered for
// later binding by its internal address and what it expects, any other by its source and service; several of one key
// in order, each said paired among twins.
describe('pairing by key of the inputs an IED file imported again names by other uuids', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		sourceRoot: Scl.Ref<Scl.ElementsOf>
		instanceRoot: Scl.Ref<Scl.ElementsOf>
		/** Each node paired by key (`by key <tag>:<id>`), then each paired among twins (`among twins <tag>:<id>`). */
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"an input for later binding of the template and the project's, of other lineages, the same internal address and expectations → paired by its internal address":
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
												<ExtRef intAddr="Trip" pServT="GOOSE" pLN="PTRC" pDO="Tr" pDA="general" uuid="ext-new" ${id}="ext-s"/>
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
												<ExtRef intAddr="Trip" pServT="GOOSE" pLN="PTRC" pDO="Tr" pDA="general" uuid="ext-own" templateUuid="ext-old" ${id}="ext-t"/>
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
				expected: ['by key ExtRef:ext-t'],
			},
		"an input bound to a source in the template and the project's, of other lineages, no internal address, the same source and service → paired by its source":
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
												<ExtRef iedName="P1" ldInst="LD1" prefix="" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal" serviceType="GOOSE" srcCBName="Pos" uuid="ext-new" ${id}="ext-s"/>
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
												<ExtRef iedName="P1" ldInst="LD1" prefix="" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal" serviceType="GOOSE" srcCBName="Pos" uuid="ext-own" templateUuid="ext-old" ${id}="ext-t"/>
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
				expected: ['by key ExtRef:ext-t'],
			},
		"two inputs of the project of other lineages with one internal address, the template's two of it → paired in order, each said paired among twins":
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
												<ExtRef intAddr="intPos" pDO="Pos" uuid="ext-new-1" ${id}="ext-s1"/>
												<ExtRef intAddr="intPos" pDO="Pos" uuid="ext-new-2" ${id}="ext-s2"/>
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
												<ExtRef intAddr="intPos" pDO="Pos" uuid="ext-own-1" templateUuid="ext-old-1" ${id}="ext-t1"/>
												<ExtRef intAddr="intPos" pDO="Pos" uuid="ext-own-2" templateUuid="ext-old-2" ${id}="ext-t2"/>
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
				expected: [
					'among twins ExtRef:ext-t1',
					'among twins ExtRef:ext-t2',
					'by key ExtRef:ext-t1',
					'by key ExtRef:ext-t2',
				],
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
		expect(pairedOf(report.root).sort()).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** Each node of a report tree paired by key, and each paired among twins. */
function pairedOf(node: DiffNode): string[] {
	const ref = `${node.tagName}:${node.instanceRef?.id}`
	const own = [
		...(node.pairedByKey ? [`by key ${ref}`] : []),
		...(node.pairedAmongTwins ? [`among twins ${ref}`] : []),
	]
	return [...own, ...node.children.flatMap(pairedOf)]
}
