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

// the template's mode object: its control model, then its select timeout
const templateXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
							<DOI name="Mod" ${id}="doi-s">
								<DAI name="ctlModel" ${id}="ctl-s"><Val ${id}="ctl-val-s">status-only</Val></DAI>
								<DAI name="sboTimeout" ${id}="sbo-s"><Val ${id}="sbo-val-s">30000</Val></DAI>
							</DOI>
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

// the instance writes the same two values in the other order
const instanceSwappedXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t">
							<DOI name="Mod" ${id}="doi-t">
								<DAI name="sboTimeout" ${id}="sbo-t"><Val ${id}="sbo-val-t">30000</Val></DAI>
								<DAI name="ctlModel" ${id}="ctl-t"><Val ${id}="ctl-val-t">status-only</Val></DAI>
							</DOI>
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

describe('pairing of the uuid-less children of an instance by their key', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each decision group: `<change> <tag>:<instance or source id> <suggested action>`. */
		expectedGroups: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'two values of one data object written in the other order → each paired with the one of its name, nothing listed':
			{
				sourceXml: templateXml,
				targetXml: instanceSwappedXml,
				expectedGroups: [],
			},
		"the instance holds a value between the template's two → the two paired, the middle one the project's own":
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
										<DOI name="Mod" ${id}="doi-t">
											<DAI name="ctlModel" ${id}="ctl-t"><Val ${id}="ctl-val-t">status-only</Val></DAI>
											<DAI name="operTimeout" ${id}="oper-t"><Val ${id}="oper-val-t">500</Val></DAI>
											<DAI name="sboTimeout" ${id}="sbo-t"><Val ${id}="sbo-val-t">30000</Val></DAI>
										</DOI>
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
				expectedGroups: ['target-only DAI:oper-t skip'],
			},
		'the values of two setting groups written in the other order → each paired with the one of its group, nothing listed':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="template">
						<IED name="TPL" uuid="ied-src" ${id}="ied-s">
							<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
								<Server ${id}="srv-s">
									<Authentication ${id}="auth-s"/>
									<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s">
											<DOI name="StrVal" ${id}="doi-s">
												<DAI name="setMag" ${id}="mag-s">
													<Val sGroup="1" ${id}="val-1-s">10</Val>
													<Val sGroup="2" ${id}="val-2-s">20</Val>
												</DAI>
											</DOI>
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
											<DOI name="StrVal" ${id}="doi-t">
												<DAI name="setMag" ${id}="mag-t">
													<Val sGroup="2" ${id}="val-2-t">20</Val>
													<Val sGroup="1" ${id}="val-1-t">10</Val>
												</DAI>
											</DOI>
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
		"the template's only data object named otherwise than the instance's only one → the template's added, the instance's the project's own":
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
											<DOI name="Beh" ${id}="doi-beh-t">
												<DAI name="stVal" ${id}="beh-t"><Val ${id}="beh-val-t">on</Val></DAI>
											</DOI>
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
				expectedGroups: ['added DOI:doi-s accept', 'target-only DOI:doi-beh-t skip'],
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

describe('reconcile of the uuid-less children of an instance paired by their key', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'two values of one data object written in the other order, the fast track → each value kept under its own name':
			{
				sourceXml: templateXml,
				targetXml: instanceSwappedXml,
				expectedQueries: [
					'//default:DOI[@name="Mod"]/default:DAI[@name="ctlModel"][default:Val="status-only"]',
					'//default:DOI[@name="Mod"]/default:DAI[@name="sboTimeout"][default:Val="30000"]',
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

/** A decision group as `<change> <tag>:<instance or source id> <suggested action>`. */
function describeGroup(group: DecisionGroup): string {
	const primary = group.primary.instanceRef ?? group.primary.sourceRef
	return `${group.change} ${group.primary.tagName}:${primary?.id} ${group.suggestedAction}`
}
