import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	findNamedRecords,
	uuidsNamedBy,
} from '@/v2019C1/extensions/reference/query/find/named-targets'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	GroupsAddingParams,
	LinkRetargetsParams,
	Retarget,
	RetargetLinks,
} from './reference-retargets.types'
import type { Config } from '@/v2019C1/config'
import type { DecisionGroup, ReportWarning } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * In a fork, each reference the report re-targets (its uuid attribute changed, see `visibleAttributes`) onto an element
 * the open document does not hold yet waits for the group adding that element (`dependsOn`); one onto an element the
 * update does not add keeps its target, and the report says so (`reference-retarget-unresolved`). Reads: the open
 * document's targets of the re-targeted uuids, one read per target tag, and the added elements' source records once.
 */
export async function linkRetargets(
	query: Core.Query<Config>,
	params: LinkRetargetsParams,
): Promise<RetargetLinks> {
	const none: RetargetLinks = { dependsOn: new Map(), warnings: [] }
	const groups = allGroups(params.report)
	const retargets = groups.flatMap(retargetsOf)
	if (retargets.length === 0) return none
	const named = retargets.flatMap((retarget) => retarget.named)
	const held = await findNamedRecords(query, { named })
	const pending = retargets.filter((retarget) => !held.has(retarget.uuid))
	if (pending.length === 0) return none
	const addedBy = await groupsAdding(params.sourceQuery, { groups })
	const dependsOn = new Map<string, string[]>()
	const warnings: ReportWarning[] = []
	for (const retarget of pending) {
		const adding = addedBy.get(retarget.uuid)
		if (adding === retarget.group.id) continue
		if (adding) {
			dependsOn.set(retarget.group.id, [...(dependsOn.get(retarget.group.id) ?? []), adding])
		} else if (retarget.reference) {
			// in the revision, but brought by nothing the update adds: it keeps what it names
			warnings.push({
				code: 'reference-retarget-unresolved',
				reference: retarget.reference,
				attribute: retarget.attribute,
				uuid: retarget.uuid,
			})
		}
	}
	return { dependsOn, warnings }
}

/** The references a group re-targets: each uuid attribute change of its nodes, with what that uuid may name. */
function retargetsOf(group: DecisionGroup): Retarget[] {
	return [group.primary, ...group.companions].flatMap((node) =>
		(node.attributeChanges ?? []).flatMap(function retargetOf(change): Retarget[] {
			if (!change.after) return []
			const named = uuidsNamedBy({
				tagName: node.tagName,
				attributes: [{ name: change.name, value: change.after }],
			})
			if (named.length === 0) return []
			const reference = node.instanceRef ?? node.sourceRef
			return [{ group, uuid: change.after, attribute: change.name, named, reference }]
		}),
	)
}

/** The group adding each element of the update, by its source uuid: its primary or a companion added. */
async function groupsAdding(
	sourceQuery: Core.Query<Config>,
	params: GroupsAddingParams,
): Promise<Map<string, string>> {
	const added = params.groups.flatMap((group) =>
		[group.primary, ...group.companions].flatMap((node) =>
			node.change === 'added' && node.sourceRef ? [{ groupId: group.id, ref: node.sourceRef }] : [],
		),
	)
	const records = await sourceQuery.any.getRecords(added.map(({ ref }) => ref))
	const byUuid = new Map<string, string>()
	for (const [position, record] of records.entries()) {
		const uuid = record ? readAttribute({ record, name: 'uuid', defaults: 'none' }) : ''
		const groupId = added[position]?.groupId
		if (uuid && groupId && !byUuid.has(uuid)) byUuid.set(uuid, groupId)
	}
	return byUuid
}
