import { resetLNodes } from './orphan-lnode-bindings'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const ns = ALL_XMLNS_NAMESPACES

/** The device P1, holding one logical node: Q0XCBR2 in LD0, uuid `ln-uuid`. */
const device = /* xml */ `
	<IED name="P1">
		<AccessPoint name="AP1">
			<Server>
				<LDevice inst="LD0">
					<LN prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="ln-uuid"/>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
`

/** A document holding `content` in a Function, next to `ied` (the device P1 unless told otherwise). */
function documentXml(params: { content: string; ied?: string }): string {
	const { content, ied = device } = params
	return /* xml */ `
		<SCL ${ns}>
			<Header id="TestSCL"/>
			${ied}
			<Substation name="S1">
				<Function name="F1">
					${content}
				</Function>
			</Substation>
		</SCL>
	`
}

describe('resetLNodes', () => {
	const testCases: SclTest.TestCases = {
		'unbound LNode -> left as it is': {
			sourceXml: documentXml({
				content: '<LNode iedName="None" ldInst="LD7" lnClass="PTRC" lnInst="1"/>',
			}),
			expectedQueries: [
				'//default:LNode[@iedName="None"][@ldInst="LD7"][@lnClass="PTRC"][@lnInst="1"]',
			],
			unexpectedQueries: ['//default:LNode[@lnUuid]'],
		},

		'LNode without iedName -> the explicit None marker written, nothing else': {
			sourceXml: documentXml({ content: '<LNode lnClass="PTRC" lnInst="1"/>' }),
			expectedQueries: ['//default:LNode[@iedName="None"][@lnClass="PTRC"][@lnInst="1"]'],
		},

		'bound by lnUuid to an LN of the document -> kept': {
			sourceXml: documentXml({
				content: `<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" lnUuid="ln-uuid"/>`,
			}),
			expectedQueries: [
				'//default:LNode[@iedName="P1"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"][@lnUuid="ln-uuid"]',
			],
		},

		'bound by lnUuid, its IED present without that LN -> unlocked': {
			sourceXml: documentXml({
				content: /* xml */ `
					<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="3" lnUuid="missing-ln-uuid"/>
					<!-- missing in P1: <LN prefix="Q0" lnClass="XCBR" inst="3" uuid="missing-ln-uuid"/> -->
				`,
			}),
			expectedQueries: ['//default:LNode[@iedName="None"][@lnClass="XCBR"]'],
			unexpectedQueries: ['//default:LNode[@iedName="P1"]', '//default:LNode[@lnUuid]'],
		},

		'bound by lnUuid to a missing LN, its naming naming an LN of the document -> unlocked: the uuid wins':
			{
				sourceXml: documentXml({
					content: `<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" lnUuid="missing-ln-uuid"/>`,
				}),
				expectedQueries: ['//default:LNode[@iedName="None"][@lnClass="XCBR"]'],
				unexpectedQueries: ['//default:LNode[@iedName="P1"]', '//default:LNode[@lnUuid]'],
			},

		'bound by lnUuid to the LN0 of the document -> kept': {
			sourceXml: documentXml({
				ied: /* xml */ `
					<IED name="P1">
						<AccessPoint name="AP1">
							<Server>
								<LDevice inst="LD0">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-uuid"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				`,
				content: `<LNode iedName="P1" ldInst="LD0" lnClass="LLN0" lnInst="" lnUuid="ln0-uuid"/>`,
			}),
			expectedQueries: [
				'//default:LNode[@iedName="P1"][@ldInst="LD0"][@lnClass="LLN0"][@lnUuid="ln0-uuid"]',
			],
		},

		'bound to an LN of the document, its data and output naming what it lacks -> binding kept, those names removed':
			{
				allowIncoherentReferences:
					'the data and output name what the document lacks: what is cleaned up',
				sourceXml: documentXml({
					content: /* xml */ `
						<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" lnUuid="ln-uuid">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:DOS name="Pos" mappedLnUuid="missing-ln-uuid" mappedDoName="Pos"/>
								<eIEC61850-6-100:LNodeOutputs>
									<eIEC61850-6-100:ControlRef output="Oper" extCtrlAddr="GONE/LD0/CSWI1.Oper" extCtrlUuid="missing-ext-ctrl-uuid"/>
								</eIEC61850-6-100:LNodeOutputs>
							</Private>
						</LNode>
					`,
				}),
				expectedQueries: [
					'//default:LNode[@iedName="P1"][@lnUuid="ln-uuid"]',
					'//v2019C1:DOS[@name="Pos"][not(@mappedLnUuid)][not(@mappedDoName)]',
					'//v2019C1:ControlRef[@output="Oper"][not(@extCtrlAddr)][not(@extCtrlUuid)]',
				],
			},

		'bound by its naming only, the LN in the document -> kept': {
			sourceXml: documentXml({
				content: `<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2"/>`,
			}),
			expectedQueries: [
				'//default:LNode[@iedName="P1"][@ldInst="LD0"][@prefix="Q0"][@lnClass="XCBR"][@lnInst="2"]',
			],
		},

		'bound by its naming only, no such LN -> unlocked': {
			sourceXml: documentXml({
				content: `<LNode iedName="P1" ldInst="LD9" prefix="Q0" lnClass="XCBR" lnInst="2"/>`,
			}),
			expectedQueries: ['//default:LNode[@iedName="None"][@lnClass="XCBR"]'],
			unexpectedQueries: ['//default:LNode[@iedName="P1"]', '//default:LNode[@ldInst]'],
		},

		'bound to an absent IED, with an LNodeSpecNaming -> naming and LD back from it, every specified value kept':
			{
				sourceXml: documentXml({
					ied: '<!-- missing: <IED name="GONE_IED"/> -->',
					content: /* xml */ `
						<LNode iedName="GONE_IED" ldInst="LD0" lnClass="XSWI" lnInst="2" prefix="OLD" lnUuid="old-uuid" templateUuid="tpl-1">
							<eIEC61850-6-100:LNodeSpecNaming sIedName="GONE_IED" sLdInst="LD0" sLnClass="PTRC" sLnInst="1" sPrefix="SP"/>
						</LNode>
					`,
				}),
				expectedQueries: [
					'//default:LNode[@iedName="None"][@ldInst="LD0"][@lnClass="PTRC"][@lnInst="1"][@prefix="SP"][not(@lnUuid)][@templateUuid="tpl-1"]',
					'//v2019C1:LNodeSpecNaming[@sIedName="GONE_IED"][@sLdInst="LD0"][@sLnClass="PTRC"][@sLnInst="1"][@sPrefix="SP"]',
				],
				unexpectedQueries: [
					'//default:LNode[@iedName="GONE_IED"]',
					'//default:LNode[@lnClass="XSWI"]',
				],
			},

		'bound to an absent IED, its LNodeSpecNaming without sPrefix -> prefix removed': {
			sourceXml: documentXml({
				ied: '<!-- missing: <IED name="GONE_IED"/> -->',
				content: /* xml */ `
					<LNode iedName="GONE_IED" ldInst="LD0" lnClass="XSWI" lnInst="2" prefix="OLD" lnUuid="old-uuid">
						<eIEC61850-6-100:LNodeSpecNaming sIedName="GONE_IED" sLdInst="LD0" sLnClass="PTRC" sLnInst="1"/>
					</LNode>
				`,
			}),
			expectedQueries: [
				'//default:LNode[@iedName="None"][@ldInst="LD0"][@lnClass="PTRC"][@lnInst="1"][not(@prefix)][not(@lnUuid)]',
			],
		},

		'bound to an absent IED, without an LNodeSpecNaming -> only the IED, LD and lnUuid removed': {
			sourceXml: documentXml({
				ied: '<!-- missing: <IED name="GONE_IED"/> -->',
				content: `<LNode iedName="GONE_IED" ldInst="LD0" lnClass="PTRC" lnInst="1" prefix="PFX" lnUuid="old-uuid" templateUuid="tpl-2"/>`,
			}),
			// no specified naming to restore prefix, class and instance from: they stay (the class is required)
			expectedQueries: [
				'//default:LNode[@iedName="None"][not(@ldInst)][@lnClass="PTRC"][@lnInst="1"][@prefix="PFX"][not(@lnUuid)][@templateUuid="tpl-2"]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="GONE_IED"]'],
		},

		'unbound LNode whose data and signals name an IED the document lacks -> those names removed, the elements kept':
			{
				allowIncoherentReferences:
					'the data and signals name a device the document lacks: what is cleaned up',
				sourceXml: documentXml({
					content: /* xml */ `
						<LNode iedName="None" lnClass="IHMI" lnInst="1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="IHMI" sLnInst="1"/>
								<eIEC61850-6-100:DOS name="Pos" mappedLnUuid="missing-ln-uuid" mappedDoName="Pos">
									<eIEC61850-6-100:DAS name="stVal" mappedLnUuid="ln-uuid" mappedDaName="Pos.stVal"/>
								</eIEC61850-6-100:DOS>
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="Trip" extRefAddr="GONE/LD0/PTRC1.Trip" extRefUuid="missing-ext-ref-uuid"/>
								</eIEC61850-6-100:LNodeInputs>
								<eIEC61850-6-100:LNodeOutputs>
									<eIEC61850-6-100:ControlRef output="Oper" extCtrlAddr="GONE/LD0/CSWI1.Oper" extCtrlUuid="missing-ext-ctrl-uuid"/>
								</eIEC61850-6-100:LNodeOutputs>
							</Private>
						</LNode>
					`,
				}),
				expectedQueries: [
					'//v2019C1:DOS[@name="Pos"][not(@mappedLnUuid)][not(@mappedDoName)]',
					'//v2019C1:DAS[@name="stVal"][@mappedLnUuid="ln-uuid"][@mappedDaName="Pos.stVal"]',
					'//v2019C1:SourceRef[@input="Trip"][not(@extRefAddr)][not(@extRefUuid)]',
					'//v2019C1:ControlRef[@output="Oper"][not(@extCtrlAddr)][not(@extCtrlUuid)]',
				],
			},

		'bound to a missing LN, its data mapped to another LN of the document -> unlocked, that LN and the mapping kept':
			{
				sourceXml: documentXml({
					ied: /* xml */ `
						<IED name="P1">
							<AccessPoint name="AP1">
								<Server>
									<LDevice inst="LD0">
										<LN lnClass="GGIO" inst="1" lnType="GGIO_T" uuid="ggio-uuid">
											<DOI name="Ind1"/>
										</LN>
										<!-- missing: <LN prefix="Q0" lnClass="XCBR" inst="3" uuid="missing-ln-uuid"/> -->
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					`,
					content: /* xml */ `
						<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="3" lnUuid="missing-ln-uuid">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
								<eIEC61850-6-100:DOS name="Pos" mappedLnUuid="ggio-uuid" mappedDoName="Ind1"/>
							</Private>
						</LNode>
					`,
				}),
				expectedQueries: [
					'//default:LNode[@iedName="None"][@lnClass="XCBR"][@lnInst="1"][not(@lnUuid)]',
					'//default:LN[@lnClass="GGIO"]/default:DOI[@name="Ind1"]',
					'//v2019C1:DOS[@name="Pos"][@mappedLnUuid="ggio-uuid"][@mappedDoName="Ind1"]',
				],
			},

		'two bound LNodes, one LN in the document -> only the other unlocked': {
			sourceXml: documentXml({
				content: /* xml */ `
					<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" lnUuid="ln-uuid"/>
					<LNode iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="missing-ln-uuid"/>
				`,
			}),
			expectedQueries: [
				'//default:LNode[@iedName="P1"][@lnUuid="ln-uuid"]',
				'//default:LNode[@iedName="None"][@lnClass="PTRC"][not(@lnUuid)]',
			],
			unexpectedQueries: ['//default:LNode[@lnUuid="missing-ln-uuid"]'],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(async (tx) => {
				await resetLNodes(tx)
			})
			return { assertOn: 'source' }
		},
	})
})

