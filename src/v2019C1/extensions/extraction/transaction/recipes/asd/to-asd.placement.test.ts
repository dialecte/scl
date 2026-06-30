import { toAsd } from './to-asd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="root" version="2007" revision="C" release="5"/>
`

/**
 * Regression for #1796: satellites referenced from the Application (here the
 * SourceRefs behind the SignalRole's LNodeInputRefs) live under a Function that
 * step 1 already clones. Their clones get remapped uuids, so the source-uuid dedup
 * could not see them and step 3 re-cloned them as misplaced duplicates. They must
 * now be cloned exactly once, under their owning function — never flattened.
 */
describe('toAsd — referenced satellites are not duplicated/misplaced (#1796)', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		applicationId: string
	}

	const act = async ({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> => {
		if (!target) throw new Error('target required')
		await target.transaction(async (tx) => {
			await toAsd(tx, {
				sourceQuery: source.query,
				applicationRef: {
					tagName: 'Application',
					id: testCase.applicationId,
				} as Scl.Ref<'Application'>,
				tool: 'TEST',
				who: 'test',
			})
		})
		return { assertOn: 'target' }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'SourceRefs behind SignalRole refs are cloned once, under their function': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub1-uuid">
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl1-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay1-uuid"/>
						</VoltageLevel>
						<Private ${id}="sub-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app1-uuid">
								<eIEC61850-6-100:FunctionRole ${id}="fr1" name="ROOT" uuid="fr1-uuid">
									<eIEC61850-6-100:FunctionRoleContent ${id}="frc1">
										<eIEC61850-6-100:FunctionRef ${id}="fref1" function="TEMPLATE/Func" functionUuid="func-uuid">
											<eIEC61850-6-100:SignalRole ${id}="sr-in" name="Input" uuid="sr-in-uuid">
												<eIEC61850-6-100:LNodeInputRef ${id}="lnin1" sourceRef="TEMPLATE/Func/IHMI1.Op(1).general" sourceRefUuid="srcref1-uuid"/>
												<eIEC61850-6-100:LNodeInputRef ${id}="lnin2" sourceRef="TEMPLATE/Func/IHMI1.Op(1).q" sourceRefUuid="srcref2-uuid"/>
												<eIEC61850-6-100:LNodeInputRef ${id}="lnin3" sourceRef="TEMPLATE/Func/IHMI1.Op(1).t" sourceRefUuid="srcref3-uuid"/>
											</eIEC61850-6-100:SignalRole>
										</eIEC61850-6-100:FunctionRef>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function ${id}="func1" name="Func" uuid="func-uuid">
							<LNode ${id}="lnode1" iedName="None" lnType="ELIA_IHMI" uuid="lnode-uuid">
								<Private ${id}="lnode-priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" input="Op" inputInst="1" pDA="general" pDO="Op" pLN="PTOC" uuid="srcref1-uuid"/>
										<eIEC61850-6-100:SourceRef ${id}="sref2" input="Op" inputInst="1" pDA="q" pDO="Op" pLN="PTOC" uuid="srcref2-uuid"/>
										<eIEC61850-6-100:SourceRef ${id}="sref3" input="Op" inputInst="1" pDA="t" pDO="Op" pLN="PTOC" uuid="srcref3-uuid"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<DataTypeTemplates ${id}="dtt">
						<LNodeType ${id}="lnt1" id="ELIA_IHMI" lnClass="IHMI">
							<DO ${id}="do1" name="Mod" type="ELIA_ENC_Mod"/>
						</LNodeType>
						<DOType ${id}="dot1" id="ELIA_ENC_Mod" cdc="ENC">
							<DA ${id}="da1" bType="BOOLEAN" name="stVal" fc="ST"/>
						</DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			targetXml: emptyTargetXml,
			applicationId: 'app1',
			expectedQueries: [
				// Cloned exactly once, under their owning function's LNodeInputs.
				'//default:Function[@name="Func"]//v2019C1:LNodeInputs[count(v2019C1:SourceRef)=3]',
			],
			unexpectedQueries: [
				// No misplaced duplicate directly under Substation.
				'//default:Substation/v2019C1:SourceRef',
				// No 4th/5th/6th SourceRef anywhere (no duplication).
				'(//v2019C1:SourceRef)[4]',
			],
		},
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
