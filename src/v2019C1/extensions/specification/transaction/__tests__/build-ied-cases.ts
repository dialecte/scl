import { sameClassInTargetIed } from '../../build/open-value-rules'
import { planIed } from '../../query/plan-ied'
import { buildIed } from '../build-ied'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type {
	BuildIedParams,
	BuildOpenPoint,
	BuildOpenValues,
	BuildRefusalReason,
	IedBuildPlan,
	IedBuildResult,
} from '../build-ied.types'
import type { SclTest } from '@/v2019C1/test'

/** What every build case states: the IED and the LNodes by their `dev:db-id`, and the options. */
export type BuildIedInput = SclTest.BaseXmlTestCase & {
	/** The target IED's id. Default `ied-s`. */
	ied?: string
	lnodes: string[]
	server?: string
	prefixFromLeafSubFunction?: boolean
	/** The caller's rules; `null` passes none. Default `{ lnType: sameClassInTargetIed }`. */
	openValues?: BuildOpenValues | null
}

/** A build that writes: how many elements it creates, the values rules gave, the LNodes it leaves out. */
export type BuildIedTestCase = BuildIedInput & {
	created: { lDevices: number; logicalNodes: number }
	openValuesUsed?: { point: BuildOpenPoint; element: string; value: string }[]
	leftOut?: { lnode: string; ied: string }[]
}

/** A build that is refused: every refusal, in order, each with the element it is about. */
export type BuildIedRefusalCase = BuildIedInput & {
	refusals: { reason: BuildRefusalReason; ref?: string }[]
}

/** The parameters a case builds with. */
export function buildParamsOf(testCase: BuildIedInput): BuildIedParams {
	return {
		ied: { tagName: 'IED', id: testCase.ied ?? 'ied-s' },
		lnodes: testCase.lnodes.map((id) => ({ tagName: 'LNode', id })),
		...(testCase.server && { server: { tagName: 'Server', id: testCase.server } }),
		...(testCase.prefixFromLeafSubFunction && { prefixFromLeafSubFunction: true }),
		...(testCase.openValues !== null && {
			openValues: testCase.openValues ?? { lnType: sameClassInTargetIed },
		}),
	}
}

/** Builds each case in a transaction: what it creates, the values the rules gave, the LNodes it leaves out. */
export function runBuildIedCases(params: { testCases: SclTest.TestCases<BuildIedTestCase> }): void {
	runSclTestCases.withExport<BuildIedTestCase>({
		testCases: params.testCases,
		act: async ({ source, testCase }) => {
			const built = source.transaction((tx) => buildIed(tx, buildParamsOf(testCase)))
			await expect(built.then(summaryOf)).resolves.toEqual({
				created: testCase.created,
				openValuesUsed: testCase.openValuesUsed ?? [],
				leftOut: testCase.leftOut ?? [],
			})
		},
	})
}

/**
 * Each refused case twice: the build throws `SPECIFICATION_BUILD_REFUSED` with every refusal and writes nothing, and the
 * plan lists the same refusals.
 */
export function runBuildIedRefusalCases(params: {
	testCases: SclTest.TestCases<BuildIedRefusalCase>
}): void {
	describe('buildIed throws them, writing nothing', () => {
		runSclTestCases.withExport<BuildIedRefusalCase>({
			testCases: params.testCases,
			act: async ({ source, testCase }) => {
				const written = source.transaction((tx) => buildIed(tx, buildParamsOf(testCase)))
				const refused = written.then(
					() => ({ key: 'nothing thrown' }),
					(error: unknown) => refusalSummaryOf(error),
				)
				await expect(refused).resolves.toEqual({
					key: 'SPECIFICATION_BUILD_REFUSED',
					reason: testCase.refusals[0]?.reason,
					refusals: testCase.refusals,
				})
			},
		})
	})
	describe('planIed lists them', () => {
		runSclTestCases.withoutExport<BuildIedRefusalCase>({
			testCases: params.testCases,
			act: async ({ source, testCase }) => {
				const plan = planIed(source.query, buildParamsOf(testCase))
				await expect(plan.then((planned) => planned.refusals.map(refusalOf))).resolves.toEqual(
					testCase.refusals,
				)
			},
		})
	})
}

/** The plan of each case equals the plan the build then writes. */
export function runPlanParityCases(params: { testCases: SclTest.TestCases<BuildIedInput> }): void {
	runSclTestCases.withoutExport<BuildIedInput>({
		testCases: params.testCases,
		act: async ({ source, testCase }) => {
			const planned = planIed(source.query, buildParamsOf(testCase))
			const planThenBuilt = planned.then(async function buildAfter(plan) {
				const built = await source.transaction((tx) => buildIed(tx, buildParamsOf(testCase)))
				return { plan, built: built.plan }
			})
			await expect(planThenBuilt).resolves.toSatisfy(function samePlan(pair: {
				plan: IedBuildPlan
				built: IedBuildPlan
			}) {
				return JSON.stringify(pair.plan) === JSON.stringify(pair.built)
			})
		},
	})
}

function refusalOf(refusal: IedBuildPlan['refusals'][number]): {
	reason: BuildRefusalReason
	ref?: string
} {
	return { reason: refusal.reason, ...(refusal.ref && { ref: refusal.ref.id }) }
}

function summaryOf(built: IedBuildResult): {
	created: { lDevices: number; logicalNodes: number }
	openValuesUsed: { point: BuildOpenPoint; element: string; value: string }[]
	leftOut: { lnode: string; ied: string }[]
} {
	return {
		created: {
			lDevices: built.created.lDevices.length,
			logicalNodes: built.created.logicalNodes.length,
		},
		openValuesUsed: built.plan.openValuesUsed.map((used) => ({
			...used,
			element: used.element.id ?? '',
		})),
		leftOut: built.plan.leftOut.map((entry) => ({ lnode: entry.lnode.id, ied: entry.ied.id })),
	}
}

function refusalSummaryOf(error: unknown): {
	key?: string
	reason?: string
	refusals?: { reason: BuildRefusalReason; ref?: string }[]
} {
	const refusal = toDialecteError(error)
	const meta = refusal?.meta as { reason?: string; refusals?: IedBuildPlan['refusals'] } | undefined
	return {
		key: refusal?.key ?? String(error),
		reason: meta?.reason,
		refusals: meta?.refusals?.map(refusalOf),
	}
}
