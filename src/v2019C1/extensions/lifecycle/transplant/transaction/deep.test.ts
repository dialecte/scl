import { deep } from './deep'

import { describe } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	ref: { tagName: string; id: string }
	targetParent: { tagName: string; id: string }
	keepNameFrom?: 'source' | 'target'
}

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('import.deep', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'imports a Function subtree and its type closure into the target parent': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation name="S1" ${id}="sub-1">
					<VoltageLevel name="V1" ${id}="vl-1">
						<Bay name="B1" ${id}="bay-1">
							<Function name="Prot" ${id}="fn-1">
								<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>
							</Function>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-1">
						<DO name="Pos" type="DPC_Type" ${id}="do-1"/>
					</LNodeType>
					<DOType id="DPC_Type" cdc="DPC" ${id}="dot-1">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-1"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: /* xml */ `
			<SCL ${ns} ${id}="scl-t">
				<Substation name="S1" ${id}="sub-t">
					<VoltageLevel name="V1" ${id}="vl-t">
						<!-- empty bay, awaiting the imported Function: -->
						<Bay name="B1" ${id}="bay-t"/>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			ref: { tagName: 'Function', id: 'fn-1' },
			targetParent: { tagName: 'Bay', id: 'bay-t' },
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"]',
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Pos"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC_Type"]/default:DA[@name="stVal"]',
			],
		},

		'merges a cloned Private into an existing same-type Private instead of duplicating it': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation name="TEMPLATE" ${id}="sub-1">
					<Private type="eIEC61850-6-100" ${id}="src-priv">
						<eIEC61850-6-100:FunctionCategory ${id}="src-cat" name="SRC_CAT" uuid="src-cat-uuid"/>
					</Private>
				</Substation>
			</SCL>`,
			targetXml: /* xml */ `
			<SCL ${ns} ${id}="scl-t">
				<Substation name="S1" ${id}="sub-t">
					<Private type="eIEC61850-6-100" ${id}="tgt-priv">
						<eIEC61850-6-100:FunctionCategory ${id}="tgt-cat" name="EXISTING_CAT" uuid="existing-cat-uuid"/>
					</Private>
				</Substation>
			</SCL>`,
			ref: { tagName: 'Private', id: 'src-priv' },
			targetParent: { tagName: 'Substation', id: 'sub-t' },
			expectedQueries: [
				// both categories live under the single existing Private
				'//default:Substation/default:Private[@type="eIEC61850-6-100"]/v2019C1:FunctionCategory[@name="EXISTING_CAT"]',
				'//default:Substation/default:Private[@type="eIEC61850-6-100"]/v2019C1:FunctionCategory[@name="SRC_CAT"]',
			],
			unexpectedQueries: [
				// no second Private of the same type is created
				'//default:Substation/default:Private[@type="eIEC61850-6-100"][2]',
			],
		},
		'imports an IED subtree with LN0 and its dependent type closure': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<IED name="VENDOR_A" ${id}="ied-1">
					<AccessPoint name="P1" ${id}="ap-1">
						<Server ${id}="srv-1">
							<LDevice inst="LD0" ${id}="ld-1">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" ${id}="ln0-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="LLN0_Type" lnClass="LLN0" ${id}="lnt-0">
						<DO name="Mod" type="LLN0_ENC_Type" ${id}="do-0"/>
					</LNodeType>
					<DOType id="LLN0_ENC_Type" cdc="ENC" ${id}="dot-0">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-0"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: /* xml */ `
			<SCL ${ns} ${id}="scl-t"/>`,
			ref: { tagName: 'IED', id: 'ied-1' },
			targetParent: { tagName: 'SCL', id: 'scl-t' },
			expectedQueries: [
				'//default:IED[@name="VENDOR_A"]/default:AccessPoint/default:Server/default:LDevice/default:LN0[@lnType="LLN0_Type"]',
				'//default:DataTypeTemplates/default:LNodeType[@id="LLN0_Type"]',
				'//default:DataTypeTemplates/default:DOType[@id="LLN0_ENC_Type"]/default:DA[@name="stVal"]',
			],
		},
		'forks an LN0-owned type on id collision and repoints the cloned LN0 lnType': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<IED name="VENDOR_A" ${id}="ied-1">
					<AccessPoint name="P1" ${id}="ap-1">
						<Server ${id}="srv-1">
							<LDevice inst="LD0" ${id}="ld-1">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" ${id}="ln0-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="LLN0_Type" lnClass="LLN0" ${id}="lnt-0">
						<DO name="Mod" type="LLN0_ENC_Type" ${id}="do-0"/>
					</LNodeType>
					<DOType id="LLN0_ENC_Type" cdc="ENC" ${id}="dot-0">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-0"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: /* xml */ `
			<SCL ${ns} ${id}="scl-t">
				<!-- a pre-existing LN0 keeps the colliding target type alive, so the
				     source type must fork under a hashed id instead of reclaiming it: -->
				<IED name="TARGET" ${id}="ied-t">
					<AccessPoint name="P1" ${id}="ap-t">
						<Server ${id}="srv-t">
							<LDevice inst="LD0" ${id}="ld-t">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" ${id}="ln0-keep"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${id}="dtt-t">
					<!-- same id, different content → source type must fork: -->
					<LNodeType id="LLN0_Type" lnClass="LLN0" ${id}="lnt-t">
						<DO name="Beh" type="LLN0_ENC_Type" ${id}="do-t"/>
					</LNodeType>
					<DOType id="LLN0_ENC_Type" cdc="ENC" ${id}="dot-t">
						<DA name="stVal" bType="INT32" fc="ST" ${id}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			ref: { tagName: 'IED', id: 'ied-1' },
			targetParent: { tagName: 'SCL', id: 'scl-t' },
			expectedQueries: [
				// pre-existing colliding type is preserved (its own LN0 still references it)
				'//default:DataTypeTemplates/default:LNodeType[@id="LLN0_Type"]/default:DO[@name="Beh"]',
				'//default:IED[@name="TARGET"]/default:AccessPoint/default:Server/default:LDevice/default:LN0[@lnType="LLN0_Type"]',
				// the source type forks under a hashed id and the cloned LN0 is repointed to it
				'//default:DataTypeTemplates/default:LNodeType[starts-with(@id, "LLN0_Type_")]/default:DO[@name="Mod"]',
				'//default:IED[@name="VENDOR_A"]/default:AccessPoint/default:Server/default:LDevice/default:LN0[starts-with(@lnType, "LLN0_Type_")]',
			],
			unexpectedQueries: [
				// the cloned LN0 must not keep the un-reconciled source id
				'//default:IED[@name="VENDOR_A"]/default:AccessPoint/default:Server/default:LDevice/default:LN0[@lnType="LLN0_Type"]',
			],
		},
		'keepNameFrom source → deep forwards it so the reused type adopts the incoming id': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<IED name="VENDOR_A" ${id}="ied-1">
					<AccessPoint name="P1" ${id}="ap-1">
						<Server ${id}="srv-1">
							<LDevice inst="LD0" ${id}="ld-1">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_ICD" ${id}="ln0-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="LLN0_ICD" lnClass="LLN0" ${id}="lnt-0">
						<DO name="Mod" type="LLN0_ENC_ICD" ${id}="do-0"/>
					</LNodeType>
					<DOType id="LLN0_ENC_ICD" cdc="ENC" ${id}="dot-0">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-0"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: /* xml */ `
			<SCL ${ns} ${id}="scl-t">
				<IED name="TARGET" ${id}="ied-t">
					<AccessPoint name="P1" ${id}="ap-t">
						<Server ${id}="srv-t">
							<LDevice inst="LD0" ${id}="ld-t">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_SSD" ${id}="ln0-keep"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${id}="dtt-t">
					<!-- structurally equal to the source type, different id: -->
					<LNodeType id="LLN0_SSD" lnClass="LLN0" ${id}="lnt-t">
						<DO name="Mod" type="LLN0_ENC_SSD" ${id}="do-t"/>
					</LNodeType>
					<DOType id="LLN0_ENC_SSD" cdc="ENC" ${id}="dot-t">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			ref: { tagName: 'IED', id: 'ied-1' },
			targetParent: { tagName: 'SCL', id: 'scl-t' },
			keepNameFrom: 'source',
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="LLN0_ICD"]/default:DO[@name="Mod"]',
				'//default:DataTypeTemplates/default:DOType[@id="LLN0_ENC_ICD"]',
				// the pre-existing target LN0 follows the rename
				'//default:IED[@name="TARGET"]/default:AccessPoint/default:Server/default:LDevice/default:LN0[@lnType="LLN0_ICD"]',
				// the cloned source LN0 also references the surviving (incoming) id
				'//default:IED[@name="VENDOR_A"]/default:AccessPoint/default:Server/default:LDevice/default:LN0[@lnType="LLN0_ICD"]',
			],
			unexpectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="LLN0_SSD"]',
				'//default:DataTypeTemplates/default:DOType[@id="LLN0_ENC_SSD"]',
				'//default:LN0[@lnType="LLN0_SSD"]',
			],
		},
		'preserves text-only, empty-flag and namespaced vendor Private on IED clone': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<IED name="VENDOR_A" ${id}="ied-1">
					<Private type="Siemens-MasterId" ${id}="priv-master">23a3beb5-7342-4114-b042-6fb04f2312d2</Private>
					<Private type="eIEC61850-6-100" ${id}="priv-ssd">
						<eIEC61850-6-100:SsdReference desc="SET_Sample1" version="0" revision="14" ${id}="ssd-ref"/>
					</Private>
					<Private type="Siemens-IsSiprotec5IED" ${id}="priv-flag"/>
					<AccessPoint name="P1" ${id}="ap-1">
						<Server ${id}="srv-1">
							<LDevice inst="LD0" ${id}="ld-1">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" ${id}="ln0-1">
									<Private type="Siemens-MasterId" ${id}="priv-ln0">2189c448-8f8a-439e-b3cb-9e87608463d6</Private>
								</LN0>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="LLN0_Type" lnClass="LLN0" ${id}="lnt-0">
						<DO name="Mod" type="LLN0_ENC_Type" ${id}="do-0"/>
					</LNodeType>
					<DOType id="LLN0_ENC_Type" cdc="ENC" ${id}="dot-0">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-0"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: /* xml */ `
			<SCL ${ns} ${id}="scl-t"/>`,
			ref: { tagName: 'IED', id: 'ied-1' },
			targetParent: { tagName: 'SCL', id: 'scl-t' },
			expectedQueries: [
				// text-only vendor Private survives on the IED
				'//default:IED[@name="VENDOR_A"]/default:Private[@type="Siemens-MasterId"]',
				// empty vendor Private survives on the IED
				'//default:IED[@name="VENDOR_A"]/default:Private[@type="Siemens-IsSiprotec5IED"]',
				// namespaced Private and its foreign-ns child survive on the IED
				'//default:IED[@name="VENDOR_A"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:SsdReference',
				// nested text-only vendor Private survives on the LN0
				'//default:IED[@name="VENDOR_A"]/default:AccessPoint/default:Server/default:LDevice/default:LN0/default:Private[@type="Siemens-MasterId"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await deep(tx, {
				sourceQuery: source.query,
				ref: testCase.ref as Scl.Ref<Scl.ElementsOf>,
				targetParent: testCase.targetParent as Scl.Ref<Scl.ElementsOf>,
				withTypes: { keepNameFrom: testCase.keepNameFrom },
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
