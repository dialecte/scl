import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('updateRefPaths', () => {
	describe('via document.transaction (update)', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Core.Document<Config>) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			// ── Strategy: direct ────────────────────────────────────────────────

			'direct — rename target → ref path attr updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
								<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1"/>
							</eIEC61850-6-100:FunctionCategory>
							<Function ${id}="f1" name="F1" uuid="uuid-f1"/>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'Function', id: 'f1' }, { attributes: { name: 'F1New' } })
					})
				},
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/F1New"]'],
				unexpectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/F1"]'],
			},

			'direct — uuid mismatch → only matching ref updated, other untouched': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
								<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1"/>
								<eIEC61850-6-100:FunctionCatRef ${id}="ref2" function="Sub1/F2" functionUuid="uuid-f2"/>
							</eIEC61850-6-100:FunctionCategory>
							<Function ${id}="f1" name="F1" uuid="uuid-f1"/>
							<Function ${id}="f2" name="F2" uuid="uuid-f2"/>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'Function', id: 'f1' }, { attributes: { name: 'F1New' } })
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionCatRef[@function="Sub1/F1New"]',
					'//v2019C1:FunctionCatRef[@function="Sub1/F2"]',
				],
				unexpectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/F1"]'],
			},

			// ── Strategy: lnode ─────────────────────────────────────────────────

			'lnode — update LNode lnInst → SourceRef.source updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1"/>
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'LNode', id: 'ln1' }, { attributes: { lnInst: '2' } })
					})
				},
				expectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR2"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR1"]'],
			},

			'lnode — update LNode lnInst → SourceRef.source with DO/DA suffix preserved': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1"/>
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" source="Sub1/F1/XCBR1.Pos.stVal" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'LNode', id: 'ln1' }, { attributes: { lnInst: '2' } })
					})
				},
				expectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR2.Pos.stVal"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR1.Pos.stVal"]'],
			},

			// ── Strategy: ied-address ────────────────────────────────────────────

			'ied-address — update ExtRef.intAddr → SourceRef.extRefAddr updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<IED ${id}="ied1" name="IED1">
							<AccessPoint ${id}="ap1" name="AP1">
								<Server ${id}="srv1">
									<LDevice ${id}="ld1" inst="LD0">
										<LN ${id}="lnied1" lnClass="XCBR" inst="1">
											<Inputs ${id}="inp1">
												<ExtRef ${id}="extref1" intAddr="TrCmd.stVal" uuid="uuid-extref1"/>
											</Inputs>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XSWI" lnInst="1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" extRefAddr="IED1/LD0/XCBR1.TrCmd.stVal" extRefUuid="uuid-extref1"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'ExtRef', id: 'extref1' },
							{ attributes: { intAddr: 'TrCmd2.stVal' } },
						)
					})
				},
				expectedQueries: ['//v2019C1:SourceRef[@extRefAddr="IED1/LD0/XCBR1.TrCmd2.stVal"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@extRefAddr="IED1/LD0/XCBR1.TrCmd.stVal"]'],
			},

			// ── Ancestor rename (descendant ref path propagation) ────────────────

			'ancestor rename — rename Bay → FunctionCatRef descendant path updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<VoltageLevel ${id}="vl1" name="V1">
								<Bay ${id}="bay1" name="B1">
									<Function ${id}="f1" name="F1" uuid="uuid-f1"/>
								</Bay>
							</VoltageLevel>
							<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
								<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/V1/B1/F1" functionUuid="uuid-f1"/>
							</eIEC61850-6-100:FunctionCategory>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'Bay', id: 'bay1' }, { attributes: { name: 'B2' } })
					})
				},
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/V1/B2/F1"]'],
				unexpectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/V1/B1/F1"]'],
			},

			'ancestor rename — rename Substation → SourceRef lnode descendant path updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1"/>
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'Substation', id: 'sub1' },
							{ attributes: { name: 'Sub1New' } },
						)
					})
				},
				expectedQueries: ['//v2019C1:SourceRef[@source="Sub1New/F1/XCBR1"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR1"]'],
			},

			// ── Strategy: behavior-description ───────────────────────────────────

			'behavior-description — update SourceRef.input → InputVar.inputName updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" uuid="uuid-sref1" input="TripCmd" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
								<eIEC61850-6-100:BehaviorDescription ${id}="bd1" name="BD1">
									<eIEC61850-6-100:InputVar ${id}="ivar1" varName="ivar1" inputName="TripCmd" inputUuid="uuid-sref1"/>
								</eIEC61850-6-100:BehaviorDescription>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'SourceRef', id: 'sref1' },
							{ attributes: { input: 'TripCmd2' } },
						)
					})
				},
				expectedQueries: ['//v2019C1:InputVar[@inputName="TripCmd2"]'],
				unexpectedQueries: ['//v2019C1:InputVar[@inputName="TripCmd"]'],
			},

			// ── Companion DO/DA ⇔ path qualifier coherence ───────────────────────

			'companion — update SourceRef.sourceDaName → source qualifier rebuilt from companions': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1"/>
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" source="Sub1/F1/XCBR1.Pos.stVal" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'SourceRef', id: 'sref1' },
							{ attributes: { sourceDaName: 'q' } },
						)
					})
				},
				expectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR1.Pos.q"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR1.Pos.stVal"]'],
			},

			'companion — update SourceRef DO+DA names → source qualifier rebuilt from companions': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1"/>
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" source="Sub1/F1/XCBR1.Pos.stVal" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'SourceRef', id: 'sref1' },
							{ attributes: { sourceDoName: 'OpCls', sourceDaName: 'general' } },
						)
					})
				},
				expectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR1.OpCls.general"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR1.Pos.stVal"]'],
			},

			'companion — update ControlRef.controlledDoName → controlled qualifier rebuilt from companion':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} ${id}="root">
							<Substation ${id}="sub1" name="Sub1">
								<Function ${id}="f1" name="F1">
									<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1"/>
								</Function>
								<Function ${id}="f2" name="F2">
									<LNode ${id}="ln2" lnClass="CSWI" lnInst="1">
										<eIEC61850-6-100:LNodeOutputs ${id}="lno1">
											<eIEC61850-6-100:ControlRef ${id}="cref1" controlled="Sub1/F1/XCBR1.Pos" controlledLNodeUuid="uuid-ln1" controlledDoName="Pos"/>
										</eIEC61850-6-100:LNodeOutputs>
									</LNode>
								</Function>
							</Substation>
						</SCL>
					`,
					act: async (document) => {
						await document.transaction(async (tx) => {
							await tx.update(
								{ tagName: 'ControlRef', id: 'cref1' },
								{ attributes: { controlledDoName: 'OpCls' } },
							)
						})
					},
					expectedQueries: ['//v2019C1:ControlRef[@controlled="Sub1/F1/XCBR1.OpCls"]'],
					unexpectedQueries: ['//v2019C1:ControlRef[@controlled="Sub1/F1/XCBR1.Pos"]'],
				},

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
						await tx.update(
							{ tagName: 'LNode', id: 'lnode1' },
							{ attributes: { lnUuid: 'ln-uuid' } },
						)
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
})
