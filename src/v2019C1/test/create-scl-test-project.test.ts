import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ALL_XMLNS_NAMESPACES, createSclTestProject } from '@/v2019C1/test'

const sourceXml = /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES} />`

/** A terminal carrying the uuid of a node the file does not hold: the reference check refuses it. */
const INCOHERENT_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES}>
		<Substation name="S1">
			<VoltageLevel name="VL1">
				<Bay name="B1">
					<ConductingEquipment name="QA1" type="CBR">
						<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" cNodeUuid="00000000-0000-4000-8000-000000000009"/>
					</ConductingEquipment>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A call made outside a running test (the test owns no project there): its error, the databases it opened. */
type OutsideCall = { error?: unknown; openedDatabases: string[] }

async function callOutsideRunningTest(params: { xml: string }): Promise<OutsideCall> {
	const called: OutsideCall = { openedDatabases: [] }
	const open = vi.spyOn(indexedDB, 'open')
	try {
		await createSclTestProject({ sourceXml: params.xml })
	} catch (error) {
		called.error = error
	}
	called.openedDatabases = open.mock.calls.map(([name]) => name)
	open.mockRestore()
	return called
}

/** The databases of the call still there. */
async function databasesLeftBy(params: { called: OutsideCall }): Promise<(string | undefined)[]> {
	const databases = await indexedDB.databases()
	return databases
		.map(({ name }) => name)
		.filter((name) => name !== undefined && params.called.openedDatabases.includes(name))
}

describe('createSclTestProject', () => {
	const outside: { coherent: OutsideCall; incoherent: OutsideCall } = {
		coherent: { openedDatabases: [] },
		incoherent: { openedDatabases: [] },
	}
	beforeAll(async function callOutsideRunningTests() {
		outside.coherent = await callOutsideRunningTest({ xml: sourceXml })
		outside.incoherent = await callOutsideRunningTest({ xml: INCOHERENT_XML })
	})

	it('called outside a running test, rejects and leaves no project open', async () => {
		expect(outside.coherent.error).toBeInstanceOf(Error)
		expect(outside.coherent.openedDatabases.length).toBeGreaterThan(0)
		await expect(databasesLeftBy({ called: outside.coherent })).resolves.toEqual([])
	})

	it('given an incoherent fixture outside a running test, rejects on it and leaves no project open', async () => {
		expect(String(outside.incoherent.error)).toContain('cNodeUuid')
		await expect(databasesLeftBy({ called: outside.incoherent })).resolves.toEqual([])
	})
})
