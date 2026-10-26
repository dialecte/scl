import { apply } from './apply'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleApplyParams,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-s' } as Scl.Ref<'Function'>
const otherFunctionRef = { tagName: 'Function', id: 'other-fn-s' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>
const otherBayRef = { tagName: 'Bay', id: 'bay-t2' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="fn-uuid" ${id}="fn-s"/>
					<Function name="Ctrl" uuid="other-fn-uuid" ${id}="other-fn-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t1"/>
				<Bay name="B2" ${id}="bay-t2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type Lifecycle = LifecycleTarget

type TestCase = {
	only?: boolean
	/** What the report is asked for, from the project with the function already placed in `B1`. */
	reported: (params: {
		lifecycle: Lifecycle
		sourceQuery: Scl.Query
		targetQuery: Scl.Query
	}) => Lifecycle
	/** What the apply is asked for. */
	applied: (params: {
		lifecycle: Lifecycle
		sourceQuery: Scl.Query
		targetQuery: Scl.Query
	}) => Lifecycle
	/** What the report is turned into between the report and the apply. */
	altered?: (report: DiffReport) => DiffReport
	/** The function placed in `B1` is deleted between the report and the apply. */
	deletesInstance?: boolean
	/** The refusal's key and data (and its code, when the row checks it); absent: applied. */
	expectedRefusal?: { key: string; code?: string; meta: Record<string, unknown> }
}

const same = ({ lifecycle }: { lifecycle: Lifecycle }) => lifecycle

describe('apply — the report is applied to the target it was made for', () => {
	const testCases: Record<string, TestCase> = {
		'the same target -> applied': {
			reported: same,
			applied: same,
		},
		'the report of another project -> refused': {
			reported: same,
			applied: same,
			altered: (reported) => ({
				...reported,
				target: reported.target && { ...reported.target, document: 'another-project' },
			}),
			expectedRefusal: {
				key: 'REPORT_TARGET_MISMATCH',
				code: 'SCL1013',
				meta: { field: 'document' },
			},
		},
		'another template file -> refused': {
			reported: same,
			applied: ({ lifecycle, targetQuery }) => ({ ...lifecycle, sourceQuery: targetQuery }),
			expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'source' } },
		},
		'another layer -> refused': {
			reported: same,
			applied: ({ lifecycle }) => ({ ...lifecycle, verb: 'asd' }) as unknown as Lifecycle,
			expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'verb' } },
		},
		'another template function -> refused': {
			reported: same,
			applied: ({ lifecycle }) => ({ ...lifecycle, ref: otherFunctionRef }) as Lifecycle,
			expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'ref' } },
		},
		'another place in the project -> refused': {
			reported: same,
			applied: ({ lifecycle }) => ({ ...lifecycle, anchor: otherBayRef }),
			expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'anchor' } },
		},
		'another operation -> refused': {
			reported: same,
			applied: ({ lifecycle }) => ({ ...lifecycle, scenario: 'instantiate' }) as Lifecycle,
			expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'scenario' } },
		},
		'no operation asked on one side, the default on the other -> applied': {
			reported: ({ lifecycle }) => ({ ...lifecycle, scenario: undefined }) as Lifecycle,
			applied: ({ lifecycle }) => ({ ...lifecycle, scenario: 'template' }) as Lifecycle,
		},
		'one instance asked for on the apply only -> refused': {
			reported: same,
			applied: ({ lifecycle }) => ({ ...lifecycle, targetInstance: bayRef }) as Lifecycle,
			expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'targetInstance' } },
		},
		'one instance asked for on the report only -> refused': {
			reported: ({ lifecycle }) => ({ ...lifecycle, targetInstance: bayRef }) as Lifecycle,
			applied: same,
			expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'targetInstance' } },
		},
		'a report no report made (no target) -> refused': {
			reported: same,
			applied: same,
			altered: (reported) => ({ ...reported, target: undefined }),
			expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'report' } },
		},
		'an instance the report covers deleted since -> refused as stale': {
			reported: same,
			applied: same,
			deletesInstance: true,
			expectedRefusal: {
				key: 'REPORT_STALE',
				meta: { element: { tagName: 'Function', id: expect.any(String) }, kind: 'instance' },
			},
		},
	}

	async function act(testCase: TestCase): Promise<void> {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		const sourceQuery = source.document.query
		const targetQuery = target.document.query
		const lifecycle = {
			verb: 'fsd',
			scenario: 'template',
			sourceQuery,
			ref: functionRef,
			anchor: bayRef,
		} as const
		const placement = { ...lifecycle, scenario: 'instantiate' } as const
		const placed = await report(targetQuery, placement)
		await target.document.transaction(async function place(tx) {
			await apply(tx, { ...placement, report: placed })
		})

		const context = { lifecycle, sourceQuery, targetQuery }
		const made = await report(targetQuery, testCase.reported(context))
		const reported = testCase.altered ? testCase.altered(made) : made
		if (testCase.deletesInstance) {
			const [instance] = await targetQuery.findByAttributes({
				tagName: 'Function',
				attributes: { templateUuid: 'fn-uuid' },
			})
			await target.document.transaction(async function deleteInstance(tx) {
				await tx.delete(instance as Scl.Ref<'Function'>)
			})
		}
		const before = await targetQuery.getSnapshot({ as: 'xml' })

		const applied = target.document.transaction(async function applyReport(tx) {
			await apply(tx, {
				...testCase.applied(context),
				report: reported,
				resolution: { decisions: new Map() },
			} as LifecycleApplyParams)
		})

		if (!testCase.expectedRefusal) {
			await applied
			return
		}
		const refusal = toDialecteError(await applied.catch((error: unknown) => error))
		const { code } = testCase.expectedRefusal
		expect({
			key: refusal?.key,
			...(code ? { code: refusal?.code } : {}),
			meta: refusal?.meta,
		}).toEqual(testCase.expectedRefusal)
		expect(await targetQuery.getSnapshot({ as: 'xml' }), 'nothing written').toEqual(before)
	}

	runSclTestCases.generic(testCases, act)

	it('the report says what it was made for', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const reported = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		})

		expect(reported.target).toEqual({
			document: (await target.document.query.getDocumentInfo()).id,
			source: (await source.document.query.getDocumentInfo()).id,
			verb: 'fsd',
			ref: { tagName: 'Function', id: 'fn-s' },
			anchor: { tagName: 'Bay', id: 'bay-t1' },
			scenario: 'template',
		})
	})
})
