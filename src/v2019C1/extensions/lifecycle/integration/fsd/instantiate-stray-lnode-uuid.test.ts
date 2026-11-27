import { describe, expect } from 'vitest'

import strayXml from '@/v2019C1/hooks/shared/fixtures/stray-lnode-uuid/stray.xml?raw'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const F1 = { tagName: 'Function', id: 'f1' } as Scl.Ref<'Function'>
const TARGET_BAY = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<Scl.ElementsOf>

/** The project the template is instantiated into: S2/VL2 holding an empty bay BT. */
const PROJECT = /* xml */ `
	<SCL ${ns} ${id}="project-t">
		<Substation name="S2" ${id}="s2">
			<VoltageLevel name="VL2" ${id}="vl2">
				<Bay name="BT" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('fsd instantiate of a template Function whose behaviour variable repeats the LNode of its input', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		expectedPreview: {
			refusals: string[]
			normalised: { element: string; removed: string[]; kept: string; lnode: string }[]
		}
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// stray.xml as the template: F1's behaviour FB names GAPC2's Trip and repeats GAPC2's uuid; the project's BT is empty
		'F1 instantiated into BT → the preview refuses nothing and lists the variable, the commit drops its lnodeUuid':
			{
				sourceXml: strayXml,
				targetXml: PROJECT,
				expectedPreview: {
					refusals: [],
					normalised: [
						{
							element: 'InputVar',
							removed: ['dataName', 'lnodeUuid'],
							kept: 'inputUuid',
							lnode: 'LNode',
						},
					],
				},
				expectedQueries: [
					'//v2019C1:InputVar[@varName="trip"][@inputUuid][@inputName="GAPC2.Trip"][not(@lnodeUuid)][not(@dataName)]',
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = {
			verb: 'fsd',
			scenario: 'instantiate',
			sourceQuery: source.query,
			ref: F1,
			anchor: TARGET_BAY,
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		const instantiated = target.transaction(async function applyAndPreview(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report })
			const preview = await tx.cleanUp.commitPrune({ collect: true })
			return {
				refusals: preview.refusals.map((refusal) => refusal.key),
				normalised: preview.normalised.map(({ element, removed, kept, lnode }) => ({
					element: element.tagName,
					removed,
					kept,
					lnode: lnode.tagName,
				})),
			}
		})
		await expect(instantiated).resolves.toEqual(testCase.expectedPreview)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
