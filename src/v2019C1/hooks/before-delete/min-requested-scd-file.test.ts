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
				<ConnectedAP ${id}="protection-connected-ap" iedName="Protection" apName="AP1" />
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
							<DOI ${id}="protection-empty-doi" name="Beh" />
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

describe('beforeDelete — MinRequestedSCDFile', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'DataSet deleted → its IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'DataSet', id: 'protection-dataset' })
				})
			},
			expectedQueries: [projectEntryOf('Protection')],
			unexpectedQueries: ['//default:DataSet[@name="DS1"]'],
		},

		'LDevice holding a DataSet deleted → its IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'LDevice', id: 'protection-ldevice' })
				})
			},
			expectedQueries: [projectEntryOf('Protection')],
			unexpectedQueries: ['//default:LDevice'],
		},

		'DOI without trigger content deleted → no entry written': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'DOI', id: 'protection-empty-doi' })
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},

		'IED deleted → no entry written on the remaining IEDs': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'IED', id: 'protection' })
				})
			},
			unexpectedQueries: ['//default:IED[@name="Protection"]', '//default:MinRequestedSCDFiles'],
		},

		'ConnectedAP deleted → its IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'ConnectedAP', id: 'control-connected-ap' })
				})
			},
			expectedQueries: [projectEntryOf('Control')],
			unexpectedQueries: ['//default:IED[@name="Protection"]/default:MinRequestedSCDFiles'],
		},

		'Communication deleted → every attached IED synced': {
			sourceXml: twoIedsOnOneSubNetwork,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'Communication', id: 'communication' })
				})
			},
			expectedQueries: [projectEntryOf('Protection'), projectEntryOf('Control')],
			unexpectedQueries: ['//default:Communication'],
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
