import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const HEADER_UUID = '11111111-2222-3333-4444-555555555555'

const iedBody = /* xml */ `
	<AccessPoint ${id}="ap1" name="AP1">
		<Server ${id}="srv1">
			<Authentication ${id}="auth1" />
			<LDevice ${id}="ld1" inst="LD1">
				<LN0 ${id}="ln0" lnClass="LLN0" inst="" lnType="LLN0Type">
					<DataSet ${id}="ds1" name="DS1" />
					<Inputs ${id}="inputs1" />
					<DOI ${id}="doi1" name="Mod">
						<DAI ${id}="dai1" name="stVal" />
					</DOI>
				</LN0>
			</LDevice>
		</Server>
	</AccessPoint>
`

const communication = /* xml */ `
	<Communication ${id}="comm">
		<SubNetwork ${id}="sn1" name="SN1">
			<ConnectedAP ${id}="cap1" iedName="IED1" apName="AP1">
				<Address ${id}="addr1">
					<P ${id}="p1" type="IP">10.0.0.1</P>
				</Address>
			</ConnectedAP>
		</SubNetwork>
	</Communication>
`

function buildXml(
	params: {
		header?: string
		minRequested?: string
		otherConnectedAp?: string
		otherIed?: string
	} = {},
): string {
	const header =
		params.header ??
		`<Header ${id}="header" id="Project" uuid="${HEADER_UUID}" version="2" revision="A" />`

	return /* xml */ `
		<SCL ${ns} ${id}="root">
			${header}
			<Substation ${id}="sub1" name="Sub1" />
			${communication.replace('</SubNetwork>', `${params.otherConnectedAp ?? ''}</SubNetwork>`)}
			<IED ${id}="ied1" name="IED1">
				${params.minRequested ?? ''}
				${iedBody}
			</IED>
			${params.otherIed ?? ''}
		</SCL>
	`
}

const baseXml = buildXml()

const entryQuery = (attributes: string) =>
	`//default:IED[@name="IED1"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile${attributes}`

const syncedEntryQueries = [
	entryQuery('[@fileType="SCD"]'),
	entryQuery(`[@fileUuid="${HEADER_UUID}"]`),
	entryQuery('[@version="2"]'),
	entryQuery('[@revision="A"]'),
]

