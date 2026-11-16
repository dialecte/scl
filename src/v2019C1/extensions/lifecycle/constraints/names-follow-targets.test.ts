import { readConstraintScope } from './find-constraint-violation'
import { identityCollisionInScope } from './find-identity-collision'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A subnetwork with the connection of X's access point, named by uuid, and Y's, named by names only. */
const projectXml = /* xml */ `
	<SCL ${ns}>
		<Communication>
			<SubNetwork name="StationBus" ${id}="subnetwork">
				<ConnectedAP iedName="X" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000011"/>
				<ConnectedAP iedName="Y" apName="AP1"/>
			</SubNetwork>
		</Communication>
		<IED name="X" uuid="e0000000-0000-4000-8000-000000000001">
			<AccessPoint name="AP1" uuid="e0000000-0000-4000-8000-000000000011"/>
		</IED>
		<IED name="Y" uuid="e0000000-0000-4000-8000-000000000002">
			<AccessPoint name="AP1" uuid="e0000000-0000-4000-8000-000000000012"/>
		</IED>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	connection: Record<string, string>
	expected: { collidesWith: string | undefined }
}

// A connection written beside the subnetwork's connections, with the names of one of them: its names are compared as
// a key no field of which can be changed, except where both name their access point by uuid and name two access points
// the document holds.
describe('identityCollisionInScope - a connection with the names of another', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"X's names, another access point by uuid → no collision, its names follow the access point it names":
			{
				sourceXml: projectXml,
				connection: { iedName: 'X', apName: 'AP1', apUuid: 'e0000000-0000-4000-8000-000000000099' },
				expected: { collidesWith: undefined },
			},
		"Z's names, an access point by uuid, Z's connection naming by uuid an access point the document lacks → collides with Z's connection, its names follow nothing":
			{
				sourceXml: /* xml */ `
				<SCL ${ns}>
					<Communication>
						<SubNetwork name="StationBus" ${id}="subnetwork">
							<ConnectedAP iedName="Z" apName="AP1" apUuid="e0000000-0000-4000-8000-000000000077"/>
						</SubNetwork>
					</Communication>
					<IED name="X" uuid="e0000000-0000-4000-8000-000000000001">
						<AccessPoint name="AP1" uuid="e0000000-0000-4000-8000-000000000011"/>
					</IED>
				</SCL>
			`,
				connection: { iedName: 'Z', apName: 'AP1', apUuid: 'e0000000-0000-4000-8000-000000000011' },
				expected: { collidesWith: 'ConnectedAP' },
			},
		"X's names, X's access point by uuid → collides with X's connection": {
			sourceXml: projectXml,
			connection: { iedName: 'X', apName: 'AP1', apUuid: 'e0000000-0000-4000-8000-000000000011' },
			expected: { collidesWith: 'ConnectedAP' },
		},
		"X's names, no uuid → collides with X's connection": {
			sourceXml: projectXml,
			connection: { iedName: 'X', apName: 'AP1' },
			expected: { collidesWith: 'ConnectedAP' },
		},
		"Y's names, an access point by uuid, Y's connection naming none → collides with Y's connection":
			{
				sourceXml: projectXml,
				connection: { iedName: 'Y', apName: 'AP1', apUuid: 'e0000000-0000-4000-8000-000000000012' },
				expected: { collidesWith: 'ConnectedAP' },
			},
	}

	async function act({ source, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		const scope = await readConstraintScope(source.query, {
			parentRef: { tagName: 'SubNetwork', id: 'subnetwork' },
			childTag: 'ConnectedAP',
		})
		const collision = identityCollisionInScope({
			scope,
			tagName: 'ConnectedAP',
			candidate: testCase.connection,
		})
		expect({ collidesWith: collision?.collidesWith.tagName }).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
