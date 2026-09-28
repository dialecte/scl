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

function buildXml(params: { header?: string; minRequested?: string } = {}): string {
	const header =
		params.header ??
		`<Header ${id}="header" id="Project" uuid="${HEADER_UUID}" version="2" revision="A" />`

	return /* xml */ `
		<SCL ${ns} ${id}="root">
			${header}
			<Substation ${id}="sub1" name="Sub1" />
			${communication}
			<IED ${id}="ied1" name="IED1">
				${params.minRequested ?? ''}
				${iedBody}
			</IED>
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
})
