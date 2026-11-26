import { createSclTestProject } from './hydrated-test'
import { openSclDocument } from './open-scl-document'
import { assertOutputGateTestCases, withOutputGate } from './output-gate'
import { XMLNS_SCL_NAMESPACE } from './scl-xmlns.constants'

import { describe, expect, it } from 'vitest'

import type { OutputGateTestCase } from './output-gate.types'

/** A document whose root states no version: a first-edition file. */
const FIRST_EDITION_XML = /* xml */ `<SCL ${XMLNS_SCL_NAMESPACE}><Header id="h"/></SCL>`

const OPT_IN = 'a first-edition device file'

// Every path a case document takes is held to its edition: the runner's gate before each act, a third document opened
// with `openSclDocument`, and the runner's check of the cases before the suite, which refuses an opt-in without a
// reason.
describe('the edition of a given document, on every path a test reads it', () => {
	it('the runner gate: a case whose source states no version, no opt-in → its act refused', async () => {
		const { project, source } = await createSclTestProject({
			sourceXml: FIRST_EDITION_XML,
			editionOneRoot: OPT_IN,
		})
		const gatedCase: OutputGateTestCase = { sourceXml: FIRST_EDITION_XML }
		const gatedAct = withOutputGate({
			act: async function noAct() {},
			testCases: { 'gated case': gatedCase },
		})
		const outcome = gatedAct({ testCase: gatedCase, project, source: source.document })
		await expect(outcome).rejects.toThrow('gated case: the source document states no SCL version')
	})

	it('the runner gate: the same case with editionOneRoot → its act runs', async () => {
		const { project, source } = await createSclTestProject({
			sourceXml: FIRST_EDITION_XML,
			editionOneRoot: OPT_IN,
		})
		const gatedCase: OutputGateTestCase = { sourceXml: FIRST_EDITION_XML, editionOneRoot: OPT_IN }
		const gatedAct = withOutputGate({
			act: async function noAct() {},
			testCases: { 'gated case': gatedCase },
		})
		const outcome = gatedAct({ testCase: gatedCase, project, source: source.document })
		await expect(outcome).resolves.toBeUndefined()
	})

	it('openSclDocument: a third document stating no version, no opt-in → refused', async () => {
		const { project } = await createSclTestProject({
			sourceXml: FIRST_EDITION_XML,
			editionOneRoot: OPT_IN,
		})
		const opened = openSclDocument({ project, xml: FIRST_EDITION_XML, label: 'third' })
		await expect(opened).rejects.toThrow('third: the source document states no SCL version')
	})

	it('the cases checked before the suite: editionOneRoot empty → refused, naming the case', () => {
		function refused(): void {
			assertOutputGateTestCases({
				testCases: { 'empty opt-in': { sourceXml: FIRST_EDITION_XML, editionOneRoot: '' } },
			})
		}
		expect(refused).toThrow('empty opt-in: editionOneRoot needs the reason')
	})
})
