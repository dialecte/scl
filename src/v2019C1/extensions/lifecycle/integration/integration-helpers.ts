import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'

import type {
	DescribedGroup,
	ForkInTurnParams,
	ReportAndApplyParams,
	ReportedAndApplied,
} from './integration-helpers.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Report, then apply that report in one transaction, through the public two-track surface — what a consumer does. The
 * decisions are an empty map unless the case takes some (every group at its suggested action), or none at all.
 */
export async function reportAndApply(params: ReportAndApplyParams): Promise<ReportedAndApplied> {
	const { document, lifecycle, decide, withoutDecisions } = params
	const reported = await report(document.query, lifecycle)
	const decisions = decide ? decide(reported) : new Map()
	const applied = await document.transaction(async function applyReport(tx) {
		return apply(tx, {
			...lifecycle,
			report: reported,
			...(withoutDecisions ? {} : { resolution: { decisions } }),
		})
	})
	return { report: reported, applied }
}

/** Fork the same revision several times in a row, each turn reported then applied: what each turn gave, in order. */
export async function forkInTurn(params: ForkInTurnParams): Promise<ReportedAndApplied[]> {
	const { turns, ...reportAndApplyParams } = params
	const results: ReportedAndApplied[] = []
	for (let turn = 0; turn < turns; turn++) {
		const result = await reportAndApply(reportAndApplyParams)
		results.push(result)
	}
	return results
}

/**
 * The record of a tag carrying a uuid, in a document: the way a test names an element of a file whose record ids it
 * did not choose.
 */
export async function findByUuid<GenericTag extends Scl.ElementsOf>(
	query: Core.Query<Config>,
	params: { tagName: GenericTag; uuid: string },
): Promise<Scl.Ref<GenericTag>> {
	const { tagName, uuid } = params
	const [record] = await query.any.findByAttributes({ tagName, attributes: { uuid } })
	if (!record) throw new Error(`no ${tagName} with uuid ${uuid}`)
	return { tagName, id: record.id } as Scl.Ref<GenericTag>
}

/**
 * Every group of a report as a snapshot reads it: its change, its primary's tag and uuid (else its name), the
 * attribute changes, and the companions the same way. Record ids are left out and the groups sorted by what they name:
 * the ids of a file imported without them, and the order of its instances, differ run to run.
 */
export async function describeGroups(params: {
	report: DiffReport
	sourceQuery: Core.Query<Config>
	targetQuery: Core.Query<Config>
}): Promise<DescribedGroup[]> {
	const { report: described, sourceQuery, targetQuery } = params
	const groups: DescribedGroup[] = []
	for (const group of allGroups(described)) {
		const companions: string[] = []
		for (const companion of group.companions) {
			const element = await describeNode({ node: companion, sourceQuery, targetQuery })
			companions.push(`${companion.change} ${companion.tagName} ${element ?? ''}`.trim())
		}
		const element = await describeNode({ node: group.primary, sourceQuery, targetQuery })
		groups.push({
			change: group.change,
			tagName: group.primary.tagName,
			element,
			...(group.primary.attributeChanges
				? {
						attributeChanges: group.primary.attributeChanges.map(
							(change) => `${change.name}: ${change.before ?? '-'} -> ${change.after ?? '-'}`,
						),
					}
				: {}),
			companions: companions.sort(),
		})
	}
	return groups.sort((left, right) => describedKey(left).localeCompare(describedKey(right)))
}

function describedKey(group: DescribedGroup): string {
	return `${group.tagName} ${group.element ?? ''} ${group.change}`
}

/** The uuid of the element a node names, else its name: read on the project for an element it holds. */
async function describeNode(params: {
	node: DiffNode
	sourceQuery: Core.Query<Config>
	targetQuery: Core.Query<Config>
}): Promise<string | undefined> {
	const { node, sourceQuery, targetQuery } = params
	const [query, ref] = node.instanceRef
		? [targetQuery, node.instanceRef]
		: [sourceQuery, node.sourceRef]
	if (!ref) return undefined
	const { uuid, name } = await query.any.getAttributes(ref)
	return uuid ?? name
}

/** The groups of a report as `<change> <tag>` of their primary, sorted: what a case expects of a report. */
export function listGroups(report: DiffReport): string[] {
	return allGroups(report)
		.map((group) => `${group.change} ${group.primary.tagName}`)
		.sort()
}

/** The companions of every group of a report as `<change> <tag>`, sorted. */
export function listCompanions(report: DiffReport): string[] {
	return allGroups(report)
		.flatMap((group) => group.companions.map((node) => `${node.change} ${node.tagName}`))
		.sort()
}