describe('MinRequestedSCDFile auto-sync', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'ExtRef created → entry created from Header': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Inputs', id: 'inputs1' },
						{ tagName: 'ExtRef', attributes: { intAddr: 'A' } },
					)
				})
			},
			expectedQueries: syncedEntryQueries,
		},
		'FCDA created under DataSet → entry created': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'DataSet', id: 'ds1' },
						{ tagName: 'FCDA', attributes: { ldInst: 'LD1', fc: 'ST' } },
					)
				})
			},
			expectedQueries: syncedEntryQueries,
		},
		'control block created → entry created': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'LN0', id: 'ln0' },
						{ tagName: 'ReportControl', attributes: { name: 'RP1', confRev: '1' } },
					)
				})
			},
			expectedQueries: syncedEntryQueries,
		},
		'DAI updated → entry created': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'DAI', id: 'dai1' }, { attributes: { desc: 'changed' } })
				})
			},
			expectedQueries: syncedEntryQueries,
		},
		'DAI value created → entry created': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild({ tagName: 'DAI', id: 'dai1' }, { tagName: 'Val' })
				})
			},
			expectedQueries: syncedEntryQueries,
		},
		'communication address changed → entry created via ConnectedAP@iedName': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'P', id: 'p1' }, { attributes: { type: 'IP-SUBNET' } })
				})
			},
			expectedQueries: syncedEntryQueries,
		},
		'ConnectedAP moved to another SubNetwork → entry created': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'ConnectedAP', id: 'cap1' }, { attributes: { apName: 'AP2' } })
				})
			},
			expectedQueries: syncedEntryQueries,
		},
		'IED renamed → entry created': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'IED', id: 'ied1' }, { attributes: { name: 'IED_NEW' } })
				})
			},
			expectedQueries: [
				'//default:IED[@name="IED_NEW"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileType="SCD"]',
				`//default:IED[@name="IED_NEW"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${HEADER_UUID}"]`,
			],
		},
		'IED updated without name change → no entry': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'IED', id: 'ied1' }, { attributes: { desc: 'changed' } })
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},
		'unrelated element changed → no entry': {
			sourceXml: baseXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Substation', id: 'sub1' },
						{ tagName: 'VoltageLevel', attributes: { name: 'VL1' } },
					)
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},
		'existing outdated entry → updated in place, unmanaged attributes untouched': {
			sourceXml: buildXml({
				minRequested: /* xml */ `
					<MinRequestedSCDFiles ${id}="wrap1">
						<MinRequestedSCDFile
							${id}="entry1"
							fileType="SCD"
							fileUuid="${HEADER_UUID}"
							version="1"
							revision="A"
							desc="kept"
						/>
					</MinRequestedSCDFiles>
				`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Inputs', id: 'inputs1' },
						{ tagName: 'ExtRef', attributes: { intAddr: 'A' } },
					)
				})
			},
			expectedQueries: [entryQuery('[@version="2"]'), entryQuery('[@desc="kept"]')],
			unexpectedQueries: [entryQuery('[2]')],
		},
		'surplus entries → collapsed onto the single managed entry': {
			sourceXml: buildXml({
				minRequested: /* xml */ `
					<MinRequestedSCDFiles ${id}="wrap1">
						<MinRequestedSCDFile
							${id}="entry0"
							fileType="ICD"
							fileUuid="99999999-9999-9999-9999-999999999999"
							version="9"
							revision="Z"
						/>
						<MinRequestedSCDFile
							${id}="entry1"
							fileType="SCD"
							fileUuid="${HEADER_UUID}"
							version="1"
							revision="A"
						/>
					</MinRequestedSCDFiles>
				`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Inputs', id: 'inputs1' },
						{ tagName: 'ExtRef', attributes: { intAddr: 'A' } },
					)
				})
			},
			expectedQueries: [
				entryQuery(`[@fileUuid="${HEADER_UUID}"][@fileType="SCD"][@version="2"][@revision="A"]`),
			],
			unexpectedQueries: [
				entryQuery('[2]'),
				entryQuery('[@fileUuid="99999999-9999-9999-9999-999999999999"]'),
			],
		},
		'Header without version/revision → empty values written': {
			sourceXml: buildXml({
				header: `<Header ${id}="header" id="Project" uuid="${HEADER_UUID}" />`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Inputs', id: 'inputs1' },
						{ tagName: 'ExtRef', attributes: { intAddr: 'A' } },
					)
				})
			},
			expectedQueries: [entryQuery('[@version=""]'), entryQuery('[@revision=""]')],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await testCase.act(source)
			return { assertOn: 'source' }
		},
	})

	describe('deletion triggers', () => {
		const staleEntry = /* xml */ `
			<MinRequestedSCDFiles ${id}="wrap1">
				<MinRequestedSCDFile ${id}="entry1" fileType="SCD" fileUuid="${HEADER_UUID}" version="1" revision="A" desc="kept" />
			</MinRequestedSCDFiles>
		`

		const deletionCases: SclTest.TestCases<TestCase> = {
			'DataSet deleted → entry created after removal': {
				sourceXml: baseXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'DataSet', id: 'ds1' })
					})
				},
				expectedQueries: syncedEntryQueries,
				unexpectedQueries: ['//default:DataSet[@name="DS1"]'],
			},
			'ExtRef deleted → existing entry updated in place': {
				sourceXml: buildXml({
					minRequested: staleEntry,
				}).replace(
					`<Inputs ${id}="inputs1" />`,
					`<Inputs ${id}="inputs1"><ExtRef ${id}="ext1" intAddr="A" /></Inputs>`,
				),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'ExtRef', id: 'ext1' })
					})
				},
				expectedQueries: [
					entryQuery('[@version="2"][@desc="kept"]'),
					entryQuery(`[@fileUuid="${HEADER_UUID}"]`),
				],
				unexpectedQueries: ['//default:ExtRef', entryQuery('[2]')],
			},
			'DAI Val deleted → entry created': {
				sourceXml: baseXml.replace(
					`<DAI ${id}="dai1" name="stVal" />`,
					`<DAI ${id}="dai1" name="stVal"><Val ${id}="val1">true</Val></DAI>`,
				),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Val', id: 'val1' })
					})
				},
				expectedQueries: syncedEntryQueries,
				unexpectedQueries: ['//default:DAI/default:Val'],
			},
			'LN0 deleted with control block and DataSet → entry created once': {
				sourceXml: baseXml.replace(
					`<DataSet ${id}="ds1" name="DS1" />`,
					`<DataSet ${id}="ds1" name="DS1" /><ReportControl ${id}="rc1" name="RP1" confRev="1" />`,
				),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'LN0', id: 'ln0' })
					})
				},
				expectedQueries: syncedEntryQueries,
				unexpectedQueries: ['//default:LN0', entryQuery('[2]')],
			},
			'communication P deleted → entry created': {
				sourceXml: baseXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'P', id: 'p1' })
					})
				},
				expectedQueries: syncedEntryQueries,
				unexpectedQueries: ['//default:P[@type="IP"]'],
			},
			'ConnectedAP deleted → entry created from its old iedName': {
				sourceXml: baseXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'ConnectedAP', id: 'cap1' })
					})
				},
				expectedQueries: syncedEntryQueries,
				unexpectedQueries: ['//default:ConnectedAP[@iedName="IED1"]'],
			},
			'SubNetwork deleted with two ConnectedAPs → both IEDs synced': {
				sourceXml: buildXml({
					otherConnectedAp: `<ConnectedAP ${id}="cap2" iedName="IED2" apName="AP2" />`,
					otherIed: `<IED ${id}="ied2" name="IED2"><AccessPoint ${id}="ap2" name="AP2" /></IED>`,
				}),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'SubNetwork', id: 'sn1' })
					})
				},
				expectedQueries: [
					`//default:IED[@name="IED1"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${HEADER_UUID}"]`,
					`//default:IED[@name="IED2"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${HEADER_UUID}"]`,
				],
				unexpectedQueries: ['//default:SubNetwork'],
			},
			'unrelated subtree deleted → outdated entry untouched': {
				sourceXml: buildXml({ minRequested: staleEntry }),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Substation', id: 'sub1' })
					})
				},
				expectedQueries: [entryQuery('[@version="1"][@desc="kept"]')],
				unexpectedQueries: [entryQuery('[@version="2"]')],
			},
			'IED deleted → no managed entry created for deleted IED': {
				sourceXml: baseXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'IED', id: 'ied1' })
					})
				},
				unexpectedQueries: ['//default:IED', '//default:MinRequestedSCDFiles'],
			},
			'Header without uuid → standardized uuid used on delete': {
				sourceXml: buildXml({
					header: `<Header ${id}="header" id="Project" version="2" revision="A" />`,
				}),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'DataSet', id: 'ds1' })
					})
				},
				expectedQueries: [
					'//default:Header[@uuid]',
					'//default:IED/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid = /default:SCL/default:Header/@uuid]',
				],
			},
			'Header without version/revision → empty values written on delete': {
				sourceXml: buildXml({
					header: `<Header ${id}="header" id="Project" uuid="${HEADER_UUID}" />`,
				}),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'DataSet', id: 'ds1' })
					})
				},
				expectedQueries: [entryQuery('[@version=""][@revision=""]')],
			},
			'no Header → preserve empty fileUuid on delete': {
				sourceXml: buildXml({ header: '' }),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'DataSet', id: 'ds1' })
					})
				},
				expectedQueries: [entryQuery('[@fileUuid=""]')],
			},
		}

		runSclTestCases.withExport({
			testCases: deletionCases,
			act: async ({ source, testCase }) => {
				await testCase.act(source)
				return { assertOn: 'source' }
			},
		})
	})
})
