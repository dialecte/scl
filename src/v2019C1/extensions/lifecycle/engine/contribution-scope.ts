import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { readAttribute } from '@/v2019C1/helpers'
import { namesGroundedNode } from '@/v2019C1/helpers/grounded-node'

import type { ContributionScope, ReferenceOutsideScope } from './contribution-scope.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The scope of a placement in the source: the uuids of the elements below `roots` (the roots included) — the primaries
 * it places, or the instance's template — but those `leftOut` names (record ids) and what they hold. One read of each
 * root's tree.
 */
export async function resolveContributionScope(
	sourceQuery: Core.Query<Config>,
	params: { roots: readonly Scl.Ref<Scl.ElementsOf>[]; leftOut?: ReadonlySet<string> },
): Promise<ContributionScope> {
	const scope = new Set<string>()
	for (const root of params.roots) {
		const tree = await sourceQuery.any.getTree(root)
		if (tree) collectContributionScope({ node: tree, leftOut: params.leftOut, scope })
	}
	return scope
}

/** `resolveContributionScope` over a tree the caller read already: the uuids below it, but what `leftOut` names. */
export function collectContributionScope(params: {
	node: AnyTreeRecord
	leftOut: ReadonlySet<string> | undefined
	scope: Set<string>
}): void {
	const { node, leftOut, scope } = params
	if (leftOut?.has(node.id)) return
	const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
	if (uuid) scope.add(uuid)
	for (const child of node.tree) collectContributionScope({ node: child, leftOut, scope })
}

/**
 * The references below a source element the project shares that name an element outside `scope` (record ids): what a
 * placement neither lists nor writes into it — a reference naming what it does not place would name nothing in the
 * project, or what another placement placed. The subtrees of `omit` tags (what another pass places) are not walked.
 */
export async function findOutOfScopeReferences(
	sourceQuery: Core.Query<Config>,
	params: {
		root: Scl.Ref<Scl.ElementsOf>
		scope: ContributionScope
		omit?: readonly string[]
	},
): Promise<ReadonlySet<string>> {
	const { root, scope, omit } = params
	const outside = await findReferencesOutsideScope(sourceQuery, { root, scope, omit })
	return new Set(outside.map(idOfOutside))
}

/**
 * `findOutOfScopeReferences` with what each reference names: the attribute naming it and the path written. The
 * subtrees of what `leftOut` names (record ids) are not walked. One read of the root's tree.
 */
export async function findReferencesOutsideScope(
	query: Core.Query<Config>,
	params: {
		root: Scl.Ref<Scl.ElementsOf>
		scope: ContributionScope
		omit?: readonly string[]
		leftOut?: ReadonlySet<string>
	},
): Promise<ReferenceOutsideScope[]> {
	const { scope, omit, leftOut } = params
	const tree = await query.any.getTree(params.root)
	if (!tree) return []
	return collectReferencesOutsideScope({ tree, scope, omit, leftOut })
}

/** `findOutOfScopeReferences` over a tree the caller read already: the references below its root. */
export function collectOutOfScopeReferences(params: {
	tree: AnyTreeRecord
	scope: ContributionScope
	omit?: readonly string[]
}): Set<string> {
	return new Set(collectReferencesOutsideScope(params).map(idOfOutside))
}

/**
 * The references below a tree's root naming an element outside `scope`, each with the attribute naming it and the
 * path written: what a placement leaves out and tells of. The subtrees of `omit` tags, and of what `leftOut` names
 * (record ids), are not walked.
 */
export function collectReferencesOutsideScope(params: {
	tree: AnyTreeRecord
	scope: ContributionScope
	omit?: readonly string[]
	leftOut?: ReadonlySet<string>
}): ReferenceOutsideScope[] {
	const { tree, scope, omit, leftOut } = params
	const outside: ReferenceOutsideScope[] = []
	const pending: AnyTreeRecord[] = [...tree.tree]
	while (pending.length > 0) {
		const node = pending.pop() as AnyTreeRecord
		if (omit?.includes(node.tagName) || leftOut?.has(node.id)) continue
		pending.push(...node.tree)
		const named = findNamedOutsideScope({ reference: node, scope })
		if (named) outside.push({ reference: { tagName: node.tagName, id: node.id }, ...named })
	}
	return outside
}

/**
 * What a reference names outside the scope, if it does: by a uuid the scope does not hold, or, for a reference to a
 * connectivity node only, by a path only (`findUndeclaredNodeReference`). This reads imported sources: a reference
 * created in memory by its path alone keeps no uuid either.
 */
