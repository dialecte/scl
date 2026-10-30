import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ALL_XMLNS_NAMESPACES, createSclTestProject } from '@/v2019C1/test'

const sourceXml = /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES} />`

describe('createSclTestProject', () => {
	// opened in `beforeAll`, outside a running test: the test owns no project there
	const outside: { error?: unknown; openedDatabases: string[] } = { openedDatabases: [] }
	beforeAll(async function openOutsideRunningTest() {
		const open = vi.spyOn(indexedDB, 'open')
		try {
			await createSclTestProject({ sourceXml })
		} catch (error) {
			outside.error = error
		}
		outside.openedDatabases = open.mock.calls.map(([name]) => name)
		open.mockRestore()
	})

	it('called outside a running test, rejects and leaves no project open', async () => {
		expect(outside.error).toBeInstanceOf(Error)
		expect(outside.openedDatabases.length).toBeGreaterThan(0)
		const databases = await indexedDB.databases()
		const left = databases
			.map(({ name }) => name)
			.filter((name) => name !== undefined && outside.openedDatabases.includes(name))
		expect(left).toEqual([])
	})
})
