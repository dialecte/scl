import { ref } from './copy-helpers'
import applicationsXml from './fixtures/applications-to-copy.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// applications-to-copy.xml: S1/VL1/B1 holds A1 composing F1 and F2; V2 applies to F1 and A1's ROOT names it. B2 holds
// nothing.

/** A1 placed under B2. */
const A1_TO_B2 = { ref: ref('Application', 'a1'), anchor: ref('Bay', 'b2') }

// Only a copy reads its document as the project's own: an instantiate whose source is the document itself still finds
// the satellites the project holds by their uuid, lists none of them and places none again, as before copies existed.
describe('instantiate from the document itself - unchanged by copies', () => {
	type InstantiateCase = SclTest.BaseXmlTestCase

	const testCases: SclTest.TestCases<InstantiateCase> = {
		// V2 is held by its uuid in the document A1 is instantiated from
		'A1 instantiated into B2 from its own document → V2, held by its uuid, neither listed nor placed again':
			{
				sourceXml: applicationsXml,
				unexpectedQueries: ['(//v2019C1:Variable[@name="V2"])[2]'],
			},
	}

	async function act({ source }: SclTest.ActParams<InstantiateCase>): Promise<SclTest.ActResult> {
		const target = {
			verb: 'asd',
			sourceQuery: source.query,
			...A1_TO_B2,
			scenario: 'instantiate',
		} as const
		const listed = source.query.lifecycle.report(target).then(async function thenApply(report) {
			await source.transaction(async function applyTheReport(tx) {
				await tx.lifecycle.apply({ ...target, report })
			})
			return listsVariable({ report, id: 'v2' })
		})
		await expect(listed).resolves.toBe(false)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Whether the report lists the variable added, among its groups' nodes. */
function listsVariable(params: { report: DiffReport; id: string }): boolean {
	const { report, id } = params
	function lists(node: DiffNode): boolean {
		return (
			(node.change === 'added' && node.tagName === 'Variable' && node.sourceRef?.id === id) ||
			node.children.some(lists)
		)
	}
	return report.instances
		.flatMap((instance) => instance.groups)
		.some((group) => [group.primary, ...group.companions].some(lists))
}
