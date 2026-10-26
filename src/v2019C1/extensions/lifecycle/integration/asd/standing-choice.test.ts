import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import {
	asd as instantiateAsd,
	fsd as instantiateFsd,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

// An application placed in a bay gains a function the bay holds two free functions of: which one it stands on is the
// consumer's to choose. The report offers the choice, the apply refuses until it is made, and writes what was chosen.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const controlRef = { tagName: 'Function', id: 'control-s' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
					<Function name="Ctrl" uuid="control-source-uuid" ${id}="control-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What the consumer chooses: one of the free functions, by name, or a new one; nothing when absent. */
	choose?: string | 'new'
	expected: {
		/** The choice the report lists: its candidates, and what is chosen. */
		choice: string
		/** A fragment of the refusal of the apply; nothing else is then checked. */
		refusal?: string
		/** The function the application's new reference names, by name. */
		referenced?: string
		/** The functions of the gained lineage in the end. */
		functions?: string[]
	}
}

describe('update of an application whose bay holds two free functions of a lineage it gains', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'nothing chosen → the report offers both, the apply refuses before writing': {
			sourceXml,
			targetXml: projectXml,
			expected: { choice: 'Ctrl | Ctrl_1 → to choose', refusal: 'is not decided' },
		},
		'the second one chosen → the application refers to it, nothing is placed': {
			sourceXml,
			targetXml: projectXml,
			choose: 'Ctrl_1',
			expected: {
				choice: 'Ctrl | Ctrl_1 → Ctrl_1',
				referenced: 'Ctrl_1',
				functions: ['Ctrl', 'Ctrl_1'],
			},
		},
		'a new one chosen → placed beside the two, the application refers to it': {
			sourceXml,
			targetXml: projectXml,
			choose: 'new',
			expected: {
				choice: 'Ctrl | Ctrl_1 → new',
				referenced: 'Ctrl_2',
				functions: ['Ctrl', 'Ctrl_1', 'Ctrl_2'],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		// the application placed in the bay, then the control function placed twice on its own
		await target.transaction(async function place(tx) {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef: controlRef,
				targetParent: bayRef,
			})
			await instantiateFsd(tx, {
				sourceQuery: source.query,
				functionRef: controlRef,
				targetParent: bayRef,
			})
		})
		// the template's application gains the control function
		await source.transaction(async function gain(tx) {
			await tx.addChild(
				{
					tagName: 'FunctionRoleContent',
					id: 'function-role-content-s',
				} as Scl.Ref<'FunctionRoleContent'>,
				{
					tagName: 'FunctionRef',
					attributes: {
						function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
						functionUuid: 'control-source-uuid',
					},
				},
			)
		})

		const lifecycleTarget = {
			verb: 'asd' as const,
			scenario: 'template' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}
		const listed = await report(target.query, lifecycleTarget)
		const offered = listed.mappings.find((mapping) => mapping.tagName === 'Function')
		if (!offered) throw new Error('the report lists the choice')
		expect(listed.needsDecisions, 'report').toBe(true)
		expect(offered.ambiguous, 'report: several qualify, none picked').toBe(true)

		const mappings = new Map<string, DecisionMapping>()
		if (testCase.choose) {
			const picked = offered.candidates.find((candidate) => candidate.title === testCase.choose)
			mappings.set(offered.id, picked ? { existing: picked.ref } : { create: {} })
		}
		const reported = await report(target.query, { ...lifecycleTarget, resolution: { mappings } })
		const choice = reported.mappings.find((mapping) => mapping.id === offered.id)
		const chosen = choice?.mapping
		const outcome = !chosen
			? 'to choose'
			: 'create' in chosen
				? 'new'
				: choice.candidates.find((candidate) => candidate.ref.id === chosen.existing.id)?.title
		expect(
			`${offered.candidates.map((candidate) => candidate.title).join(' | ')} → ${outcome}`,
			'report',
		).toBe(testCase.expected.choice)

		const before = (await target.query.getSnapshot({ as: 'xml' })) as string
		const applied = target.transaction(async function write(tx) {
			await apply(tx, {
				...lifecycleTarget,
				report: reported,
				resolution: { decisions: new Map(), mappings },
			})
		})
		if (testCase.expected.refusal) {
			await expect(applied).rejects.toThrow(testCase.expected.refusal)
			const after = await target.query.getSnapshot({ as: 'xml' })
			expect(after, 'nothing written').toBe(before)
			return
		}
		await applied

		const controls = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'control-source-uuid' },
		})
		const names: string[] = []
		for (const control of controls) {
			const name = await target.query.getAttribute(control, { name: 'name' })
			names.push(name ?? '')
		}
		expect(names.sort(), 'apply').toEqual(testCase.expected.functions)

		const [reference] = await target.query.findByAttributes({
			tagName: 'FunctionRef',
			attributes: { function: `S1/V1/B1/${testCase.expected.referenced}` },
		})
		expect(reference, 'apply: the application refers to the function chosen').toBeDefined()
	}

	runSclTestCases.withoutExport({ testCases, act })
})
