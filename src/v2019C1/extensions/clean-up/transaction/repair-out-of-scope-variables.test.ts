import outOfScopeVariables from './fixtures/out-of-scope-variables.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { RepairedVariables } from './repair-out-of-scope-variables.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const bd = 'eIEC61850-6-100'

describe('tx.cleanUp.repairOutOfScopeVariables re-scopes each listed variable to its counterpart, else clears it', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// F1's behaviour reads F2's XCBR1 (an instance of it in F1) and F2's XCBR2 (no instance in F1) by uuid alone
		'a variable with a counterpart and one without → the first given the instance and its path, the second cleared, kept':
			{
				allowIncoherentReferences: 'the stored out-of-scope variables are what the repair fixes',
				sourceXml: outOfScopeVariables,
				expectedQueries: [
					'//v2019C1:InputVar[@varName="pos"][@lnodeUuid="x1"][@dataName="XCBR1.Pos.stVal"]',
					'//v2019C1:InputVar[@varName="other"][not(@lnodeUuid)][not(@dataName)][not(@doName)][not(@daName)]',
				],
			},
		// F1's behaviour names F2's XCBR1 control by uuid alone; F1's XCBR1, an instance of F2's, holds an instance of it
		'an output naming a control of another Function, an instance of it in reach → given that instance and its path':
			{
				allowIncoherentReferences: 'the stored out-of-scope variables are what the repair fixes',
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<Private type="${bd}" ${id}="f1-private">
								<${bd}:BehaviorDescription name="B" ${id}="bd">
									<${bd}:OutputVar varName="out" outputUuid="c2" ${id}="var-out"/>
								</${bd}:BehaviorDescription>
							</Private>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x1" templateUuid="x2" ${id}="x1">
								<Private type="${bd}" ${id}="x1-private">
									<${bd}:LNodeOutputs ${id}="x1-outputs">
										<${bd}:ControlRef output="Oper" uuid="c1" templateUuid="c2" ${id}="c1"/>
									</${bd}:LNodeOutputs>
								</Private>
							</LNode>
						</Function>
						<Function name="F2" ${id}="f2">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="x2" ${id}="x2">
								<Private type="${bd}" ${id}="x2-private">
									<${bd}:LNodeOutputs ${id}="x2-outputs">
										<${bd}:ControlRef output="Oper" uuid="c2" ${id}="c2"/>
									</${bd}:LNodeOutputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
						<DataTypeTemplates ${id}="dtt">
							<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
							<DOType id="DPC_T" cdc="DPC" ${id}="dpc"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="st"/></DOType>
						</DataTypeTemplates>
				</SCL>
			`,
				expectedQueries: [
					'//v2019C1:OutputVar[@varName="out"][@outputUuid="c1"][@outputName="XCBR1.Oper"]',
				],
			},
		// F1's behaviour reads its own XCBR1 by uuid and path
		'nothing out of reach → nothing written': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<Private type="${bd}" ${id}="f1-private">
								<${bd}:BehaviorDescription name="B" ${id}="bd">
									<${bd}:InputVar varName="pos" dataName="XCBR1.Pos.stVal" lnodeUuid="x1" doName="Pos" daName="stVal" ${id}="var-pos"/>
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
			expectedQueries: [
				'//v2019C1:InputVar[@varName="pos"][@lnodeUuid="x1"][@dataName="XCBR1.Pos.stVal"]',
			],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function repair(tx) {
			await tx.cleanUp.repairOutOfScopeVariables()
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('tx.cleanUp.repairOutOfScopeVariables answers what it re-scoped, what it cleared and what it left', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: RepairedVariables }

	const testCases: SclTest.TestCases<TestCase> = {
		// the same document: XCBR1 has an instance in F1, XCBR2 none
		'a variable with a counterpart and one without → one re-scoped, one cleared': {
			allowIncoherentReferences: 'the stored out-of-scope variables are what the repair fixes',
			sourceXml: outOfScopeVariables,
			expected: {
				rescoped: [
					{
						variable: { tagName: 'InputVar', id: 'var-pos' },
						uuidAttribute: 'lnodeUuid',
						target: { tagName: 'LNode', id: 'x2' },
						counterpart: { ref: { tagName: 'LNode', id: 'x1' }, uuid: 'x1' },
					},
				],
				cleared: [
					{
						variable: { tagName: 'InputVar', id: 'var-other' },
						uuidAttribute: 'lnodeUuid',
						target: { tagName: 'LNode', id: 'x5' },
					},
				],
				left: [],
			},
		},
		// F1's behaviour names F2's XCBR1 by uuid twice: one input alone, one output holding its control group too
		'a variable holding both groups → left, answered apart, the other re-scoped': {
			allowIncoherentReferences: 'the stored out-of-scope variables are what the repair fixes',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<Private type="${bd}" ${id}="f1-private">
								<${bd}:BehaviorDescription name="B" ${id}="bd">
									<${bd}:InputVar varName="pos" lnodeUuid="x2" doName="Pos" daName="stVal" ${id}="var-pos"/>
									<${bd}:OutputVar varName="both" lnodeUuid="x2" doName="Pos" outputUuid="elsewhere" ${id}="var-both"/>
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
			expected: {
				rescoped: [
					{
						variable: { tagName: 'InputVar', id: 'var-pos' },
						uuidAttribute: 'lnodeUuid',
						target: { tagName: 'LNode', id: 'x2' },
						counterpart: { ref: { tagName: 'LNode', id: 'x1' }, uuid: 'x1' },
					},
				],
				cleared: [],
				left: [
					{
						variable: { tagName: 'OutputVar', id: 'var-both' },
						uuidAttribute: 'lnodeUuid',
						target: { tagName: 'LNode', id: 'x2' },
						counterpart: { ref: { tagName: 'LNode', id: 'x1' }, uuid: 'x1' },
					},
				],
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		await expect(
			source.transaction(function repair(tx) {
				return tx.cleanUp.repairOutOfScopeVariables()
			}),
		).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
