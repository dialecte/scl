import { collectReportWarnings } from './report-warnings'

import { describe, expect, it } from 'vitest'

import type {
	DecisionGroup,
	DiffNode,
	DiffReport,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const PLACEHOLDER = 'placeholder-lineage'

function reference(params: { id: string; pairedByName?: string }): DiffNode {
	return {
		change: 'unchanged',
		tagName: 'FunctionRef',
		instanceRef: { tagName: 'FunctionRef', id: params.id },
		sourceRef: { tagName: 'FunctionRef', id: `${params.id}-source` },
		...(params.pairedByName ? { pairedByName: params.pairedByName } : {}),
		children: [],
	}
}

function container(children: DiffNode[]): DiffNode {
	return { change: 'modified', tagName: 'AllocationRole', children }
}

function group(params: { primary: DiffNode; companions: DiffNode[] }): DecisionGroup {
	return {
		id: 'group',
		change: 'modified',
		title: 'modified AllocationRole',
		primary: params.primary,
		companions: params.companions,
		dependsOn: [],
		suggestedAction: 'accept',
	}
}

function reportOf(instance: Pick<ReportInstance, 'tree' | 'groups'>): DiffReport {
	return {
		instances: [{ ...instance, title: 'instance', linked: true, upToDate: false, mappings: [] }],
		needsDecisions: true,
		summary: { added: 0, removed: 0, modified: 0, kept: 0 },
		mappings: [],
		templateInstances: [],
	}
}

describe('report warnings', () => {
	it('lists each reference paired by name once, wherever the report holds it', () => {
		const paired = reference({ id: 'in-tree', pairedByName: PLACEHOLDER })
		const report = reportOf({
			tree: container([paired, reference({ id: 'by-uuid' })]),
			groups: [
				group({
					primary: container([]),
					companions: [
						paired,
						container([reference({ id: 'in-companion', pairedByName: PLACEHOLDER })]),
					],
				}),
			],
		})

		const warnings = collectReportWarnings(report).map((warning) =>
			warning.code === 'reference-paired-by-name'
				? `${warning.code} ${warning.reference.id} ${warning.source?.id} ${warning.lineage}`
				: warning.code,
		)

		expect(warnings.sort()).toEqual([
			`reference-paired-by-name in-companion in-companion-source ${PLACEHOLDER}`,
			`reference-paired-by-name in-tree in-tree-source ${PLACEHOLDER}`,
		])
	})

	it('lists nothing when every reference paired by its uuids', () => {
		const report = reportOf({ tree: container([reference({ id: 'by-uuid' })]), groups: [] })

		expect(collectReportWarnings(report)).toEqual([])
	})
})
