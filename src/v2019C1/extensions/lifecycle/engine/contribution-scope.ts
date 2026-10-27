import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { readAttribute } from '@/v2019C1/helpers'

import type { ContributionScope } from './contribution-scope.types'
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
		if (tree) collectScope({ node: tree, leftOut: params.leftOut, scope })
	}
	return scope
}

function collectScope(params: {
	node: AnyTreeRecord
	leftOut: ReadonlySet<string> | undefined
	scope: Set<string>
}): void {
	const { node, leftOut, scope } = params
	if (leftOut?.has(node.id)) return
	const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
	if (uuid) scope.add(uuid)
	for (const child of node.tree) collectScope({ node: child, leftOut, scope })
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
	const { scope, omit } = params
	const outOfScope = new Set<string>()
	const tree = await sourceQuery.any.getTree(params.root)
	if (!tree) return outOfScope
	const pending: AnyTreeRecord[] = [...tree.tree]
	while (pending.length > 0) {
		const node = pending.pop() as AnyTreeRecord
		if (omit?.includes(node.tagName)) continue
		pending.push(...node.tree)
		if (namesOutsideScope({ reference: node, scope })) outOfScope.add(node.id)
	}
	return outOfScope
}

/** Whether a reference names, by uuid, an element outside the scope. */
function namesOutsideScope(params: {
	reference: AnyTreeRecord
	scope: ContributionScope
}): boolean {
	const { reference, scope } = params
	const pairs = UUID_REFERENCE_PAIRS[reference.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return false
	return pairs.some((pair) => {
		const uuid = readAttribute({ record: reference, name: pair.attribute.uuid, defaults: 'none' })
		return Boolean(uuid) && !scope.has(uuid)
	})
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
