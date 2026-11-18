import { collectReportWarnings } from './report-warnings'

import { describe, expect, it } from 'vitest'

import type {
	DecisionGroup,
	DiffNode,
	DiffReport,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const PLACEHOLDER = 'placeholder-lineage'

function reference(params: {
	id: string
	pairedByName?: string
	pairedAmongTwins?: true
}): DiffNode {
	return {
		change: 'unchanged',
		tagName: 'FunctionRef',
		instanceRef: { tagName: 'FunctionRef', id: params.id },
		sourceRef: { tagName: 'FunctionRef', id: `${params.id}-source` },
		...(params.pairedByName ? { pairedByName: params.pairedByName } : {}),
		...(params.pairedAmongTwins ? { pairedAmongTwins: params.pairedAmongTwins } : {}),
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

	it('lists each reference paired among identical ones once, wherever the report holds it', () => {
		const first = reference({ id: 'twin-1', pairedAmongTwins: true })
		const report = reportOf({
			tree: container([first, reference({ id: 'twin-2', pairedAmongTwins: true })]),
			groups: [group({ primary: container([]), companions: [first] })],
		})

		const warnings = collectReportWarnings(report).map((warning) =>
			warning.code === 'identical-references-paired-in-order'
				? `${warning.code} ${warning.reference.id} ${warning.source?.id}`
				: warning.code,
		)

		expect(warnings.sort()).toEqual([
			'identical-references-paired-in-order twin-1 twin-1-source',
			'identical-references-paired-in-order twin-2 twin-2-source',
		])
	})

	it('lists an element that is no reference, paired among identical ones, under the code for elements', () => {
		const label: DiffNode = {
			change: 'unchanged',
			tagName: 'Label',
			instanceRef: { tagName: 'Label', id: 'label-1' },
			sourceRef: { tagName: 'Label', id: 'label-1-source' },
			pairedAmongTwins: true,
			children: [],
		}
		const report = reportOf({ tree: container([label]), groups: [] })

		const warnings = collectReportWarnings(report).map(
			(warning) => `${warning.code} ${'reference' in warning ? warning.reference.id : ''}`,
		)

		expect(warnings).toEqual(['identical-elements-paired-in-order label-1'])
	})

	it('lists an element paired by its key once, with the key', () => {
		const device: DiffNode = {
			change: 'unchanged',
			tagName: 'LDevice',
			instanceRef: { tagName: 'LDevice', id: 'device' },
			sourceRef: { tagName: 'LDevice', id: 'device-source' },
			pairedByKey: 'inst=LD1',
			children: [],
		}
		const report = reportOf({
			tree: container([device]),
			groups: [group({ primary: container([]), companions: [device] })],
		})

		const warnings = collectReportWarnings(report).map((warning) =>
			warning.code === 'element-paired-by-key'
				? `${warning.code} ${warning.reference.id} ${warning.source?.id} ${warning.key}`
				: warning.code,
		)

		expect(warnings).toEqual(['element-paired-by-key device device-source inst=LD1'])
	})

	it('lists nothing when every reference paired by its uuids', () => {
		const report = reportOf({ tree: container([reference({ id: 'by-uuid' })]), groups: [] })

		expect(collectReportWarnings(report)).toEqual([])
	})
})
