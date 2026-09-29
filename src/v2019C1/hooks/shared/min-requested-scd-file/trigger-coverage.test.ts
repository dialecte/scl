import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const headerUuid = '11111111-2222-3333-4444-555555555555'

function buildXml(
	params: {
		networkChildren?: string
		reportChildren?: string
		otherControls?: string
		otherIed?: boolean
		minRequested?: string
	} = {},
): string {
	const {
		networkChildren = '',
		reportChildren = '',
		otherControls = '',
		minRequested = '',
	} = params

	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Header ${id}="header" id="Project" uuid="${headerUuid}" version="2" revision="A" />
			<Communication ${id}="comm">
				<SubNetwork ${id}="sn1" name="SN1" type="8-MMS">
					<ConnectedAP ${id}="cap1" iedName="IED1" apName="AP1">
						<Address ${id}="addr1"><P ${id}="ip1" type="IP">10.0.0.1</P></Address>
						<GSE ${id}="gse1" ldInst="LD1" cbName="GCB1">
							${networkChildren}
						</GSE>
					</ConnectedAP>
					${params.otherIed ? `<ConnectedAP ${id}="cap2" iedName="IED2" apName="AP2" /><ConnectedAP ${id}="cap3" iedName="IED1" apName="AP1" />` : ''}
				</SubNetwork>
			</Communication>
			<IED ${id}="ied1" name="IED1">
				${minRequested}
				<AccessPoint ${id}="ap1" name="AP1">
					<Server ${id}="srv1">
						<Authentication ${id}="auth1" />
						<LDevice ${id}="ld1" inst="LD1">
							<LN0 ${id}="ln0" lnClass="LLN0" inst="" lnType="LLN0Type">
								<ReportControl ${id}="rc1" name="RP1" confRev="1">
									${reportChildren}
								</ReportControl>
								${otherControls}
							</LN0>
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
			${params.otherIed ? `<IED ${id}="ied2" name="IED2"><AccessPoint ${id}="ap2" name="AP2" /></IED>` : ''}
		</SCL>
	`
}

const entry = (name: string, version = '2') =>
	`//default:IED[@name="${name}"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${headerUuid}"][@version="${version}"]`

describe('MinRequestedSCDFile functional trigger coverage', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const cases: SclTest.TestCases<TestCase> = {
		'TrgOps added to ReportControl → sync': {
			sourceXml: buildXml(),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild({ tagName: 'ReportControl', id: 'rc1' }, { tagName: 'TrgOps' })
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'OptFields added to ReportControl → sync': {
			sourceXml: buildXml(),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild({ tagName: 'ReportControl', id: 'rc1' }, { tagName: 'OptFields' })
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'TrgOps updated under LogControl → sync': {
			sourceXml: buildXml({
				otherControls: `<LogControl ${id}="lc1" name="Log1"><TrgOps ${id}="trg1" dchg="true" /></LogControl>`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'TrgOps', id: 'trg1' }, { attributes: { qchg: 'true' } })
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'RptEnabled removed → sync': {
			sourceXml: buildXml({ reportChildren: `<RptEnabled ${id}="rpt1" max="2" />` }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'RptEnabled', id: 'rpt1' })
				})
			},
			expectedQueries: [entry('IED1')],
			unexpectedQueries: ['//default:RptEnabled'],
		},
		'ClientLN created under RptEnabled → sync': {
			sourceXml: buildXml({ reportChildren: `<RptEnabled ${id}="rpt1" max="2" />` }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'RptEnabled', id: 'rpt1' },
						{
							tagName: 'ClientLN',
							attributes: {
								apRef: 'AP1',
								iedName: 'IED1',
								ldInst: 'LD1',
								lnClass: 'LLN0',
								lnInst: '',
							},
						},
					)
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'SmvOpts created under SampledValueControl → sync': {
			sourceXml: buildXml({
				otherControls: `<SampledValueControl ${id}="svc1" name="MSVC1" smvID="SMV1" nofASDU="1" smpRate="80" />`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild({ tagName: 'SampledValueControl', id: 'svc1' }, { tagName: 'SmvOpts' })
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'Protocol created under GSEControl → sync': {
			sourceXml: buildXml({ otherControls: `<GSEControl ${id}="gsc1" name="GCB1" />` }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'GSEControl', id: 'gsc1' },
						{ tagName: 'Protocol', attributes: { mustUnderstand: 'true' }, value: 'R-GOOSE' },
					)
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'IEDName created under GSEControl → sync': {
			sourceXml: buildXml({ otherControls: `<GSEControl ${id}="gsc1" name="GCB1" />` }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'GSEControl', id: 'gsc1' },
						{ tagName: 'IEDName', attributes: { apRef: 'AP1' }, value: 'IED1' },
					)
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'GSE MinTime edited → sync': {
			sourceXml: buildXml({ networkChildren: `<MinTime ${id}="min1">1</MinTime>` }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'MinTime', id: 'min1' }, { value: '2' })
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'GSE MaxTime created → sync': {
			sourceXml: buildXml(),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild({ tagName: 'GSE', id: 'gse1' }, { tagName: 'MaxTime', value: '2' })
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'GSE MaxTime removed → sync': {
			sourceXml: buildXml({ networkChildren: `<MaxTime ${id}="max1">2</MaxTime>` }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'MaxTime', id: 'max1' })
				})
			},
			expectedQueries: [entry('IED1')],
		},
		'BitRate added under SubNetwork → sync all attached IEDs': {
			sourceXml: buildXml({ otherIed: true }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'SubNetwork', id: 'sn1' },
						{ tagName: 'BitRate', value: '100' },
					)
				})
			},
			expectedQueries: [entry('IED1'), entry('IED2')],
			unexpectedQueries: [
				'//default:IED[@name="IED1"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[2]',
			],
		},
		'BitRate updated under SubNetwork → sync all attached IEDs': {
			sourceXml: buildXml({ otherIed: true }).replace(
				`<ConnectedAP ${id}="cap1"`,
				`<BitRate ${id}="bit1">100</BitRate><ConnectedAP ${id}="cap1"`,
			),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'BitRate', id: 'bit1' }, { value: '1000' })
				})
			},
			expectedQueries: [entry('IED1'), entry('IED2')],
		},
		'BitRate deleted under SubNetwork → sync all attached IEDs': {
			sourceXml: buildXml({ otherIed: true }).replace(
				`<ConnectedAP ${id}="cap1"`,
				`<BitRate ${id}="bit1">100</BitRate><ConnectedAP ${id}="cap1"`,
			),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'BitRate', id: 'bit1' })
				})
			},
			expectedQueries: [entry('IED1'), entry('IED2')],
			unexpectedQueries: ['//default:BitRate'],
		},
		'SubNetwork rename → sync all attached IEDs': {
			sourceXml: buildXml({ otherIed: true }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'SubNetwork', id: 'sn1' }, { attributes: { name: 'SN2' } })
				})
			},
			expectedQueries: [entry('IED1'), entry('IED2')],
		},
		'SubNetwork type change → sync all attached IEDs': {
			sourceXml: buildXml({ otherIed: true }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'SubNetwork', id: 'sn1' }, { attributes: { type: '8-XMPP' } })
				})
			},
			expectedQueries: [entry('IED1'), entry('IED2')],
		},
		'ConnectedAP reassigned → sync old and new IED': {
			sourceXml: buildXml({
				otherIed: true,
				minRequested: `<MinRequestedSCDFiles ${id}="wrap1"><MinRequestedSCDFile ${id}="entry1" fileType="SCD" fileUuid="${headerUuid}" version="1" revision="A" /></MinRequestedSCDFiles>`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'ConnectedAP', id: 'cap1' },
						{ attributes: { iedName: 'IED2' } },
					)
				})
			},
			expectedQueries: [entry('IED1'), entry('IED2')],
			unexpectedQueries: [
				'//default:IED[@name="IED1"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@version="1"]',
				'//default:IED[@name="IED2"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[2]',
			],
		},
		'descriptive SubNetwork edit → no sync': {
			sourceXml: buildXml({ otherIed: true }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'SubNetwork', id: 'sn1' }, { attributes: { desc: 'note' } })
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},
		'descriptive control-block Text edit → no sync': {
			sourceXml: buildXml({ reportChildren: `<Text ${id}="text1">note</Text>` }),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'Text', id: 'text1' }, { value: 'new note' })
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},
		'empty SubNetwork created → no sync': {
			sourceXml: buildXml(),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Communication', id: 'comm' },
						{ tagName: 'SubNetwork', attributes: { name: 'SN2' } },
					)
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},
		'Val outside IED and DAI → no sync': {
			sourceXml: buildXml().replace(
				'</SCL>',
				`<DataTypeTemplates ${id}="dtt1"><DOType ${id}="do1" id="DO1" cdc="SPS"><DA ${id}="da1" name="stVal" bType="BOOLEAN" fc="ST"><Val ${id}="val1">false</Val></DA></DOType></DataTypeTemplates></SCL>`,
			),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'Val', id: 'val1' }, { value: 'true' })
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},
	}

	runSclTestCases.withExport({
		testCases: cases,
		act: async ({ source, testCase }) => {
			await testCase.act(source)
			return { assertOn: 'source' }
		},
	})
})
