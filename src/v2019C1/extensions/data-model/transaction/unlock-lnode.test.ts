import { unlockLNode } from './unlock-lnode'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * A breaker LNode specified as XCBR1, bound (`binding`) to the IED's Q0XCBR2: its Pos and its
 * ctlModel instantiated in the LN, a trip input and an operate output implemented in the IED.
 */
function boundBreakerXml(binding = 'lnUuid="ln-uuid" iedName="P1" ldInst="LD0"'): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<IED ${id}="ied" name="P1">
				<AccessPoint ${id}="access-point" name="AP1">
					<Server ${id}="server">
						<LDevice ${id}="ldevice" inst="LD0">
							<LN ${id}="ln" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="ln-uuid">
								<DOI ${id}="doi-pos" name="Pos">
									<DAI ${id}="dai-ctl-model" name="ctlModel">
										<Val>status-only</Val>
									</DAI>
								</DOI>
								<DOI ${id}="doi-beh" name="Beh" />
								<Inputs ${id}="inputs">
									<ExtRef ${id}="ext-ref" intAddr="Trip.general" uuid="ext-ref-uuid" />
								</Inputs>
							</LN>
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
			<Substation ${id}="substation" name="S1">
				<Function ${id}="function" name="F1">
					<LNode ${id}="breaker" ${binding} prefix="Q0" lnClass="XCBR" lnInst="2" lnType="XCBR_T">
						<Private ${id}="breaker-private" type="eIEC61850-6-100">
							<eIEC61850-6-100:LNodeSpecNaming ${id}="breaker-naming" sLnClass="XCBR" sLnInst="1" />
							<eIEC61850-6-100:DOS ${id}="dos-pos" name="Pos">
								<eIEC61850-6-100:DAS ${id}="das-ctl-model" name="ctlModel">
									<eIEC61850-6-100:Val>status-only</eIEC61850-6-100:Val>
								</eIEC61850-6-100:DAS>
							</eIEC61850-6-100:DOS>
							<eIEC61850-6-100:LNodeInputs ${id}="lnode-inputs">
								<eIEC61850-6-100:SourceRef ${id}="source-ref" input="Trip" extRefAddr="P1/LD0/Q0XCBR2.Trip.general" extRefUuid="ext-ref-uuid" />
							</eIEC61850-6-100:LNodeInputs>
							<eIEC61850-6-100:LNodeOutputs ${id}="lnode-outputs">
								<eIEC61850-6-100:ControlRef ${id}="control-ref" output="Oper" extCtrlAddr="P1/LD0/Q0XCBR2.Oper" />
							</eIEC61850-6-100:LNodeOutputs>
						</Private>
					</LNode>
				</Function>
			</Substation>
		</SCL>
	`
}

describe('unlockLNode', () => {
	type TestCase = SclTest.BaseXmlTestCase

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode bound to an IED -> assigned to no IED, its naming back from LNodeSpecNaming, which stays':
			{
				sourceXml: boundBreakerXml(),
				expectedQueries: [
					'//default:LNode[@iedName="None"][@lnClass="XCBR"][@lnInst="1"][@lnType="XCBR_T"]',
					'//default:LNode//v2019C1:LNodeSpecNaming[@sLnClass="XCBR"][@sLnInst="1"]',
				],
				unexpectedQueries: [
					'//default:LNode[@ldInst]',
					'//default:LNode[@lnUuid]',
					'//default:LNode[@prefix]',
				],
			},
		'its SourceRef and ControlRef are implemented -> no longer: the ExtRef and ExtCtrl they named are dropped':
			{
				sourceXml: boundBreakerXml(),
				expectedQueries: [
					'//v2019C1:SourceRef[@input="Trip"]',
					'//v2019C1:ControlRef[@output="Oper"]',
					'//default:ExtRef[@intAddr="Trip.general"]',
				],
				unexpectedQueries: [
					'//v2019C1:SourceRef[@extRefAddr]',
					'//v2019C1:SourceRef[@extRefUuid]',
					'//v2019C1:ControlRef[@extCtrlAddr]',
				],
			},
		'its DOS / DAS are instantiated in the LN -> those DOI / DAI are removed, the others stay': {
			sourceXml: boundBreakerXml(),
			expectedQueries: [
				'//default:LN[@lnClass="XCBR"]/default:DOI[@name="Beh"]',
				'//v2019C1:DOS[@name="Pos"]/v2019C1:DAS[@name="ctlModel"]',
			],
			unexpectedQueries: ['//default:DOI[@name="Pos"]', '//default:DAI[@name="ctlModel"]'],
		},
		'an LNode assigned to an IED by its name only -> the same reset': {
			sourceXml: boundBreakerXml('iedName="P1" ldInst="LD0"'),
			expectedQueries: ['//default:LNode[@iedName="None"][@lnInst="1"]'],
			unexpectedQueries: [
				'//default:DOI[@name="Pos"]',
				'//v2019C1:SourceRef[@extRefAddr]',
				'//default:LNode[@ldInst]',
			],
		},
		'an LNode assigned to no IED -> left as it is': {
			sourceXml: boundBreakerXml('iedName="None"').replace(
				'prefix="Q0" lnClass="XCBR" lnInst="2"',
				'lnClass="XCBR" lnInst="1"',
			),
			expectedQueries: [
				'//default:LNode[@iedName="None"][@lnInst="1"]',
				'//default:DOI[@name="Pos"]',
				'//v2019C1:SourceRef[@extRefAddr]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(async (tx) => {
				await unlockLNode(tx, { lnode: { tagName: 'LNode', id: 'breaker' } as Scl.Ref<'LNode'> })
			})
			return { assertOn: 'source' }
		},
	})
})
