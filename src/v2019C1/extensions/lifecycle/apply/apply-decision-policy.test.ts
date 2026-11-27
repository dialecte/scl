import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A function template. */
const templateXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="prot-template-uuid" ${id}="prot-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project with an empty bay. */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type PolicyCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What the apply tells: the error's key and the titles of the groups it names, none when it writes. */
	expected: { key?: string; leftOut?: string[] }
}

// A report made under the every-change policy takes no default: applying it with a group left out is refused, even on
// the fast track a first placement is on otherwise.
describe("tx.lifecycle.apply - a first placement under the report's decision policy", () => {
	const testCases: SclTest.TestCases<PolicyCase> = {
		'a function placed under every-change, no group named → refused with DECISION_REQUIRED, nothing written':
			{
				sourceXml: templateXml,
				targetXml: projectXml,
				expected: { key: 'DECISION_REQUIRED', leftOut: ['added Function'] },
				unexpectedQueries: ['//default:Function'],
			},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<PolicyCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const placement: LifecycleTarget = {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'prot-s' } as Scl.Ref<'Function'>,
			anchor: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>,
			scenario: 'instantiate',
		}
		const reported = await report(target.query, { ...placement, decisionPolicy: 'every-change' })
		const groups = reported.instances.flatMap((instance) => instance.groups)
		const outcome = await target
			.transaction(async function applyThePlacement(tx) {
				await apply(tx, { ...placement, report: reported, resolution: { decisions: new Map() } })
			})
			.then(
				() => ({}),
				function refusalOf(error: unknown) {
					const refusal = toDialecteError(error)
					const meta = (refusal?.meta ?? {}) as { groupIds?: string[] }
					const leftOut = groups
						.filter((group) => meta.groupIds?.includes(group.id))
						.map((group) => group.title)
					return { key: refusal?.key, leftOut }
				},
			)
		expect(outcome).toEqual(testCase.expected)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type PlacementCase = SclTest.BaseXmlTestCase & { targetXml: string }

// Every group of an every-change report named and accepted: the placement is written.
describe('tx.lifecycle.apply - a first placement under every-change, every group decided', () => {
	const testCases: SclTest.TestCases<PlacementCase> = {
		'a function placed under every-change, every group accepted → placed': {
			sourceXml: templateXml,
			targetXml: projectXml,
			expectedQueries: ['//default:Bay[@name="B1"]/default:Function[@name="Prot"]'],
		},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<PlacementCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const placement = functionPlacement({ sourceQuery: source.query })
		const reported = await report(target.query, { ...placement, decisionPolicy: 'every-change' })
		const groups = reported.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, 'accept'] as const))
		await target.transaction(async function applyThePlacement(tx) {
			await apply(tx, { ...placement, report: reported, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// apply enforces the policy the report records, not the marks on its groups: a report read back without them is
// refused all the same.
describe('tx.lifecycle.apply - an every-change report read back without the marks on its groups', () => {
	const testCases: SclTest.TestCases<PolicyCase> = {
		'a function placed under every-change, the report read back without its marks, no group named → refused with DECISION_REQUIRED, nothing written':
			{
				sourceXml: templateXml,
				targetXml: projectXml,
				expected: { key: 'DECISION_REQUIRED', leftOut: ['added Function'] },
				unexpectedQueries: ['//default:Function'],
			},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<PolicyCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const placement = functionPlacement({ sourceQuery: source.query })
		const made = await report(target.query, { ...placement, decisionPolicy: 'every-change' })
		const reported = withoutMarks(made)
		const groups = reported.instances.flatMap((instance) => instance.groups)
		const outcome = await target
			.transaction(async function applyThePlacement(tx) {
				await apply(tx, { ...placement, report: reported, resolution: { decisions: new Map() } })
			})
			.then(
				() => ({}),
				function refusalOf(error: unknown) {
					const refusal = toDialecteError(error)
					const meta = (refusal?.meta ?? {}) as { groupIds?: string[] }
					const leftOut = groups
						.filter((group) => meta.groupIds?.includes(group.id))
						.map((group) => group.title)
					return { key: refusal?.key, leftOut }
				},
			)
		expect(outcome).toEqual(testCase.expected)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The first placement of the template's function in the project's bay. */
function functionPlacement(params: { sourceQuery: Core.Query<Config> }): LifecycleTarget {
	return {
		verb: 'fsd',
		sourceQuery: params.sourceQuery,
		ref: { tagName: 'Function', id: 'prot-s' } as Scl.Ref<'Function'>,
		anchor: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>,
		scenario: 'instantiate',
	}
}

/** A report as a consumer may read it back: its groups without the marks the policy set, the track fast. */
function withoutMarks(made: DiffReport): DiffReport {
	const instances = made.instances.map(function unmarked(instance) {
		const groups = instance.groups.map(function unmarkedGroup(group) {
			return { ...group, requiresDecision: undefined, suggestedAction: 'accept' as const }
		})
		return { ...instance, groups }
	})
	return { ...made, instances, needsDecisions: false }
}
