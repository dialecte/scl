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
							<FunctionCategory ${id}="fcat1" name="Cat1">
								<FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
							</FunctionCategory>
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'Function', id: 'f1' }, { attributes: { name: 'F1New' } })
					})
				},
				expectedQueries: ['//default:FunctionCatRef[@function="Sub1/F1New"]'],
				unexpectedQueries: ['//default:FunctionCatRef[@function="Sub1/F1"]'],
			},

			'direct — uuid mismatch → only matching ref updated, other untouched': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<FunctionCategory ${id}="fcat1" name="Cat1">
								<FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
								<FunctionCatRef ${id}="ref2" function="Sub1/F2" functionUuid="uuid-f2" />
							</FunctionCategory>
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
							<Function ${id}="f2" name="F2" uuid="uuid-f2" />
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'Function', id: 'f1' }, { attributes: { name: 'F1New' } })
					})
				},
				expectedQueries: [
					'//default:FunctionCatRef[@function="Sub1/F1New"]',
					'//default:FunctionCatRef[@function="Sub1/F2"]',
				],
				unexpectedQueries: ['//default:FunctionCatRef[@function="Sub1/F1"]'],
			},

			// ── Strategy: lnode ─────────────────────────────────────────────────

			'lnode — update LNode lnInst → SourceRef.source updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1" />
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<LNodeInputs ${id}="lni1">
										<SourceRef ${id}="sref1" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal" />
									</LNodeInputs>
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
				expectedQueries: ['//default:SourceRef[@source="Sub1/F1/XCBR2"]'],
				unexpectedQueries: ['//default:SourceRef[@source="Sub1/F1/XCBR1"]'],
			},

			'lnode — update LNode lnInst → SourceRef.source with DO/DA suffix preserved': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1" />
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<LNodeInputs ${id}="lni1">
										<SourceRef ${id}="sref1" source="Sub1/F1/XCBR1.Pos.stVal" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal" />
									</LNodeInputs>
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
				expectedQueries: ['//default:SourceRef[@source="Sub1/F1/XCBR2.Pos.stVal"]'],
				unexpectedQueries: ['//default:SourceRef[@source="Sub1/F1/XCBR1.Pos.stVal"]'],
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
												<ExtRef ${id}="extref1" intAddr="TrCmd.stVal" uuid="uuid-extref1" />
											</Inputs>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XSWI" lnInst="1">
									<LNodeInputs ${id}="lni1">
										<SourceRef ${id}="sref1" extRefAddr="IED1/LD0/XCBR1.TrCmd.stVal" extRefUuid="uuid-extref1" />
									</LNodeInputs>
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
				expectedQueries: ['//default:SourceRef[@extRefAddr="IED1/LD0/XCBR1.TrCmd2.stVal"]'],
				unexpectedQueries: ['//default:SourceRef[@extRefAddr="IED1/LD0/XCBR1.TrCmd.stVal"]'],
			},

			// ── Ancestor rename (descendant ref path propagation) ────────────────

			'ancestor rename — rename Bay → FunctionCatRef descendant path updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<VoltageLevel ${id}="vl1" name="V1">
								<Bay ${id}="bay1" name="B1">
									<Function ${id}="f1" name="F1" uuid="uuid-f1" />
								</Bay>
							</VoltageLevel>
							<FunctionCategory ${id}="fcat1" name="Cat1">
								<FunctionCatRef ${id}="ref1" function="Sub1/V1/B1/F1" functionUuid="uuid-f1" />
							</FunctionCategory>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'Bay', id: 'bay1' }, { attributes: { name: 'B2' } })
					})
				},
				expectedQueries: ['//default:FunctionCatRef[@function="Sub1/V1/B2/F1"]'],
				unexpectedQueries: ['//default:FunctionCatRef[@function="Sub1/V1/B1/F1"]'],
			},

			'ancestor rename — rename Substation → SourceRef lnode descendant path updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1" />
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<LNodeInputs ${id}="lni1">
										<SourceRef ${id}="sref1" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal" />
									</LNodeInputs>
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
				expectedQueries: ['//default:SourceRef[@source="Sub1New/F1/XCBR1"]'],
				unexpectedQueries: ['//default:SourceRef[@source="Sub1/F1/XCBR1"]'],
			},

			// ── Strategy: behavior-description ───────────────────────────────────

			'behavior-description — update SourceRef.input → InputVar.inputName updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1">
									<LNodeInputs ${id}="lni1">
										<SourceRef ${id}="sref1" uuid="uuid-sref1" input="TripCmd" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal" />
									</LNodeInputs>
								</LNode>
								<BehaviorDescription ${id}="bd1" name="BD1">
									<InputVar ${id}="ivar1" varName="ivar1" inputName="TripCmd" inputUuid="uuid-sref1" />
								</BehaviorDescription>
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
				expectedQueries: ['//default:InputVar[@inputName="TripCmd2"]'],
				unexpectedQueries: ['//default:InputVar[@inputName="TripCmd"]'],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source, testCase }) => {
				await testCase.act(source.document as Core.Document<Config>)
				return { assertDatabaseName: source.databaseName }
			},
		})
	})
})
