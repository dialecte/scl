import { updateRefPaths } from './ref-paths'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A Function F1 a FunctionCatRef names by uuid and path, an LNode XCBR1 a SourceRef names by uuid and path. */
const COHERENT_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="sub1" name="Sub1">
			<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
				<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1"/>
			</eIEC61850-6-100:FunctionCategory>
			<Function ${id}="f1" name="F1" uuid="uuid-f1" templateUuid="tpl-1">
				<LNode ${id}="xcbr" iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_1" uuid="uuid-xcbr"/>
				<LNode ${id}="ptrc" iedName="None" lnClass="PTRC" lnInst="1" uuid="uuid-ptrc">
					<Private ${id}="ptrc-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeInputs ${id}="ptrc-inputs">
							<eIEC61850-6-100:SourceRef ${id}="src1" input="Pos" source="Sub1/F1/XCBR1.Pos" sourceDoName="Pos" sourceLNodeUuid="uuid-xcbr"/>
						</eIEC61850-6-100:LNodeInputs>
					</Private>
				</LNode>
			</Function>
		</Substation>
	</SCL>
`

/**
 * An update of a referenced element looks its referrers up only when it changes what they read of it: its uuid or an
 * attribute of its path. A lineage-only or type-id-only update writes nothing, as before, and now reads no referrer.
 * A rename, a path or a uuid change looks them up and writes them as before (`ref-paths.test.ts`).
 */
describe('updateRefPaths - an update changing nothing the referrers read', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		target: Scl.Ref<Scl.ElementsOf>
		attributes: Record<string, string>
		expected: { operations: number; lookups: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'templateUuid of the Function → nothing written, no referrer looked up': {
			// the FunctionCatRef names F1 by uuid and path
			sourceXml: COHERENT_XML,
			target: { tagName: 'Function', id: 'f1' },
			attributes: { templateUuid: 'tpl-2' },
			expected: { operations: 0, lookups: 0 },
		},
		'lnType of the LNode → nothing written, no referrer looked up': {
			// the SourceRef names XCBR1 by uuid and path
			sourceXml: COHERENT_XML,
			target: { tagName: 'LNode', id: 'xcbr' },
			attributes: { lnType: 'XCBR_2' },
			expected: { operations: 0, lookups: 0 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			let observed: TestCase['expected'] | undefined
			await source.transaction(async function updateThenFollow(tx) {
				const stored = await tx.getRecord(testCase.target)
				const before = toRawRecord(stored!) as Scl.RawRecord<Scl.ElementsOf>
				await tx.any.update(testCase.target, { attributes: testCase.attributes })
				const staged = await tx.getRecord(testCase.target)
				const after = toRawRecord(staged!) as Scl.RawRecord<Scl.ElementsOf>
				const { query, calls } = countDocumentQueryReads(tx)
				const operations = await updateRefPaths({ query, oldRecord: before, newRecord: after })
				const searches = calls().filter(
					(call) =>
						call.method === 'findByAttributes' &&
						['FunctionCatRef', 'SourceRef'].includes((call.args[0] as { tagName: string }).tagName),
				)
				observed = { operations: operations.length, lookups: searches.length }
			})
			expect(observed).toEqual(testCase.expected)
		},
	})
})
