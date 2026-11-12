import { findFrameInstances } from './find-frame-instances'

import { toRef } from '@dialecte/core/helpers'

import { collectContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import {
	collectComposedFunctionUuids,
	findComposedFunctionRefs,
	findInstancesByTemplateUuid,
} from '@/v2019C1/extensions/lifecycle/instance'

import type { ScopePrimaries, TopologyReconcilables, UnitPlacement } from './scope-content.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The applications and the top-level functions whose structural ancestry includes `scopeRef` (Substation / VoltageLevel /
 * Bay), each in document order: one read of the scope, or none with its `tree` read already.
 */
export async function primariesUnderScope(
	query: Core.Query<Config>,
	params: { scopeRef: Scl.Ref<TopologyStructuralTag>; tree?: AnyTreeRecord },
): Promise<ScopePrimaries> {
	const tree = params.tree ?? (await query.any.getTree(params.scopeRef))
	if (!tree) return { applications: [], functions: [] }
	const primaries = collectPrimaries({ node: tree })
	return {
		applications: primaries.filter(function isApplication(primary) {
			return primary.tagName === 'Application'
		}) as Scl.Ref<'Application'>[],
		functions: primaries.filter(function isFunction(primary) {
			return primary.tagName === 'Function'
		}) as Scl.Ref<'Function'>[],
	}
}

/**
 * What a unit of a substation template places beyond its own subtree, and as a contribution scope: the functions its
 * applications compose wherever they sit — but those left out, whatever the applications composing them —, and the unit
 * with what it holds and those functions, but what is left out: what the references of what travels with it (a role, a
 * variable, a behaviour description) may name.
 */
export async function resolveUnitPlacement(
	query: Core.Query<Config>,
	params: {
		scopeRef: Scl.Ref<TopologyStructuralTag>
		/** The applications of the unit: a function one composes is placed as its own decision says, whatever the application's. */
		applicationRefs: readonly Scl.Ref<'Application'>[]
		/** What the placement leaves out (record ids). */
		leftOut?: ReadonlySet<string>
	},
): Promise<UnitPlacement> {
	const { scopeRef, applicationRefs, leftOut } = params
	const composedRefs: Scl.Ref<'Function'>[] = []
	for (const applicationRef of applicationRefs) {
		const composed = await findComposedFunctionRefs(query, applicationRef)
		composedRefs.push(
			...composed.filter(function isPlaced(functionRef) {
				return !leftOut?.has(functionRef.id)
			}),
		)
	}
	// each tree read once: the scope, and what the functions placed hold
	const scope = new Set<string>()
	const functionContentIds = new Set<string>()
	const functionTrees = new Map<string, AnyTreeRecord>()
	for (const root of [scopeRef, ...composedRefs]) {
		const tree = await query.any.getTree(root)
		if (!tree) continue
		collectContributionScope({ node: tree, leftOut, scope })
		if (root === scopeRef) collectFunctionTrees({ node: tree, leftOut, trees: functionTrees })
		else functionTrees.set(tree.id, tree)
	}
	for (const tree of functionTrees.values()) collectIds({ node: tree, ids: functionContentIds })
	return { scope, composedRefs, functionContentIds, functionTrees: [...functionTrees.values()] }
}

/** The functions below a node, by record id: but a function left out. */
function collectFunctionTrees(params: {
	node: AnyTreeRecord
	leftOut: ReadonlySet<string> | undefined
	trees: Map<string, AnyTreeRecord>
}): void {
	const { node, leftOut, trees } = params
	for (const child of node.tree) {
		if (child.tagName !== 'Function') collectFunctionTrees({ ...params, node: child })
		else if (!leftOut?.has(child.id)) trees.set(child.id, child)
	}
}

/** The record ids of a tree. */
function collectIds(params: { node: AnyTreeRecord; ids: Set<string> }): void {
	const { node, ids } = params
	ids.add(node.id)
	for (const child of node.tree) collectIds({ node: child, ids })
}

/** The applications and functions below a node, in document order: what one of them holds is not walked. */
function collectPrimaries(params: { node: AnyTreeRecord }): Scl.Ref<Scl.ElementsOf>[] {
	return params.node.tree.flatMap(function below(child): Scl.Ref<Scl.ElementsOf>[] {
		if (child.tagName === 'Application' || child.tagName === 'Function')
			return [toRef(child) as Scl.Ref<Scl.ElementsOf>]
		return collectPrimaries({ node: child })
	})
}

/**
 * The reconcilable primaries of a topology scope: its Applications, and the Functions NOT
 * composed by any of them (a composed Function is reconciled through its Application's cascade).
 * Shared by `report.ssd` and `update.ssd` so both walk the same primary set.
 */
export async function resolveTopologyReconcilables(
	query: Core.Query<Config>,
	params: {
		scopeRef: Scl.Ref<TopologyStructuralTag>
		/** What the scope leaves out (record ids): its applications and functions are not the scope's. */
		leftOut: ReadonlySet<string>
	},
): Promise<TopologyReconcilables> {
	const { scopeRef, leftOut } = params
	const primaries = await primariesUnderScope(query, { scopeRef })
	const applications = primaries.applications.filter((application) => !leftOut.has(application.id))

	const composedUuids = new Set<string>()
	for (const application of applications) {
		for (const uuid of await collectComposedFunctionUuids(query, application)) {
			composedUuids.add(uuid)
		}
	}

	const standaloneFunctions: Scl.Ref<'Function'>[] = []
	for (const functionRef of primaries.functions) {
		if (leftOut.has(functionRef.id)) continue
		const { uuid } = await query.getAttributes(functionRef)
		if (uuid && composedUuids.has(uuid)) continue
		standaloneFunctions.push(functionRef)
	}

	return { applications, standaloneFunctions }
}

/**
 * Whether the project already holds an instance of a topology scope (by lineage): a level an earlier
 * placement put the scope on, or an instance of any primary of the scope. With none, reconciling the
 * scope is a first placement, whatever operation was asked for — a scope holding no primary (levels
 * and equipment only) is found by its level.
 */
export async function hasScopeInstance(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		/** The unit of the template: the first named level. */
		scopeRef: Scl.Ref<TopologyStructuralTag>
		applicationRefs: readonly Scl.Ref<'Application'>[]
		standaloneFunctions: readonly Scl.Ref<'Function'>[]
		matchKey: MatchKey
		/** What the scope leaves out (record ids): no evidence of an instance. */
		leftOut?: ReadonlySet<string>
	},
): Promise<boolean> {
	const { sourceQuery, scopeRef, applicationRefs, standaloneFunctions, matchKey, leftOut } = params

	const frameInstances = await findFrameInstances(reader, {
		sourceQuery,
		scopeRef,
		matchKey,
		leftOut,
	})
	if (frameInstances.length > 0) return true

	for (const primaryRef of [...applicationRefs, ...standaloneFunctions]) {
		const { uuid } = await sourceQuery.any.getAttributes(primaryRef)
		if (!uuid) continue
		const instances = await findInstancesByTemplateUuid(reader, {
			tagName: primaryRef.tagName,
			sourceUuid: uuid,
			matchKey,
		})
		if (instances.length > 0) return true
	}
	return false
}