function findNamedOutsideScope(params: {
	reference: AnyTreeRecord
	scope: ContributionScope
}): Omit<ReferenceOutsideScope, 'reference'> | undefined {
	const { reference, scope } = params
	const pairs = UUID_REFERENCE_PAIRS[reference.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	for (const pair of pairs ?? []) {
		const uuid = readAttribute({ record: reference, name: pair.attribute.uuid, defaults: 'none' })
		const path = readAttribute({ record: reference, name: pair.attribute.path, defaults: 'none' })
		if (uuid && !scope.has(uuid))
			return path ? { attribute: pair.attribute.path, path } : { attribute: pair.attribute.uuid }
	}
	return findUndeclaredNodeReference({ reference })
}

/**
 * What a reference to a connectivity node only (a terminal, a neutral point) names when it is written by path only, with
 * no uuid: the import gives a reference the uuid of the element its path names, so such a path names nothing the
 * imported source holds — but the predefined `grounded` node, which no file declares. None for any other reference.
 */
export function findUndeclaredNodeReference(params: {
	reference: AnyTreeRecord
}): Omit<ReferenceOutsideScope, 'reference'> | undefined {
	const { reference } = params
	const pairs = UUID_REFERENCE_PAIRS[reference.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	for (const pair of pairs ?? []) {
		const targets = pair.target as readonly string[]
		if (!namesConnectivityNodeOnly(targets)) continue
		const uuid = readAttribute({ record: reference, name: pair.attribute.uuid, defaults: 'none' })
		const path = readAttribute({ record: reference, name: pair.attribute.path, defaults: 'none' })
		if (!uuid && path && !namesGroundedNode({ targets, path }))
			return { attribute: pair.attribute.path, path }
	}
	return undefined
}

/**
 * The references below a tree's root to a connectivity node written by path only (`findUndeclaredNodeReference`): what
 * a clone of the tree leaves out and tells of, wherever it is placed.
 */
export function collectUndeclaredNodeReferences(params: {
	tree: AnyTreeRecord
	/** Tags whose subtrees another pass reads: not walked. */
	omit?: readonly string[]
}): ReferenceOutsideScope[] {
	const { omit } = params
	const found: ReferenceOutsideScope[] = []
	const pending: AnyTreeRecord[] = [params.tree]
	while (pending.length > 0) {
		const node = pending.pop() as AnyTreeRecord
		if (omit?.includes(node.tagName)) continue
		pending.push(...node.tree)
		const named = findUndeclaredNodeReference({ reference: node })
		if (named) found.push({ reference: { tagName: node.tagName, id: node.id }, ...named })
	}
	return found
}

/** Whether a reference names a connectivity node only: a terminal or a neutral point. */
function namesConnectivityNodeOnly(targets: readonly string[]): boolean {
	return targets.length === 1 && targets[0] === 'ConnectivityNode'
}

/** The record id of a reference outside the scope. */
export function idOfOutside(outside: ReferenceOutsideScope): string {
	return outside.reference.id
}

/**
 * What a walk over a source element the project shares leaves out: what the caller leaves out already (`leftOut`), and
 * its references naming an element outside the placement's scope.
 */
export async function leaveOutOfScope(
	sourceQuery: Core.Query<Config>,
	params: {
		root: Scl.Ref<Scl.ElementsOf>
		scope: ContributionScope
		leftOut: ReadonlySet<string> | undefined
		omit?: readonly string[]
	},
): Promise<ReadonlySet<string>> {
	const outOfScope = await findOutOfScopeReferences(sourceQuery, params)
	if (!params.leftOut) return outOfScope
	return new Set([...params.leftOut, ...outOfScope])
}

/**
 * `leaveOutOfScope` with what it leaves out naming outside the scope, to be told of: what a comparison of a source element
 * the project shares neither lists nor writes (`notSelected`), and those references with what each names
 * (`referencesNotPlaced`).
 */
export async function leaveOutTellingOutOfScope(
	sourceQuery: Core.Query<Config>,
	params: {
		root: Scl.Ref<Scl.ElementsOf>
		scope: ContributionScope
		leftOut: ReadonlySet<string> | undefined
		omit?: readonly string[]
	},
): Promise<{ notSelected: ReadonlySet<string>; referencesNotPlaced: ReferenceOutsideScope[] }> {
	const referencesNotPlaced = await findReferencesOutsideScope(sourceQuery, params)
	const notSelected = new Set([...(params.leftOut ?? []), ...referencesNotPlaced.map(idOfOutside)])
	return { notSelected, referencesNotPlaced }
}

/**
 * What a report holds (an instance's comparison, a report instance) with `referencesNotPlaced` added to the references it
 * tells of already: none is dropped, whoever found it.
 */
export function withReferencesNotPlaced<
	Told extends { referencesNotPlaced?: ReferenceOutsideScope[] },
>(params: { told: Told; referencesNotPlaced: readonly ReferenceOutsideScope[] }): Told {
	const { told, referencesNotPlaced } = params
	if (referencesNotPlaced.length === 0) return told
	return {
		...told,
		referencesNotPlaced: [...(told.referencesNotPlaced ?? []), ...referencesNotPlaced],
	}
}

/**
 * What a comparison of a source tree with an instance leaves out, with the references to a connectivity node no file of
 * the template holds (`collectUndeclaredNodeReferences`): never added, whoever compares or writes — the report's diff
 * and the update's reconcile read the same set.
 */
export function leaveOutUndeclaredNodes(params: {
	tree: AnyTreeRecord
	notSelected: ReadonlySet<string> | undefined
	omit?: readonly string[]
}): { notSelected: ReadonlySet<string> | undefined; referencesNotPlaced: ReferenceOutsideScope[] } {
	const { tree, omit } = params
	const referencesNotPlaced = collectUndeclaredNodeReferences({ tree, omit })
	if (referencesNotPlaced.length === 0)
		return { notSelected: params.notSelected, referencesNotPlaced }
	return {
		notSelected: new Set([...(params.notSelected ?? []), ...referencesNotPlaced.map(idOfOutside)]),
		referencesNotPlaced,
	}
}
