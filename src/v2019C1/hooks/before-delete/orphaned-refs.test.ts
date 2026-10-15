import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('cleanOrphanedRefs', () => {
	describe('via document.transaction (delete)', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Core.Document<Config>) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			// DELETE behavior: FunctionCatRef is NOT in KEEP_ON_ORPHAN_REFS → element deleted
			'delete target → pointing ref deleted': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
									<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Function', id: 'f1' })
					})
				},
				expectedQueries: ['//v2019C1:FunctionCategory[@name="Cat1"]'],
				unexpectedQueries: [
					'//default:Function[@name="F1"]',
					'//v2019C1:FunctionCatRef[@functionUuid="uuid-f1"]',
				],
			},

			'delete target → unrelated ref untouched': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
							<Function ${id}="f2" name="F2" uuid="uuid-f2" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
									<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F2" functionUuid="uuid-f2" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Function', id: 'f1' })
					})
				},
				expectedQueries: [
					'//default:Function[@name="F2"]',
					'//v2019C1:FunctionCatRef[@functionUuid="uuid-f2"]',
				],
				unexpectedQueries: ['//default:Function[@name="F1"]'],
			},

			'delete target → only matching ref deleted, other ref preserved': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
							<Function ${id}="f2" name="F2" uuid="uuid-f2" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
									<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
									<eIEC61850-6-100:FunctionCatRef ${id}="ref2" function="Sub1/F2" functionUuid="uuid-f2" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Function', id: 'f1' })
					})
				},
				expectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="uuid-f2"]'],
				unexpectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="uuid-f1"]'],
			},

			// KEEP behavior: SourceRef IS in KEEP_ON_ORPHAN_REFS → element kept, uuid/path attrs cleared
			'delete target (KEEP ref) → ref element preserved with uuid and path attrs cleared': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" iedName="None" lnClass="XCBR" lnInst="1" uuid="uuid-ln1" />
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" iedName="None" lnClass="XSWI" lnInst="1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" input="Pos" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal" />
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'LNode', id: 'ln1' })
					})
				},
				expectedQueries: ['//v2019C1:SourceRef'],
				unexpectedQueries: [
					'//v2019C1:SourceRef[@sourceLNodeUuid]',
					'//v2019C1:SourceRef[@source]',
				],
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

	/**
	 * An equipment that is not connected has no terminal: deleting a connectivity node deletes the
	 * terminals connected to it, the equipment stays.
	 */
	describe('terminals of a deleted connectivity node', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Core.Document<Config>) => Promise<void>
		}

		const L1 = '00000000-0000-4000-8000-000000000001'
		const BB1 = '00000000-0000-4000-8000-000000000002'
		const sourceXml = /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<PowerTransformer name="T1" type="PTR" ${id}="t1">
						<TransformerWinding name="W1" type="PTW" ${id}="w1">
							<NeutralPoint connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="${L1}" ${id}="neutral"/>
						</TransformerWinding>
					</PowerTransformer>
					<VoltageLevel name="VL1" ${id}="vl1">
						<Bay name="B1" ${id}="b1">
							<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
								<Terminal connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="${L1}" ${id}="feeder"/>
							</ConductingEquipment>
							<ConductingEquipment name="QB1" type="DIS" ${id}="qb1">
								<Terminal connectivityNode="S1/VL1/BB/BB1" substationName="S1" voltageLevelName="VL1" bayName="BB" cNodeName="BB1" cNodeUuid="${BB1}" ${id}="busbar-side"/>
							</ConductingEquipment>
							<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="${L1}" ${id}="l1"/>
						</Bay>
						<Bay name="BB" ${id}="bb">
							<ConnectivityNode name="BB1" pathName="S1/VL1/BB/BB1" uuid="${BB1}" ${id}="bb1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>
		`

		const testCases: SclTest.TestCases<TestCase> = {
			'node deleted → its terminals deleted, the equipment and other terminals kept': {
				sourceXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'ConnectivityNode', id: 'l1' })
					})
				},
				expectedQueries: [
					'//default:ConductingEquipment[@name="QA1"]',
					'//default:TransformerWinding[@name="W1"]',
					`//default:ConductingEquipment[@name="QB1"]/default:Terminal[@cNodeUuid="${BB1}"]`,
				],
				unexpectedQueries: [`//default:*[@cNodeUuid="${L1}"]`],
			},
			'busbar Bay deleted → the terminals of other bays connected to its node deleted': {
				sourceXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Bay', id: 'bb' })
					})
				},
				expectedQueries: [
					'//default:ConductingEquipment[@name="QB1"]',
					`//default:Terminal[@cNodeUuid="${L1}"]`,
				],
				unexpectedQueries: [`//default:Terminal[@cNodeUuid="${BB1}"]`],
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
