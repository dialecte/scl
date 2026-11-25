import { ref } from './copy-helpers'

import type { PromisedLanding } from './copy-placement-helpers.types'
import type { Scl } from '@/v2019C1/config'
import type { Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { CommitRefusal } from '@/v2019C1/hooks/before-commit/commit-plan.types'

/** The consumer chose where the functions of B3 land. */
export function b3LandsOn(existing: Scl.Ref<Scl.ElementsOf>): Resolution {
	return { mappings: new Map([['b3', { existing }]]) }
}

/** Each level row of the report, read for a person: source level, landing, why, after which row, the candidates. */
export function describeLevelRows(report: DiffReport): string[] {
	return report.instances
		.flatMap((instance) => instance.mappings)
		.filter((mapping) => mapping.kind === 'level')
		.map(function describeRow(mapping) {
			const landing =
				mapping.mapping && 'existing' in mapping.mapping ? mapping.mapping.existing.id : '?'
			const after = mapping.dependsOn ? ` after ${mapping.dependsOn}` : ''
			const candidates = mapping.candidates.map((candidate) => candidate.ref.id).join(' ')
			return `${mapping.tagName} ${mapping.id} → ${landing} (${mapping.reason})${after} [${candidates}]`
		})
}

/** Each key taken the report tells, on the group of the root it places, read for a person. */
export function describeKeysTaken(report: DiffReport): string[] {
	return report.instances
		.flatMap((instance) => instance.groups)
		.flatMap(function describeGroup(group) {
			const taken = group.keyTaken
			if (!taken) return []
			return [
				`${group.primary.tagName} ${taken.constraint} ${describeValues(taken.values)} taken by ${taken.takenBy.tagName} ${taken.takenBy.id} → ${describeValues(taken.proposed)}`,
			]
		})
		.sort()
}

/** The values of a key, field by field. */
export function describeValues(values: Readonly<Record<string, string>>): string {
	return Object.entries(values)
		.map(([field, value]) => `${field}=${value}`)
		.join(' ')
}

/**
 * Where the report says each added Function lands: the element of the project the row of its source level maps onto,
 * else the anchor; under the name its key taken proposes, else its own.
 */
export async function promisedLandings(params: {
	report: DiffReport
	document: Scl.Document
	anchor: Scl.Ref<Scl.ElementsOf>
}): Promise<PromisedLanding[]> {
	const { report, document, anchor } = params
	const rows = new Map(
		report.instances
			.flatMap((instance) => instance.mappings)
			.flatMap((mapping) =>
				mapping.kind === 'level' && mapping.mapping && 'existing' in mapping.mapping
					? [[mapping.id, mapping.mapping.existing] as const]
					: [],
			),
	)
	const added = report.instances
		.flatMap((instance) => instance.groups)
		.filter(function isAddedFunction(group) {
			return (
				group.primary.tagName === 'Function' &&
				group.change === 'added' &&
				Boolean(group.primary.sourceRef?.id)
			)
		})
	const sources = await document.query.getRecords(
		added.map((group) => ref('Function', group.primary.sourceRef?.id ?? '')),
	)
	return added.map(function promisedOf(group, index) {
		const source = sources[index]
		const parent = (source?.parent?.id ? rows.get(source.parent.id) : undefined) ?? anchor
		const ownName = source?.attributes.find((attribute) => attribute.name === 'name')?.value
		return { parent, name: group.keyTaken?.proposed.name ?? String(ownName) }
	})
}

/** The promised functions the apply did not write where the report said: `<parent id>/<name>` of each. */
export async function notLandedAsPromised(params: {
	document: Scl.Document
	promised: readonly PromisedLanding[]
}): Promise<string[]> {
	const { promised } = params
	const childrenOf = await params.document.query.any.getChildrenOfEach(
		promised.map(({ parent }) => parent),
		{ tagName: 'Function' },
	)
	return promised.flatMap(function missingOf({ parent, name }, index) {
		const written = (childrenOf[index] ?? []).some(function isNamed(child) {
			return child.attributes.some(({ name: field, value }) => field === 'name' && value === name)
		})
		return written ? [] : [`${parent.id}/${name}`]
	})
}

/** A refusal of the commit as the cases compare it: its code, reason, the element by tag and id, its uuid attribute. */
export function describeRefusalsBySource(refusals: readonly CommitRefusal[]): string[] {
	return refusals
		.map(function describeRefusal(refusal) {
			if (refusal.key !== 'REFERENCE_INCOHERENT') return `${refusal.key}`
			const { reason, reference, uuidAttribute } = refusal.meta
			return `${refusal.code} ${reason} ${reference.tagName}#${reference.id} ${uuidAttribute}`
		})
		.sort()
}
