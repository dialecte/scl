import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The `uuid`s of every Function an Application composes — collected from the
 * `functionUuid` of each `FunctionRef` in the Application subtree. Shared by the
 * `update.fromAsd` apply cascade and the `reportAsd` report cascade so both walk
 * the composed-function set identically.
 */
export async function collectComposedFunctionUuids(
	sourceQuery: Core.Query<Config>,
	applicationRef: Scl.Ref<'Application'>,
): Promise<Set<string>> {
	const out = new Set<string>()
	const applicationTree = await sourceQuery.any.getTree(applicationRef)
	if (applicationTree) await walk(sourceQuery, applicationTree, out)
	return out
}

async function walk(
	sourceQuery: Core.Query<Config>,
	node: AnyTreeRecord,
	out: Set<string>,
): Promise<void> {
	if (node.tagName === 'FunctionRef') {
		const functionUuid = await sourceQuery.any.getAttribute(node, { name: 'functionUuid' })
		if (functionUuid) out.add(functionUuid)
	}
	for (const child of node.tree) await walk(sourceQuery, child, out)
}
