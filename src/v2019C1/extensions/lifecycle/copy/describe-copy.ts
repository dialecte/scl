import { listCopyRefusals } from './list-copy-refusals'
import { planCopyUnbinds } from './plan-copy-unbinds'
import { readCopyTrees } from './read-copy-trees'

import { judgeKeyTaken } from '@/v2019C1/extensions/lifecycle/constraints/judge-key-taken'
import { CROSS_CUTTING_SATELLITE_TAGS } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.constants'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance/composed-functions'
import { placedFunctionTag } from '@/v2019C1/extensions/lifecycle/layers/function/placed-function-tag'

import type { CopyDescription, DescribeCopyParams } from './copy.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { KeyTaken } from '@/v2019C1/extensions/lifecycle/constraints/judge-key-taken.types'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * What a copy's report tells besides what it places, read from what it copies (its trees read in one walk): the LNodes
 * it releases from their IED (`unbinds`, written by the apply as listed), the refusals its commit would raise
 * (`refusals`), and, by group id, the group of each root it places (the Function, or the Application and each Function
 * it composes) whose key a sibling where it lands holds already, with the values the engine numbers instead
 * (`keysTaken`, written by the apply as proposed).
 */
export async function describeCopy(
	query: Core.Query<Config>,
	params: DescribeCopyParams,
): Promise<CopyDescription> {
	const { target, report } = params
	const { sourceQuery, anchor } = target
	const rootRefs: Scl.Ref<Scl.ElementsOf>[] =
		target.verb === 'asd'
			? [target.ref, ...(await findComposedFunctionRefs(sourceQuery, target.ref))]
			: [target.ref]
	const rootIds = new Set(rootRefs.map((root) => root.id ?? ''))
	const satelliteRefs = listedSatellites({ report }).filter((ref) => !rootIds.has(ref.id ?? ''))
	const read = await readCopyTrees(sourceQuery, { refs: [...rootRefs, ...satelliteRefs] })
	// a satellite held inside a root is read with it
	const inRoots = new Set(read.filter((tree) => rootIds.has(tree.id)).flatMap(idsOf))
	const trees = read.filter((tree) => rootIds.has(tree.id) || !inRoots.has(tree.id))
	const unbinds = planCopyUnbinds({ trees: trees.filter((tree) => rootIds.has(tree.id)) })
	const refusals = await listCopyRefusals({ query, trees, unbinds, anchor })
	// judged in the order the apply places them — each function, then the application —, each told apart from those
	// placed before it, as `placeUniquely` numbers them in turn
	const groupOf = new Map(
		allGroups(report).flatMap((group) => {
			const sourceId = group.primary.sourceRef?.id
			return group.change === 'added' && sourceId && rootIds.has(sourceId)
				? [[sourceId, group.id] as const]
				: []
		}),
	)
	const keysTaken = new Map<string, KeyTaken>()
	const placedBefore: AnyTreeRecord[] = []
	for (const rootRef of [...rootRefs.slice(1), ...rootRefs.slice(0, 1)]) {
		const root = trees.find((tree) => tree.id === rootRef.id)
		const groupId = groupOf.get(rootRef.id ?? '')
		if (!root || !groupId) continue
		const { keyTaken } = await judgeKeyTaken(query, {
			parentRef: anchor,
			tagName: placedTagOf({ root, anchor }),
			candidate: attributesOf(root),
			placedBefore,
		})
		if (keyTaken) keysTaken.set(groupId, keyTaken)
		placedBefore.push(withValues({ record: root, values: keyTaken?.proposed ?? {} }))
	}
	return { unbinds, refusals, keysTaken }
}

/** The satellites the report lists added (variables, behaviours) outside the roots: what the copy places with them. */
function listedSatellites(params: { report: DiffReport }): Scl.Ref<Scl.ElementsOf>[] {
	const listed = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	function visit(node: DiffNode): void {
		const source = node.sourceRef
		if (node.change === 'added' && source?.id && CROSS_CUTTING_SATELLITE_TAGS.has(node.tagName)) {
			listed.set(source.id, { tagName: node.tagName, id: source.id } as Scl.Ref<Scl.ElementsOf>)
		}
		for (const child of node.children) visit(child)
	}
	for (const group of allGroups(params.report)) {
		for (const node of [group.primary, ...group.companions]) visit(node)
	}
	return [...listed.values()]
}

/** The record ids of a tree, its root included. */
function idsOf(node: AnyTreeRecord): string[] {
	return [node.id, ...node.tree.flatMap(idsOf)]
}

/** The tag a root is placed as under the anchor: a Function under a function is a SubFunction. */
function placedTagOf(params: {
	root: AnyTreeRecord
	anchor: Scl.Ref<Scl.ElementsOf>
}): Scl.ElementsOf {
	const { root, anchor } = params
	return root.tagName === 'Function' ? placedFunctionTag(anchor) : (root.tagName as Scl.ElementsOf)
}

/** A record's attributes by name. */
function attributesOf(record: AnyTreeRecord): Record<string, string | undefined> {
	return Object.fromEntries(record.attributes.map((attribute) => [attribute.name, attribute.value]))
}

/** A root as placed: its key's values the ones the engine proposes, told apart from the source it is read from. */
function withValues(params: {
	record: AnyTreeRecord
	values: Readonly<Record<string, string>>
}): AnyTreeRecord {
	const { record, values } = params
	return {
		...record,
		id: `${record.id}-placed`,
		attributes: record.attributes.map((attribute) =>
			attribute.name in values ? { ...attribute, value: values[attribute.name] } : attribute,
		),
	}
}
