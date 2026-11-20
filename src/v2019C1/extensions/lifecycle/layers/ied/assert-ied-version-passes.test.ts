import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const otherIedRef = { tagName: 'IED', id: 'other-ied' } as const satisfies Scl.Ref<'IED'>
const openRoot = { tagName: 'SCL', id: 'open-root' } as const satisfies Scl.Ref<'SCL'>

/** The open ISD instance file of BCU1. */
const openIsd = /* xml */ `
	<SCL ${ns} ${id}="open-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="f0000000-0000-4000-8000-000000000002" version="1" revision="A"/>
		<IED name="BCU1" uuid="b0000000-0000-4000-8000-000000000030">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000031"/>
		</IED>
	</SCL>
`

/** A later revision of the open ISD: the same Header uuid, the same IED uuid. */
const laterRevision = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="f0000000-0000-4000-8000-000000000002" version="1" revision="B"/>
		<IED name="BCU1" uuid="b0000000-0000-4000-8000-000000000030" ${id}="other-ied">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000031"/>
		</IED>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	expected: { reported: true } | { refused: { key: string; meta: Record<string, unknown> } }
}

// A version of the open ISD passes the version check: the fork goes on, reported as the update of its IED.
describe('query.lifecycle.report - a fork on an open ISD of a version of it passes the version check', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a version of the open ISD (same Header uuid, same IED uuid) -> not refused as NOT_A_VERSION_OF_FILE, reported as the update of its IED':
			{
				sourceXml: laterRevision,
				targetXml: openIsd,
				expected: { reported: true },
			},
	}

	async function act({ project, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		const open = await importIsd({ project, xml: testCase.targetXml, fileName: 'BCU1.isd' })
		const other = await importIsd({ project, xml: testCase.sourceXml, fileName: 'BCU1-other.isd' })
		const outcome = await open.query.lifecycle
			.report({
				verb: 'ied',
				scenario: 'fork',
				sourceQuery: other.query,
				ref: otherIedRef,
				anchor: openRoot,
			})
			.then(
				() => ({ reported: true }),
				(error: unknown) => {
					const refusal = toDialecteError(error)
					return { refused: { key: refusal?.key, meta: refusal?.meta } }
				},
			)
		expect(outcome).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** Import an ISD file of the case into the project, under its own extension, and open it. */
async function importIsd(params: {
	project: SclTest.ActParams<TestCase>['project']
	xml: string | undefined
	fileName: string
}) {
	const { project, xml, fileName } = params
	if (!xml) throw new Error(`${fileName}: xml required`)
	const { documentId } = await project.importFile(new File([xml], fileName, { type: 'text/xml' }), {
		useCustomRecordsIds: true,
	})
	return project.openDocument(documentId)
}
