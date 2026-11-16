import { resolveAffectedIeds } from './resolve-affected-ieds'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * Connections on one subnetwork: Y's by uuid, one naming Z by name but by uuid an access point the document lacks, X's by
 * names only.
 */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Communication ${id}="communication">
			<SubNetwork ${id}="station-bus" name="StationBus" type="8-MMS">
				<BitRate ${id}="station-bus-bitrate" unit="b/s" multiplier="M">100</BitRate>
				<ConnectedAP ${id}="names-y-by-uuid" iedName="Y" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000012"/>
				<ConnectedAP ${id}="names-nothing" iedName="Z" apName="AP2" apUuid="e0000000-0000-4000-8000-000000000099"/>
				<ConnectedAP ${id}="names-x-by-name" iedName="X" apName="AP3"/>
			</SubNetwork>
		</Communication>
		<IED ${id}="x" name="X" uuid="e0000000-0000-4000-8000-000000000001">
			<AccessPoint name="AP3" uuid="e0000000-0000-4000-8000-000000000011"/>
		</IED>
		<IED ${id}="y" name="Y" uuid="e0000000-0000-4000-8000-000000000002">
			<AccessPoint name="AP1" uuid="e0000000-0000-4000-8000-000000000012"/>
		</IED>
		<IED ${id}="z" name="Z" uuid="e0000000-0000-4000-8000-000000000003">
			<AccessPoint name="AP9" uuid="e0000000-0000-4000-8000-000000000013"/>
		</IED>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	record: Scl.Ref<Scl.ElementsOf>
	expected: string[]
}

// A connection belongs to the IED holding the access point its apUuid names, as every reference naming by uuid; an
// apUuid naming nothing gives no IED, whatever the connection's names say; one without apUuid belongs to the IED of its
// iedName. A subnetwork setting reaches the IED of each of its connections.
describe('resolveAffectedIeds - the IED a connection belongs to', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a connection naming Z, but by uuid an access point the document lacks → no IED, not Z its name names':
			{
				sourceXml: projectXml,
				allowIncoherentReferences:
					'the connection names by uuid an access point the document lacks on purpose',
				record: { tagName: 'ConnectedAP', id: 'names-nothing' },
				expected: [],
			},
		'a connection naming X by names only → X': {
			sourceXml: projectXml,
			allowIncoherentReferences:
				'the fixture also holds a connection naming by uuid an access point the document lacks',
			record: { tagName: 'ConnectedAP', id: 'names-x-by-name' },
			expected: ['x'],
		},
		'the subnetwork bit rate → the IED of each connection, once: Y by uuid, X by name, none for the one naming nothing by uuid':
			{
				sourceXml: projectXml,
				allowIncoherentReferences:
					'the fixture also holds a connection naming by uuid an access point the document lacks',
				record: { tagName: 'BitRate', id: 'station-bus-bitrate' },
				expected: ['x', 'y'],
			},
	}

	async function act({ source, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		const record = await source.query.getRecord(testCase.record)
		if (!record) throw new Error('record required')
		const ieds = await resolveAffectedIeds(source.query, {
			record: record as unknown as Scl.RawRecord<Scl.ElementsOf>,
		})
		expect(ieds.map((ied) => ied.id).sort()).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
