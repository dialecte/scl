import { BAY_PATH_TAGS, DESCRIBED_TARGET_TAGS } from './integration-helpers.constants'

import { CUSTOM_RECORD_ID_ATTRIBUTE_NAME } from '@dialecte/core/helpers'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { CROSS_CUTTING_SATELLITE_CONTAINERS } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.constants'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { readAttribute } from '@/v2019C1/helpers'
import { treeEntriesOf } from '@/v2019C1/test/tree-entries'

import type {
	DescribedGroup,
	ForkInTurnParams,
	ReportAndApplyParams,
	ReportedAndApplied,
} from './integration-helpers.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/** What the attributes holding a record id end with: the one a test writes, the one an export adds. */
const RECORD_ID_SUFFIX = CUSTOM_RECORD_ID_ATTRIBUTE_NAME

/**
 * Report, then apply that report in one transaction, through the public two-track surface — what a consumer does. The
 * decisions are an empty map unless the case takes some (every group at its suggested action), or none at all.
 */
export async function reportAndApply(params: ReportAndApplyParams): Promise<ReportedAndApplied> {
	const { document, lifecycle, decide, withoutDecisions, mappings } = params
	const reported = await report(document.query, {
		...lifecycle,
		...(mappings ? { resolution: { mappings } } : {}),
	})
	const decisions = decide ? decide(reported) : new Map()
	// without decisions the consumer still passes the mapping choices it made
	const resolution = withoutDecisions
		? mappings
			? { mappings }
			: undefined
		: { decisions, mappings }
	const applied = await document.transaction(async function applyReport(tx) {
		return apply(tx, { ...lifecycle, report: reported, ...(resolution ? { resolution } : {}) })
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

/** The element of a tag carrying a name, in a document: an SSD's level as the consumer names it. */
export async function findByName<GenericTag extends Scl.ElementsOf>(
	query: Core.Query<Config>,
	params: { tagName: GenericTag; name: string },
): Promise<Scl.Ref<GenericTag>> {
	const { tagName, name } = params
	const [record] = await query.any.findByAttributes({ tagName, attributes: { name } })
	if (!record) throw new Error(`no ${tagName} named ${name}`)
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

/**
 * The element carrying a uuid in a document's record tree (`query.getSnapshot({ as: 'tree' })`), as a comparable
 * string: its tag, its attributes sorted, its children in order, whitespace and record ids left out — and an empty
 * `Private`, a wrapper that holds nothing (the removal of what it held leaves it behind). Undefined when no element
 * carries the uuid.
 */
export function canonicalElement(params: {
	tree: Core.AnyTreeRecord
	uuid: string
}): string | undefined {
	const { tree, uuid } = params
	const element = treeEntriesOf(tree).find(
		(candidate) =>
			readAttribute({ record: candidate.record, name: 'uuid', defaults: 'none' }) === uuid,
	)
	return element ? canonicalize(element.record) : undefined
}

function canonicalize(element: Core.AnyTreeRecord): string {
	const attributes = element.attributes
		.filter((attribute) => !attribute.name.endsWith(RECORD_ID_SUFFIX))
		.map((attribute) => `${attribute.name}="${attribute.value}"`)
		.sort()
	const children = element.tree
		.filter((child) => child.tagName !== 'Private' || child.tree.length > 0)
		.map((child) => canonicalize(child))
	const text = element.tree.length === 0 ? element.value.trim() : ''
	return `<${element.tagName} ${attributes.join(' ')}>${text}${children.join('')}</${element.tagName}>`
}

/** The attribute changes every group's primary lists, `<name>: <before> -> <after>`, sorted. */
export function listAttributeChanges(report: DiffReport): string[] {
	return allGroups(report)
		.flatMap((group) =>
			(group.primary.attributeChanges ?? []).map(
				(change) => `${change.name}: ${change.before ?? '-'} -> ${change.after ?? '-'}`,
			),
		)
		.sort()
}

/**
 * Every variable and behaviour description of a document, with the element holding it and what it applies to:
 * `<tag> <name> @<holder>: <what it applies to>`, sorted.
 */
export async function describeSatellites(query: Core.Query<Config>): Promise<string[]> {
	const described: string[] = []
	for (const tagName of CROSS_CUTTING_SATELLITE_CONTAINERS) {
		for (const satellite of await query.getRecordsByTagName(tagName)) {
			const name = await query.any.getAttribute(satellite, { name: 'name' })
			const [, holder] = await query.any.findAncestors(satellite)
			const holderName = holder ? await query.any.getAttribute(holder, { name: 'name' }) : undefined
			const targets: string[] = []
			const tree = await query.any.getTree(satellite)
			for (const reference of tree?.tree ?? []) {
				const { elementUuid, lnodeUuid } = await query.any.getAttributes(reference)
				const target = await describeElement({ query, uuid: elementUuid ?? lnodeUuid })
				targets.push(target)
			}
			described.push(`${tagName} ${name} @${holderName}: ${targets.sort().join(', ')}`)
		}
	}
	return described.sort()
}

/** An element named by its uuid, as the bay path of its names (a logical node by its class and instance). */
async function describeElement(params: {
	query: Core.Query<Config>
	uuid: string | undefined
}): Promise<string> {
	const { query, uuid } = params
	for (const tagName of DESCRIBED_TARGET_TAGS) {
		const [element] = await query.findByAttributes({ tagName, attributes: { uuid: uuid ?? '' } })
		if (!element) continue
		const { name, lnClass, lnInst } = await query.any.getAttributes(element)
		const names = [name ?? `${lnClass}${lnInst}`]
		for (const ancestor of await query.any.findAncestors(element)) {
			if (!BAY_PATH_TAGS.has(ancestor.tagName)) continue
			const ancestorName = await query.any.getAttribute(ancestor, { name: 'name' })
			names.unshift(ancestorName ?? '')
		}
		return names.join('/')
	}
	return `nothing (${uuid})`
}
