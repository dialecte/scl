import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('a moved element keeps its identity, its lineage and its binding', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		element: Scl.Ref<Scl.ElementsOf>
		parent: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// the LNode of F1 is bound to PTRC1 of the IED A, specified on it, instantiated from a template
		'a bound LNode instantiated from a template moved to F2 → uuid, lineage, binding and specified naming kept':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="s1" name="S1">
						<VoltageLevel ${id}="vl1" name="VL1">
							<Bay ${id}="b1" name="B1">
								<Function ${id}="f1" name="F1" uuid="f1">
									<LNode ${id}="lnode" iedName="A" ldInst="LD1" prefix="" lnClass="PTRC" lnInst="1" lnUuid="ln-a" uuid="lnode-uuid" templateUuid="template-uuid">
										<Private ${id}="lnode-private" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming ${id}="naming" sIedName="A" sLdInst="LD1" sPrefix="" sLnClass="PTRC" sLnInst="1" />
										</Private>
									</LNode>
								</Function>
								<Function ${id}="f2" name="F2" uuid="f2" />
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED ${id}="ied-a" name="A">
						<AccessPoint ${id}="ap1" name="AP1">
							<Server ${id}="server">
								<Authentication ${id}="authentication" />
								<LDevice ${id}="ld1" inst="LD1">
									<LN0 ${id}="lln0" lnClass="LLN0" inst="" lnType="LN_T" />
									<LN ${id}="ptrc1" lnClass="PTRC" inst="1" prefix="" lnType="LN_T" uuid="ln-a" />
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<DataTypeTemplates ${id}="types">
						<LNodeType ${id}="ln-type" id="LN_T" lnClass="PTRC">
							<DO ${id}="op" name="Op" type="ACT_T" />
						</LNodeType>
						<DOType ${id}="act" id="ACT_T" cdc="ACT">
							<DA ${id}="general" name="general" bType="BOOLEAN" fc="ST" />
						</DOType>
					</DataTypeTemplates>
				</SCL>
			`,
				expectedQueries: [
					'//default:Function[@name="F2"]/default:LNode[@uuid="lnode-uuid"][@templateUuid="template-uuid"][@lnUuid="ln-a"][@iedName="A"]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="A"][@sLnClass="PTRC"]',
				],
				element: { tagName: 'LNode', id: 'lnode' },
				parent: { tagName: 'Function', id: 'f2' },
				unexpectedQueries: ['//default:Function[@name="F1"]/default:LNode'],
			},
		// B1 is an instance of a bay template; its application A1 carries its template and origin; B2 is a plain bay
		'an application of an instance moved to a plain bay → its uuid, template and origin kept': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="s1" name="S1">
						<VoltageLevel ${id}="vl1" name="VL1">
							<Bay ${id}="b1" name="B1" uuid="b1" templateUuid="bay-template">
								<Private ${id}="b1-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:Application ${id}="a1" name="A1" uuid="a1" templateUuid="application-template" originUuid="application-origin">
										<eIEC61850-6-100:FunctionRole ${id}="r1" name="R1">
											<eIEC61850-6-100:FunctionRoleContent ${id}="content" />
										</eIEC61850-6-100:FunctionRole>
									</eIEC61850-6-100:Application>
								</Private>
							</Bay>
							<Bay ${id}="b2" name="B2" uuid="b2">
								<Private ${id}="b2-private" type="eIEC61850-6-100" />
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			element: { tagName: 'Application', id: 'a1' },
			parent: { tagName: 'Private', id: 'b2-private' },
			expectedQueries: [
				'//default:Bay[@name="B2"]//v2019C1:Application[@name="A1"][@uuid="a1"][@templateUuid="application-template"][@originUuid="application-origin"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function move(tx) {
			await tx.any.move(testCase.element, { parent: testCase.parent })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
