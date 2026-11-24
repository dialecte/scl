import { sameClassInTargetIed } from '../../build/open-value-rules'
import { buildIed } from '../build-ied'

import { expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { IedRebuildReport, LnIdentity } from '../../query/plan-rebuild.types'
import type { IedBuildResult } from '../build-ied.types'
import type { SclTest } from '@/v2019C1/test'

/** A rebuild report with every element named by its `dev:db-id`. */
export type RebuildReportIds = {
	added: { lDevices: string[]; logicalNodes: string[] }
	moved: { ln: string; fromLd: string; toLd: string }[]
	renamed: { ln: string; from: LnIdentity; to: LnIdentity }[]
	retyped: { ln: string; from: string; to: string; valuesRemoved: string[] }[]
	removed: { logicalNodes: string[]; lDevices: string[] }
	keptInUse: { ln: string; usedBy: string[] }[]
	boundOutsideScope: { ln: string; lnode: string }[]
	orphanLDevices: { lDevice: string; orphans: string[] }[]
	drift: { lnode: string; ln: string }[]
	values: { added: number; changed: number }
}

/** A rebuild of S from the LNodes given: what the report lists (any part left out is expected empty). */
export type RebuildTestCase = SclTest.BaseXmlTestCase & {
	lnodes: string[]
	rederiveLDevices?: boolean
	report: Partial<RebuildReportIds>
}

/** The LNodes the rebuild fixtures' role holds after the first build. */
export const ROLE_LNODES = ['lln0', 'ptoc1', 'ptrc1', 'cswi1']

const NOTHING: RebuildReportIds = {
	added: { lDevices: [], logicalNodes: [] },
	moved: [],
	renamed: [],
	retyped: [],
	removed: { logicalNodes: [], lDevices: [] },
	keptInUse: [],
	boundOutsideScope: [],
	orphanLDevices: [],
	drift: [],
	values: { added: 0, changed: 0 },
}

/** Rebuilds S in a transaction and checks its report; the document by its queries. */
export function runRebuildCases(params: { testCases: SclTest.TestCases<RebuildTestCase> }): void {
	runSclTestCases.withExport<RebuildTestCase>({
		testCases: params.testCases,
		act: async ({ source, testCase }) => {
			const built = source.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: testCase.lnodes.map((id) => ({ tagName: 'LNode', id })),
					openValues: { lnType: sameClassInTargetIed },
					...(testCase.rederiveLDevices && { rederiveLDevices: true }),
				}),
			)
			await expect(built.then(reportIdsOf)).resolves.toEqual({ ...NOTHING, ...testCase.report })
		},
	})
}

function idOf(ref: { id?: string }): string {
	return ref.id ?? ''
}

function reportIdsOf(built: IedBuildResult): RebuildReportIds {
	const report: IedRebuildReport = built.plan.rebuild
	return {
		added: {
			lDevices: report.added.lDevices,
			logicalNodes: report.added.logicalNodes.map(idOf),
		},
		moved: report.moved.map((entry) => ({ ...entry, ln: idOf(entry.ln) })),
		renamed: report.renamed.map((entry) => ({ ...entry, ln: idOf(entry.ln) })),
		retyped: report.retyped.map((entry) => ({
			...entry,
			ln: idOf(entry.ln),
			valuesRemoved: entry.valuesRemoved.map(idOf),
		})),
		removed: {
			logicalNodes: report.removed.logicalNodes.map(idOf),
			lDevices: report.removed.lDevices.map(idOf),
		},
		keptInUse: report.keptInUse.map((entry) => ({
			ln: idOf(entry.ln),
			usedBy: entry.usedBy.map(idOf),
		})),
		boundOutsideScope: report.boundOutsideScope.map((entry) => ({
			ln: idOf(entry.ln),
			lnode: idOf(entry.lnode),
		})),
		orphanLDevices: report.orphanLDevices.map((entry) => ({
			lDevice: idOf(entry.lDevice),
			orphans: entry.orphans.map(idOf),
		})),
		drift: report.drift.map((entry) => ({ lnode: idOf(entry.lnode), ln: idOf(entry.ln) })),
		values: report.values,
	}
}
