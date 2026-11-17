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
			'behavior-description — LNode given another instance, an InputVar naming it and a SourceRef below it → both paths of the InputVar follow':
				{
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
										<eIEC61850-6-100:InputVar ${id}="ivar1" varName="ivar1" dataName="XCBR1.Pos.stVal" lnodeUuid="uuid-ln1" doName="Pos" daName="stVal" inputName="XCBR1.TripCmd" inputUuid="uuid-sref1"/>
									</eIEC61850-6-100:BehaviorDescription>
								</Function>
							</Substation>
						</SCL>
					`,
					act: async (document) => {
						await document.transaction(async (tx) => {
							await tx.update({ tagName: 'LNode', id: 'ln1' }, { attributes: { lnInst: '2' } })
						})
					},
					expectedQueries: [
						'//v2019C1:InputVar[@dataName="XCBR2.Pos.stVal" and @inputName="XCBR2.TripCmd"]',
					],
					unexpectedQueries: [
						'//v2019C1:InputVar[@dataName="XCBR1.Pos.stVal" or @inputName="XCBR1.TripCmd"]',
					],
				},
			'behavior-description — LNode given another instance, an OutputVar naming it and a ControlRef below it → both paths of the OutputVar follow':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} ${id}="root">
							<Substation ${id}="sub1" name="Sub1">
								<Function ${id}="f1" name="F1">
									<LNode ${id}="ln1" lnClass="CSWI" lnInst="1" uuid="uuid-ln1">
										<eIEC61850-6-100:LNodeOutputs ${id}="lno1">
											<eIEC61850-6-100:ControlRef ${id}="cref1" uuid="uuid-cref1" output="Oper"/>
										</eIEC61850-6-100:LNodeOutputs>
									</LNode>
									<eIEC61850-6-100:BehaviorDescription ${id}="bd1" name="BD1">
										<eIEC61850-6-100:OutputVar ${id}="ovar1" varName="ovar1" dataName="CSWI1.Pos" lnodeUuid="uuid-ln1" doName="Pos" outputName="CSWI1.Oper" outputUuid="uuid-cref1"/>
									</eIEC61850-6-100:BehaviorDescription>
								</Function>
							</Substation>
						</SCL>
					`,
					act: async (document) => {
						await document.transaction(async (tx) => {
							await tx.update({ tagName: 'LNode', id: 'ln1' }, { attributes: { lnInst: '2' } })
						})
					},
					expectedQueries: [
						'//v2019C1:OutputVar[@dataName="CSWI2.Pos" and @outputName="CSWI2.Oper"]',
					],
					unexpectedQueries: [
						'//v2019C1:OutputVar[@dataName="CSWI1.Pos" or @outputName="CSWI1.Oper"]',
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

	describe('terminals follow their connectivity node', () => {
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
			'VoltageLevel then its Bay renamed in one transaction → the node and its terminals follow both names':
				{
					sourceXml,
					act: async (document) => {
						await document.transaction(async (tx) => {
							await tx.update(
								{ tagName: 'VoltageLevel', id: 'vl1' },
								{ attributes: { name: 'VL9' } },
							)
							await tx.update({ tagName: 'Bay', id: 'b1' }, { attributes: { name: 'B9' } })
						})
					},
					expectedQueries: [
						'//default:ConnectivityNode[@name="L1" and @pathName="S1/VL9/B9/L1"]',
						`//default:Terminal[@cNodeUuid="${L1}" and @connectivityNode="S1/VL9/B9/L1" and @voltageLevelName="VL9" and @bayName="B9"]`,
						`//default:NeutralPoint[@connectivityNode="S1/VL9/B9/L1" and @voltageLevelName="VL9" and @bayName="B9"]`,
						`//default:Terminal[@cNodeUuid="${BB1}" and @connectivityNode="S1/VL9/BB/BB1" and @voltageLevelName="VL9"]`,
					],
					unexpectedQueries: ['//default:*[@voltageLevelName="VL1"]', '//default:*[@bayName="B1"]'],
				},
			'Bay then its VoltageLevel renamed in one transaction → the node and its terminals follow both names':
				{
					sourceXml,
					act: async (document) => {
						await document.transaction(async (tx) => {
							await tx.update({ tagName: 'Bay', id: 'b1' }, { attributes: { name: 'B9' } })
							await tx.update(
								{ tagName: 'VoltageLevel', id: 'vl1' },
								{ attributes: { name: 'VL9' } },
							)
						})
					},
					expectedQueries: [
						'//default:ConnectivityNode[@name="L1" and @pathName="S1/VL9/B9/L1"]',
						`//default:Terminal[@cNodeUuid="${L1}" and @connectivityNode="S1/VL9/B9/L1" and @voltageLevelName="VL9" and @bayName="B9"]`,
						`//default:NeutralPoint[@connectivityNode="S1/VL9/B9/L1" and @voltageLevelName="VL9" and @bayName="B9"]`,
						`//default:Terminal[@cNodeUuid="${BB1}" and @connectivityNode="S1/VL9/BB/BB1" and @voltageLevelName="VL9"]`,
					],
					unexpectedQueries: ['//default:*[@voltageLevelName="VL1"]', '//default:*[@bayName="B1"]'],
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
