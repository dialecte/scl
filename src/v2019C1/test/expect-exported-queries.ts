import { assertExpectedElementQueries, assertUnexpectedElementQueries } from './hydrated-test'

import { expect } from 'vitest'

import type { SclTest } from './hydrated-test.types'

/**
 * The XPath expectations of a table case, asserted inside `expect(...)`: a query that matches nothing
 * (or an element that is there) fails as an assertion, which `dialecte tdd red` accepts as a red; the
 * runner's own check throws a plain error it refuses. Call it from the act, after the change, with
 * the case and the act's own params: the runner then finds the same expectations met.
 */
export async function expectExportedQueries(params: {
	act: SclTest.ActParams<SclTest.BaseXmlTestCase>
}): Promise<void> {
	const { project, source, testCase } = params.act
	const { file } = await project.export({
		documentId: source.documentId,
		indent: false,
		withDatabaseIds: true,
	})
	const xml = await file.text()
	const { expectedQueries = [], unexpectedQueries = [] } = testCase
	if (expectedQueries.length > 0) {
		expect(() => assertExpectedElementQueries({ xml, queries: expectedQueries })).not.toThrow()
	}
	if (unexpectedQueries.length > 0) {
		expect(() => assertUnexpectedElementQueries({ xml, queries: unexpectedQueries })).not.toThrow()
	}
}
