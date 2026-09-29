import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const projectUuid = '11111111-2222-3333-4444-555555555555'

const twoIedsOnOneSubNetwork = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header ${id}="header" id="Project" uuid="${projectUuid}" version="2" revision="B" />
		<Communication ${id}="communication">
			<SubNetwork ${id}="station-bus" name="StationBus" type="8-MMS">
				<ConnectedAP ${id}="protection-connected-ap" iedName="Protection" apName="AP1">
					<Address ${id}="protection-address">
						<P ${id}="protection-ip" type="IP">10.0.0.1</P>
					</Address>
				</ConnectedAP>
				<ConnectedAP ${id}="control-connected-ap" iedName="Control" apName="AP1" />
			</SubNetwork>
		</Communication>
		<IED ${id}="protection" name="Protection">
			<AccessPoint ${id}="protection-access-point" name="AP1">
				<Server ${id}="protection-server">
					<Authentication ${id}="protection-authentication" />
					<LDevice ${id}="protection-ldevice" inst="LD1">
						<LN0 ${id}="protection-ln0" lnClass="LLN0" inst="" lnType="LLN0Type">
							<DataSet ${id}="protection-dataset" name="DS1" />
							<DOI ${id}="protection-mod" name="Mod">
								<DAI ${id}="protection-mod-stval" name="stVal" />
							</DOI>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
			<!-- no MinRequestedSCDFiles -->
		</IED>
		<IED ${id}="control" name="Control">
			<AccessPoint ${id}="control-access-point" name="AP1" />
			<!-- no MinRequestedSCDFiles -->
		</IED>
	</SCL>
`

function projectEntryOf(iedName: string): string {
	return `//default:IED[@name="${iedName}"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${projectUuid}"][@version="2"][@revision="B"]`
}

describe('afterUpdated — MinRequestedSCDFile', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'DAI updated → its IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DAI', id: 'protection-mod-stval' },
						{ attributes: { valKind: 'Set' } },
					)
				})
			},
			expectedQueries: [projectEntryOf('Protection')],
			unexpectedQueries: ['//default:IED[@name="Control"]/default:MinRequestedSCDFiles'],
		},

		'IED renamed → that IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'IED', id: 'control' }, { attributes: { name: 'Control2' } })
				})
			},
			expectedQueries: [projectEntryOf('Control2')],
		},

		'IED manufacturer updated → that IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'IED', id: 'control' },
						{ attributes: { manufacturer: 'Vendor' } },
					)
				})
			},
			expectedQueries: [projectEntryOf('Control')],
			unexpectedQueries: ['//default:IED[@name="Protection"]/default:MinRequestedSCDFiles'],
		},

		'DataSet description updated → descriptive only, no entry written': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DataSet', id: 'protection-dataset' },
						{ attributes: { desc: 'positions' } },
					)
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},

		'P address text updated → its IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'P', id: 'protection-ip' }, { value: '10.0.0.2' })
				})
			},
			expectedQueries: [projectEntryOf('Protection')],
			unexpectedQueries: ['//default:IED[@name="Control"]/default:MinRequestedSCDFiles'],
		},

		'IED description updated → not a trigger, no entry written': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'IED', id: 'control' },
						{ attributes: { desc: 'bay control' } },
					)
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},

		'SubNetwork type updated → every attached IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'SubNetwork', id: 'station-bus' },
						{ attributes: { type: 'IP' } },
					)
				})
			},
			expectedQueries: [projectEntryOf('Protection'), projectEntryOf('Control')],
		},

		'SubNetwork description updated → not a trigger, no entry written': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'SubNetwork', id: 'station-bus' },
						{ attributes: { desc: 'station bus' } },
					)
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},

		'ConnectedAP reassigned to another IED → former and new IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'ConnectedAP', id: 'control-connected-ap' },
						{ attributes: { iedName: 'Protection' } },
					)
				})
			},
			expectedQueries: [projectEntryOf('Protection'), projectEntryOf('Control')],
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
