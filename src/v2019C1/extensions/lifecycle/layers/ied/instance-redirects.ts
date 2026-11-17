import { toRef } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * What a template's elements stand for in an IED of the project updated from it: each element of the IED carrying a
 * source uuid as its lineage (under the scenario's key) is where a reference of the template to that uuid lands — a
 * connection of a template's access point names the project's. One read of the IED's tree.
 */
export async function readInstanceRedirects(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: { instance: AnyRefOrRecord; matchKey: MatchKey },
): Promise<RedirectMapping[]> {
	const tree = await reader.any.getTree(toRef(params.instance) as Scl.Ref<'IED'>)
	if (!tree) return []
	return flatten(tree).flatMap((node): RedirectMapping[] => {
		const sourceUuid = readAttribute({ record: node, name: params.matchKey, defaults: 'none' })
		return sourceUuid ? [{ sourceUuid, target: toRef(node) as Scl.Ref<Scl.ElementsOf> }] : []
	})
}

/** A tree's nodes, the root first. */
function flatten(node: AnyTreeRecord): AnyTreeRecord[] {
	return [node, ...node.tree.flatMap(flatten)]
}
