import { resolveAffectedIeds } from './resolve-affected-ieds'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Communication ${id}="communication">
			<SubNetwork ${id}="station-bus" name="StationBus" type="8-MMS">
				<BitRate ${id}="station-bus-bitrate" unit="b/s" multiplier="M">100</BitRate>
				<eIEC61850-6-100:CommunicationServiceSpecifications ${id}="station-bus-services">
					<eIEC61850-6-100:GooseParameters ${id}="station-bus-goose" id="Goose1" />
				</eIEC61850-6-100:CommunicationServiceSpecifications>
				<ConnectedAP ${id}="protection-ap" iedName="Protection" apName="AP1">
					<Address ${id}="protection-address">
						<P ${id}="protection-ip" type="IP">10.0.0.1</P>
					</Address>
					<PhysConn ${id}="protection-physical" type="Connection">
						<P ${id}="protection-port" type="Port">1</P>
					</PhysConn>
				</ConnectedAP>
				<ConnectedAP ${id}="protection-second-ap" iedName="Protection" apName="AP2" />
				<ConnectedAP ${id}="control-ap" iedName="Control" apName="AP1" />
				<ConnectedAP ${id}="unknown-ied-ap" iedName="Unknown" apName="AP1" />
			</SubNetwork>
		</Communication>
		<IED ${id}="protection" name="Protection">
			<Text ${id}="protection-text">notes</Text>
			<AccessPoint ${id}="protection-access-point" name="AP1">
				<Server ${id}="protection-server">
					<Authentication ${id}="protection-authentication" />
					<LDevice ${id}="protection-ldevice" inst="LD1">
						<LN0 ${id}="protection-ln0" lnClass="LLN0" inst="" lnType="LLN0Type">
							<DataSet ${id}="protection-dataset" name="DS1" />
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="control" name="Control">
			<AccessPoint ${id}="control-access-point" name="AP1" />
		</IED>
		<DataTypeTemplates ${id}="templates">
			<DAType ${id}="template-datype" id="DAType1">
				<BDA ${id}="template-bda" name="value" bType="INT32">
					<Val ${id}="template-val">1</Val>
				</BDA>
			</DAType>
		</DataTypeTemplates>
	</SCL>
`

describe('resolveAffectedIeds', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		record: Scl.Ref<Scl.ElementsOf>
		expectedIedIds: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'DataSet inside an IED → that IED': {
			sourceXml,
			record: { tagName: 'DataSet', id: 'protection-dataset' },
			expectedIedIds: ['protection'],
		},
		'Val under a type definition → no IED': {
			sourceXml,
			record: { tagName: 'Val', id: 'template-val' },
			expectedIedIds: [],
		},
		'Text inside an IED → not a trigger, no IED': {
			sourceXml,
			record: { tagName: 'Text', id: 'protection-text' },
			expectedIedIds: [],
		},
		'P under a ConnectedAP → the IED named by iedName': {
			sourceXml,
			record: { tagName: 'P', id: 'protection-ip' },
			expectedIedIds: ['protection'],
		},
		'PhysConn under a ConnectedAP → no IED': {
			sourceXml,
			record: { tagName: 'PhysConn', id: 'protection-physical' },
			expectedIedIds: [],
		},
		'P under a PhysConn → no IED': {
			sourceXml,
			record: { tagName: 'P', id: 'protection-port' },
			expectedIedIds: [],
		},
		'ConnectedAP naming no IED → no IED': {
			sourceXml,
			record: { tagName: 'ConnectedAP', id: 'unknown-ied-ap' },
			expectedIedIds: [],
		},
		'SubNetwork → every attached IED once': {
			sourceXml,
			record: { tagName: 'SubNetwork', id: 'station-bus' },
			expectedIedIds: ['protection', 'control'],
		},
		'BitRate → every IED attached to its SubNetwork': {
			sourceXml,
			record: { tagName: 'BitRate', id: 'station-bus-bitrate' },
			expectedIedIds: ['protection', 'control'],
		},
		'GooseParameters deep under a SubNetwork → every IED attached to that SubNetwork': {
			sourceXml,
			record: { tagName: 'GooseParameters', id: 'station-bus-goose' },
			expectedIedIds: ['protection', 'control'],
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const record = await source.query.getRecord(testCase.record)
			expect(record).toBeDefined()
			if (!record) return

			const ieds = await resolveAffectedIeds(source.query, { record })
			expect(ieds.map((ied) => ied.id)).toEqual(testCase.expectedIedIds)
		},
	})
})
