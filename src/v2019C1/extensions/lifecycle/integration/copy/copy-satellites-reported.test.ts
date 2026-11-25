import { ref, reportCopy } from './copy-helpers'
import functionXml from './fixtures/a-function-to-copy.xml?raw'
import applicationsXml from './fixtures/applications-to-copy.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// a-function-to-copy.xml: C1 (in B1) classifies F1 by cat-ref, V1 (in B1) applies to F1; applications-to-copy.xml: R
// allocates F1 by r-f1, V2 applies to F1 and A1's ROOT names it.

/** The element of the report a case looks for: its change, tag and source element, as `describeNode` writes it. */
type Listed = string

// The report lists what the apply writes outside the copied root, each with its own source element: the reference a
// category or a role reused gains, the variable placed for the copy.
describe('copy - what it brings outside its root, reported', () => {
	type ReportedCase = SclTest.BaseXmlTestCase & { copy: CopyCase; listed: Listed }

	const testCases: SclTest.TestCases<ReportedCase> = {
		// C1 is reused: the reference it gains for the copy is the one naming F1, poured into it
		'F1 to B2 → the reference C1 gains for the copy listed added': {
			sourceXml: functionXml,
			copy: { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b2') },
			listed: 'added FunctionCatRef cat-ref',
		},
		// V1 applies to F1: one is placed for the copy
		'F1 to B2 → the variable V1 placed for the copy listed added': {
			sourceXml: functionXml,
			copy: { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b2') },
			listed: 'added Variable v1',
		},
		// R is reused: the reference it gains for the copy of F1 is the one naming F1, poured into it
		'A1 to B2 → the reference R gains for the copy of F1 listed added': {
			sourceXml: applicationsXml,
			copy: { verb: 'asd', ref: ref('Application', 'a1'), anchor: ref('Bay', 'b2') },
			listed: 'added FunctionRef r-f1',
		},
		// V2 applies to F1 and A1's ROOT names it: one is placed for the copy
		'A1 to B2 → the variable V2 placed for the copy listed added': {
			sourceXml: applicationsXml,
			copy: { verb: 'asd', ref: ref('Application', 'a1'), anchor: ref('Bay', 'b2') },
			listed: 'added Variable v2',
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReportedCase>): Promise<void> {
		const listed = reportCopy({ document: source, copy: testCase.copy }).then(listNodes)
		await expect(listed).resolves.toContain(testCase.listed)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** Every node of the report's groups, primaries and companions, with what they hold. */
function listNodes(report: DiffReport): Listed[] {
	return report.instances
		.flatMap((instance) => instance.groups)
		.flatMap((group) => [group.primary, ...group.companions])
		.flatMap(describeNode)
}

/** A node and what it holds, each as its change, tag and source element. */
function describeNode(node: DiffNode): Listed[] {
	return [
		`${node.change} ${node.tagName} ${node.sourceRef?.id}`,
		...node.children.flatMap(describeNode),
	]
}
