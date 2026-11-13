import { diff } from './diff'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DiffSummary } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expectedSummary: DiffSummary
}

describe('diff of the tuple references of an instance', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'instance of an IED renamed, its FCDA and ExtRef naming its own logical node → nothing modified':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<DataSet name="DS1" uuid="ds-src" ${id}="ds-s">
												<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-src" ${id}="fcda-s"/>
											</DataSet>
											<Inputs ${id}="inputs-s">
												<ExtRef iedName="TPL" ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal" lnUuid="xcbr-src" uuid="ext-src" ${id}="ext-s"/>
											</Inputs>
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
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="project">
						<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
							<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
								<Server ${id}="srv-t">
									<Authentication ${id}="auth-t"/>
									<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
											<DataSet name="DS1" uuid="ds-ins" templateUuid="ds-src" ${id}="ds-t">
												<FCDA ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" fc="ST" lnUuid="xcbr-ins" ${id}="fcda-t"/>
											</DataSet>
											<Inputs ${id}="inputs-t">
												<ExtRef iedName="IED7" ldInst="LD1" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal" lnUuid="xcbr-ins" uuid="ext-ins" templateUuid="ext-src" ${id}="ext-t"/>
											</Inputs>
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
				`,
				expectedSummary: { added: 0, removed: 0, modified: 0, kept: 0 },
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef: { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>,
			instanceRootRef: { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>,
		})
		expect(report.summary).toEqual(testCase.expectedSummary)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
