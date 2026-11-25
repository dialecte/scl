import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { OutOfScopeVariable } from './out-of-scope-variables.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const bd = 'eIEC61850-6-100'

describe("query.cleanUp.findOutOfScopeVariables lists the stored behaviour variables naming what their behaviour's reach does not hold", () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: OutOfScopeVariable[] }

	const testCases: SclTest.TestCases<TestCase> = {
		// F1's behaviour reads F2's XCBR1 by uuid; F1 holds an instance of it (its templateUuid that XCBR1's uuid)
		'a variable naming an LNode of another Function, an instance of it in reach → listed, the instance its counterpart':
			{
				allowIncoherentReferences:
					"a stored variable naming what its behaviour's reach does not hold, or nothing, is what is listed",
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<Private type="${bd}" ${id}="f1-private">
									<${bd}:BehaviorDescription name="B" ${id}="bd">
										<${bd}:InputVar varName="in" lnodeUuid="x2" doName="Pos" daName="stVal" ${id}="var"/>
									</${bd}:BehaviorDescription>
								</Private>
								<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x1" templateUuid="x2" ${id}="x1"/>
							</Function>
							<Function name="F2" ${id}="f2">
								<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x2" ${id}="x2"/>
							</Function>
						</Substation>
						<DataTypeTemplates ${id}="dtt">
							<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
							<DOType id="DPC_T" cdc="DPC" ${id}="dpc"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="st"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				expected: [
					{
						variable: { tagName: 'InputVar', id: 'var' },
						uuidAttribute: 'lnodeUuid',
						target: { tagName: 'LNode', id: 'x2' },
						counterpart: { ref: { tagName: 'LNode', id: 'x1' }, uuid: 'x1' },
					},
				],
			},
		// F1's behaviour reads F2's XCBR1 by uuid; F1 and F2 hold instances of one template XCBR (templateUuid "t")
		'a variable naming an instance of a template, another instance of it in reach → listed, that instance its counterpart':
			{
				allowIncoherentReferences:
					"a stored variable naming what its behaviour's reach does not hold, or nothing, is what is listed",
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<Private type="${bd}" ${id}="f1-private">
									<${bd}:BehaviorDescription name="B" ${id}="bd">
										<${bd}:InputVar varName="in" lnodeUuid="x2" doName="Pos" daName="stVal" ${id}="var"/>
									</${bd}:BehaviorDescription>
								</Private>
								<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x1" templateUuid="t" ${id}="x1"/>
							</Function>
							<Function name="F2" ${id}="f2">
								<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x2" templateUuid="t" ${id}="x2"/>
							</Function>
						</Substation>
						<DataTypeTemplates ${id}="dtt">
							<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
							<DOType id="DPC_T" cdc="DPC" ${id}="dpc"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="st"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				expected: [
					{
						variable: { tagName: 'InputVar', id: 'var' },
						uuidAttribute: 'lnodeUuid',
						target: { tagName: 'LNode', id: 'x2' },
						counterpart: { ref: { tagName: 'LNode', id: 'x1' }, uuid: 'x1' },
					},
				],
			},
		// F1's XCBR1, an instance of F2's XCBR1, holds a behaviour reading F2's XCBR1 by uuid
		'a variable of a behaviour an LNode holds, naming the LNode it is an instance of → listed, its own LNode the counterpart':
			{
				allowIncoherentReferences:
					"a stored variable naming what its behaviour's reach does not hold, or nothing, is what is listed",
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x1" templateUuid="x2" ${id}="x1">
									<Private type="${bd}" ${id}="x1-private">
										<${bd}:BehaviorDescription name="B" ${id}="bd">
											<${bd}:InputVar varName="in" lnodeUuid="x2" doName="Pos" daName="stVal" ${id}="var"/>
										</${bd}:BehaviorDescription>
									</Private>
								</LNode>
							</Function>
							<Function name="F2" ${id}="f2">
								<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x2" ${id}="x2"/>
							</Function>
						</Substation>
						<DataTypeTemplates ${id}="dtt">
							<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
							<DOType id="DPC_T" cdc="DPC" ${id}="dpc"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="st"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				expected: [
					{
						variable: { tagName: 'InputVar', id: 'var' },
						uuidAttribute: 'lnodeUuid',
						target: { tagName: 'LNode', id: 'x2' },
						counterpart: { ref: { tagName: 'LNode', id: 'x1' }, uuid: 'x1' },
					},
				],
			},
		// F1's behaviour reads F2's XCBR1 by uuid; F1 holds two instances of it
		'two instances in reach → listed, no counterpart': {
			allowIncoherentReferences:
				"a stored variable naming what its behaviour's reach does not hold, or nothing, is what is listed",
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<Private type="${bd}" ${id}="f1-private">
								<${bd}:BehaviorDescription name="B" ${id}="bd">
									<${bd}:InputVar varName="in" lnodeUuid="x2" doName="Pos" daName="stVal" ${id}="var"/>
								</${bd}:BehaviorDescription>
							</Private>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x1" templateUuid="x2" ${id}="x1"/>
							<LNode iedName="None" lnClass="XCBR" lnInst="3" lnType="XCBR_T" uuid="x3" templateUuid="x2" ${id}="x3"/>
						</Function>
						<Function name="F2" ${id}="f2">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x2" ${id}="x2"/>
						</Function>
					</Substation>
					<DataTypeTemplates ${id}="dtt">
						<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
						<DOType id="DPC_T" cdc="DPC" ${id}="dpc"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="st"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			expected: [
				{
					variable: { tagName: 'InputVar', id: 'var' },
					uuidAttribute: 'lnodeUuid',
					target: { tagName: 'LNode', id: 'x2' },
				},
			],
		},
		// F1's behaviour reads F2's XCBR1 by uuid; F1's XCBR1 is no instance of it, and F2's instance is out of reach
		'no element of its lineage in reach → listed, no counterpart': {
			allowIncoherentReferences:
				"a stored variable naming what its behaviour's reach does not hold, or nothing, is what is listed",
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<Private type="${bd}" ${id}="f1-private">
								<${bd}:BehaviorDescription name="B" ${id}="bd">
									<${bd}:InputVar varName="in" lnodeUuid="x2" doName="Pos" daName="stVal" ${id}="var"/>
								</${bd}:BehaviorDescription>
							</Private>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x1" ${id}="x1"/>
						</Function>
						<Function name="F2" ${id}="f2">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x2" ${id}="x2"/>
							<LNode iedName="None" lnClass="XCBR" lnInst="4" lnType="XCBR_T" uuid="x4" templateUuid="x2" ${id}="x4"/>
						</Function>
					</Substation>
					<DataTypeTemplates ${id}="dtt">
						<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
						<DOType id="DPC_T" cdc="DPC" ${id}="dpc"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="st"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			expected: [
				{
					variable: { tagName: 'InputVar', id: 'var' },
					uuidAttribute: 'lnodeUuid',
					target: { tagName: 'LNode', id: 'x2' },
				},
			],
		},
		// F1's behaviour reads its own XCBR1 by uuid and path, and an LNode of another file by uuid alone
		'a variable naming an element in reach, and one naming nothing → none listed': {
			allowIncoherentReferences:
				"a stored variable naming what its behaviour's reach does not hold, or nothing, is what is listed",
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<Private type="${bd}" ${id}="f1-private">
								<${bd}:BehaviorDescription name="B" ${id}="bd">
									<${bd}:InputVar varName="in" dataName="XCBR1.Pos.stVal" lnodeUuid="x1" doName="Pos" daName="stVal" ${id}="var"/>
									<${bd}:OutputVar varName="out" lnodeUuid="elsewhere" doName="Pos" daName="stVal" ${id}="var-elsewhere"/>
								</${bd}:BehaviorDescription>
							</Private>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x1" ${id}="x1"/>
						</Function>
					</Substation>
					<DataTypeTemplates ${id}="dtt">
						<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
						<DOType id="DPC_T" cdc="DPC" ${id}="dpc"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="st"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			expected: [],
		},
		// S1 holds F1 and its XCBR1, no behaviour
		'no behaviour variable → nothing': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x1" ${id}="x1"/>
						</Function>
					</Substation>
					<DataTypeTemplates ${id}="dtt">
						<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
						<DOType id="DPC_T" cdc="DPC" ${id}="dpc"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="st"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			expected: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		await expect(source.query.cleanUp.findOutOfScopeVariables()).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
