import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe("updateRefPaths - an LNode's identity follows its lnUuid binding", () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// ── LNode identity ⇔ lnUuid binding ──────────────────────────────────

		'lnode-binding — set lnUuid → identity stamped from the target LN': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED ${id}="ied1" name="PIU">
						<AccessPoint ${id}="ap1" name="AP1">
							<Server ${id}="srv1">
								<LDevice ${id}="ld1" inst="CTRL">
									<LN ${id}="lnied1" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" templateUuid="cswi-tpl" uuid="ln-uuid"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<Substation ${id}="sub1" name="Sub1">
						<Function ${id}="f1" name="F1">
							<LNode ${id}="lnode1" iedName="None" lnClass="CSWI" lnInst="1" prefix="" templateUuid="lnode-tpl"/>
						</Function>
					</Substation>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'LNode', id: 'lnode1' }, { attributes: { lnUuid: 'ln-uuid' } })
				})
			},
			expectedQueries: [
				'//default:LNode[@lnUuid="ln-uuid"][@iedName="PIU"][@ldInst="CTRL"][@prefix="CB"][@lnClass="CSWI"][@lnInst="2"][@templateUuid="lnode-tpl"]',
			],
			unexpectedQueries: [
				'//default:LNode[@iedName="None"]',
				'//default:LNode[@lnType="CSWI_0"]',
				'//default:LNode[@templateUuid="cswi-tpl"]',
			],
		},

		'lnode-binding — clear lnUuid → identity restored from LNodeSpecNaming': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub1" name="Sub1">
						<Function ${id}="f1" name="F1">
							<LNode ${id}="lnode1" iedName="PIU" ldInst="CTRL" lnClass="CSWI" lnInst="2" prefix="CB" lnType="CSWI_0" lnUuid="ln-uuid" templateUuid="lnode-tpl">
								<Private ${id}="priv1" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="lns1" sIedName="None" sLnClass="CSWI" sLnInst="1" sPrefix=""/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED ${id}="ied1" name="PIU">
						<IEDSourceFiles>
							<SclFileReference fileType="ICD"/>
						</IEDSourceFiles>
						<AccessPoint ${id}="ap1" name="AP1">
							<Server ${id}="srv1">
								<Authentication/>
								<LDevice ${id}="ld1" inst="CTRL">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_0"/>
									<LN ${id}="lnied1" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" uuid="ln-uuid"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'LNode', id: 'lnode1' }, { attributes: { lnUuid: '' } })
				})
			},
			expectedQueries: [
				'//default:LNode[@iedName="None"][@lnClass="CSWI"][@lnInst="1"][@templateUuid="lnode-tpl"]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="PIU"]', '//default:LNode[@lnInst="2"]'],
		},

		'lnode-binding — clear lnUuid, LNodeSpecNaming with sLdInst → ldInst back from it': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub1" name="Sub1">
						<Function ${id}="f1" name="F1">
							<LNode ${id}="lnode1" iedName="PIU" ldInst="CTRL" lnClass="CSWI" lnInst="2" prefix="CB" lnType="CSWI_0" lnUuid="ln-uuid" templateUuid="lnode-tpl">
								<Private ${id}="priv1" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="lns1" sLdInst="SPEC_LD" sLnClass="CSWI" sLnInst="1"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED ${id}="ied1" name="PIU">
						<IEDSourceFiles>
							<SclFileReference fileType="ICD"/>
						</IEDSourceFiles>
						<AccessPoint ${id}="ap1" name="AP1">
							<Server ${id}="srv1">
								<Authentication/>
								<LDevice ${id}="ld1" inst="CTRL">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_0"/>
									<LN ${id}="lnied1" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" uuid="ln-uuid"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'LNode', id: 'lnode1' }, { attributes: { lnUuid: '' } })
				})
			},
			expectedQueries: [
				'//default:LNode[@iedName="None"][@ldInst="SPEC_LD"][@lnClass="CSWI"][@lnInst="1"][not(@prefix)][not(@lnUuid)]',
			],
			unexpectedQueries: ['//default:LNode[@ldInst="CTRL"]', '//default:LNode[@iedName="PIU"]'],
		},

		'lnode-binding — clear lnUuid, LNodeSpecNaming without sLnClass → lnClass kept from LNode': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub1" name="Sub1">
						<Function ${id}="f1" name="F1">
							<LNode ${id}="lnode1" iedName="PIU" ldInst="CTRL" lnClass="CSWI" lnInst="2" prefix="CB" lnType="CSWI_0" lnUuid="ln-uuid" templateUuid="lnode-tpl">
								<Private ${id}="priv1" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="lns1" sIedName="None" sLnInst="1" sPrefix=""/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED ${id}="ied1" name="PIU">
						<IEDSourceFiles>
							<SclFileReference fileType="ICD"/>
						</IEDSourceFiles>
						<AccessPoint ${id}="ap1" name="AP1">
							<Server ${id}="srv1">
								<Authentication/>
								<LDevice ${id}="ld1" inst="CTRL">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_0"/>
									<LN ${id}="lnied1" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" uuid="ln-uuid"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'LNode', id: 'lnode1' }, { attributes: { lnUuid: '' } })
				})
			},
			// sLnClass is optional and absent here; lnClass is XSD-required with no
			// default, so it must fall back to the LNode's own current value instead
			// of being stripped.
			expectedQueries: [
				'//default:LNode[@iedName="None"][@lnClass="CSWI"][@lnInst="1"][@templateUuid="lnode-tpl"]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="PIU"]', '//default:LNode[@lnInst="2"]'],
		},

		'lnode-binding — clear lnUuid without LNodeSpecNaming → iedName forced to None': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub1" name="Sub1">
						<Function ${id}="f1" name="F1">
							<LNode ${id}="lnode1" iedName="PIU" ldInst="CTRL" lnClass="CSWI" lnInst="2" prefix="CB" lnUuid="ln-uuid" templateUuid="lnode-tpl"/>
						</Function>
					</Substation>
					<IED ${id}="ied1" name="PIU">
						<IEDSourceFiles>
							<SclFileReference fileType="ICD"/>
						</IEDSourceFiles>
						<AccessPoint ${id}="ap1" name="AP1">
							<Server ${id}="srv1">
								<Authentication/>
								<LDevice ${id}="ld1" inst="CTRL">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_0"/>
									<LN ${id}="lnied1" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" uuid="ln-uuid"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'LNode', id: 'lnode1' }, { attributes: { lnUuid: '' } })
				})
			},
			expectedQueries: [
				'//default:LNode[@iedName="None"][@lnClass="CSWI"][@lnInst="2"][@templateUuid="lnode-tpl"][not(@ldInst)]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="PIU"]'],
		},

		// The binding reconciler is gated on a `lnUuid` delta, so editing any other
		// attribute on an already-coherent bound LNode is a no-op for identity — the
		// hook does not re-stamp on every update. This pins its idempotency: applying
		// the stamped operation cannot cascade into further identity changes.
		'lnode-binding — editing an unrelated attribute on a bound LNode leaves identity untouched': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub1" name="Sub1">
						<Function ${id}="f1" name="F1">
							<LNode ${id}="lnode1" iedName="PIU" ldInst="CTRL" lnClass="CSWI" lnInst="2" prefix="CB" lnUuid="ln-uuid" templateUuid="lnode-tpl"/>
						</Function>
					</Substation>
					<IED ${id}="ied1" name="PIU">
						<IEDSourceFiles>
							<SclFileReference fileType="ICD"/>
						</IEDSourceFiles>
						<AccessPoint ${id}="ap1" name="AP1">
							<Server ${id}="srv1">
								<Authentication/>
								<LDevice ${id}="ld1" inst="CTRL">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_0"/>
									<LN ${id}="lnied1" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" uuid="ln-uuid"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'LNode', id: 'lnode1' }, { attributes: { desc: 'edited' } })
				})
			},
			expectedQueries: [
				'//default:LNode[@iedName="PIU"][@ldInst="CTRL"][@lnClass="CSWI"][@lnInst="2"][@lnUuid="ln-uuid"][@desc="edited"]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="None"]'],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await testCase.act(source)
			return { assertOn: 'source' }
		},
	})
})
