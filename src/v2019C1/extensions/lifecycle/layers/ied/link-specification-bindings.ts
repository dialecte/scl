import { SPECIFICATION_BINDING_TAGS } from './link-specification-bindings.constants'

import { toRef } from '@dialecte/core/helpers'

import {
	addDependency,
	addedNodes,
} from '@/v2019C1/extensions/lifecycle/engine/link-placement-dependencies'
import { readAttribute } from '@/v2019C1/helpers'
import { LOGICAL_NODE_TAG_NAMES } from '@/v2019C1/hooks/before-commit/release-deleted-logical-nodes.constants'

import type {
	AddedNode,
	LinkSpecificationBindingsParams,
} from './link-specification-bindings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionGroup, DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * What the specification's groups of an IED update depend on among the IED's: a group adding an LNode bound to a
 * logical node the IED's update adds depends on the group adding it, so the LNode never names a logical node the
 * project lacks (accepting it with that group skipped is refused, `assertDecisionsCoherent`). The template's added
 * nodes are read at once.
 */
export async function linkSpecificationBindings(
	sourceQuery: Core.Query<Config>,
	params: LinkSpecificationBindingsParams,
): Promise<void> {
	const logicalNodes = addedOfTags({ groups: params.iedGroups, tags: LOGICAL_NODE_TAG_NAMES })
	const lnodes = addedOfTags({
		groups: params.specificationGroups,
		tags: SPECIFICATION_BINDING_TAGS,
	})
	if (logicalNodes.length === 0 || lnodes.length === 0) return

	const logicalNodeUuids = await readSourceAttribute(sourceQuery, {
		nodes: logicalNodes.map(({ node }) => node),
		name: 'uuid',
	})
	const adders = new Map(
		logicalNodes.map(({ group }, position) => [logicalNodeUuids[position], group]),
	)
	const bindings = await readSourceAttribute(sourceQuery, {
		nodes: lnodes.map(({ node }) => node),
		name: 'lnUuid',
	})
	for (const [position, { group }] of lnodes.entries()) {
		const adder = adders.get(bindings[position])
		if (adder && adder !== group) addDependency({ group, dependency: adder })
	}
}

/** The nodes of the given tags the groups add, each with the group adding it. */
function addedOfTags(params: {
	groups: readonly DecisionGroup[]
	tags: ReadonlySet<string>
}): AddedNode[] {
	return params.groups.flatMap(function addedByGroup(group) {
		return [...addedNodes(group)].flatMap((node) =>
			params.tags.has(node.tagName) && node.sourceRef ? [{ group, node }] : [],
		)
	})
}

/** An attribute of each node's template element, in order: empty when it has none. */
async function readSourceAttribute(
	sourceQuery: Core.Query<Config>,
	params: { nodes: readonly DiffNode[]; name: string },
): Promise<string[]> {
	const refs = params.nodes.map((node) => toRef(node.sourceRef) as Scl.Ref<Scl.ElementsOf>)
	const records = await sourceQuery.any.getRecords(refs)
	return records.map((record) =>
		record ? readAttribute({ record, name: params.name, defaults: 'none' }) : '',
	)
}