describe('resetLNodes on some elements', () => {
	const testCases: SclTest.TestCases = {
		'two inputs naming what the document lacks, one given -> only its name removed': {
			allowIncoherentReferences: 'the inputs name a device the document lacks: what is cleaned up',
			sourceXml: documentXml({
				content: /* xml */ `
						<LNode iedName="None" lnClass="PTRC" lnInst="1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef ${CUSTOM_RECORD_ID_ATTRIBUTE}="given-input" input="Trip" extRefAddr="GONE/LD0/PTRC1.Trip" extRefUuid="missing-ext-ref-uuid"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
						<LNode iedName="None" lnClass="PDIS" lnInst="1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="Start" extRefAddr="GONE/LD0/PDIS1.Str" extRefUuid="other-missing-ext-ref-uuid"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					`,
			}),
			expectedQueries: [
				'//v2019C1:SourceRef[@input="Trip"][not(@extRefAddr)][not(@extRefUuid)]',
				'//v2019C1:SourceRef[@input="Start"][@extRefUuid="other-missing-ext-ref-uuid"]',
			],
		},

		'two LNodes bound to missing LNs, one given -> only that one unlocked': {
			sourceXml: documentXml({
				content: /* xml */ `
					<LNode ${CUSTOM_RECORD_ID_ATTRIBUTE}="given" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="missing-ln-uuid"/>
					<LNode iedName="P1" ldInst="LD0" lnClass="PDIS" lnInst="1" lnUuid="other-missing-ln-uuid"/>
				`,
			}),
			expectedQueries: [
				'//default:LNode[@iedName="None"][@lnClass="PTRC"][not(@lnUuid)]',
				'//default:LNode[@iedName="P1"][@lnClass="PDIS"][@lnUuid="other-missing-ln-uuid"]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(async (tx) => {
				await resetLNodes(tx, {
					elements: [
						{ tagName: 'LNode', id: 'given' },
						{ tagName: 'SourceRef', id: 'given-input' },
					],
				})
			})
			return { assertOn: 'source' }
		},
	})
})
