import { SPECIFICATION_PRIMARY_TAGS } from './resolve-specification-instance.constants'

import { toRef } from '@dialecte/core/helpers'

import { SPECIFIED_IED_NAME_ATTRIBUTE } from '@/v2019C1/constants/lnode-spec-naming'
import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { readProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	ClaimUnboundParams,
	ResolveSpecificationInstanceParams,
	SpecificationInstance,
	SectionNodeParams,
	SpecifiedLNode,
	SpecifiedLNodesParams,
	UnbindingIdsParams,
	UnboundPrimaries,
} from './resolve-specification-instance.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The specification of an IED in the project: what a placement of its template ISD specified on it, told by the
 * specified naming of its LNodes (`LNodeSpecNaming`), which keeps the IED an LNode was placed for when the project binds
 * it elsewhere, not by lineage alone (the template may be placed twice, both specifications on one bay) nor by today's
 * bindings (an LNode of another file the project bound to the IED is no part of it). The applications and functions
 * holding those LNodes are its primaries, the levels of the template unit's kind above them its frames. A primary of the
 * template holding no LNode of it is the IED's when the IED's level holds one instance of it specified on no IED;
 * with several, it is `unresolved`; with only another placement's, left alone. `undefined` when the project holds no
 * specification of the IED. The process section is read once.
 */
export async function resolveSpecificationInstance(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: ResolveSpecificationInstanceParams,
): Promise<SpecificationInstance | undefined> {
	const { sourceQuery, iedRef, scope, reconcilables } = params
	const iedName = await reader.any.getAttribute(iedRef, { name: 'name' })
	const section = await readProcessSection(reader)
	const specified = specifiedLNodes({ section })
	const own = specified.filter((lnode) => lnode.on === iedName).map((lnode) => lnode.node)

	const unitTag = scope.root.tagName
	const frames = uniqueRecords(
		own.flatMap(function frameOf(node) {
			const level = node.ancestry.find((ancestor) => ancestor.tagName === unitTag)
			return level ? [level] : []
		}),
	)
	const claimed = uniqueRecords(own.flatMap((node) => primaryOf({ node })))
	if (frames.length === 0 && claimed.length === 0) return undefined

	// a primary holding an LNode specified on another IED is that IED's specification
	const othersPrimaryIds = new Set(
		specified
			.filter((lnode) => lnode.on !== iedName)
			.flatMap((lnode) => primaryOf({ node: lnode.node }).map((primary) => primary.id)),
	)
	const unbound = await claimUnbound({
		sourceQuery,
		nodes: section.nodes,
		templatePrimaries: [...reconcilables.applications, ...reconcilables.standaloneFunctions],
		claimed,
		othersPrimaryIds,
		frameIds: new Set(frames.map((frame) => frame.id)),
	})
	return {
		frames: frames.map(function refOf(frame) {
			return toRef(frame) as Scl.Ref<Scl.ElementsOf>
		}),
		lnodes: new Set(own.map((node) => node.record.id)),
		primaries: [...claimed, ...unbound.claimed].map(function refOf(record) {
			return toRef(record) as Scl.Ref<Scl.ElementsOf>
		}),
		unresolved: unbound.unresolved,
		leftOut: new Set(
			[...unbound.unresolved, ...unbound.others].flatMap((primary) =>
				primary.id ? [primary.id] : [],
			),
		),
		unbinding: unbindingIds({ own, iedName, unitTag }),
	}
}

/** The LNodes of the section specified on an IED, each with the IED its specified naming names. */
function specifiedLNodes(params: SpecifiedLNodesParams): SpecifiedLNode[] {
	const { section } = params
	return section.nodes.flatMap(function specifiedOf(node): SpecifiedLNode[] {
		if (node.record.tagName !== 'LNodeSpecNaming') return []
		const holder = node.ancestry.findLast((ancestor) => ancestor.tagName === 'LNode')
		const lnode = holder && section.lnodes.get(holder.id)
		const on = readAttribute({
			record: node.record,
			name: SPECIFIED_IED_NAME_ATTRIBUTE,
			defaults: 'none',
		})
		if (!lnode || !isAssignedToIed({ iedName: on })) return []
		return [{ node: lnode, on }]
	})
}

/** The application or function a section node sits in, outermost: the primary it belongs to. */
function primaryOf(params: SectionNodeParams): AnyRawRecord[] {
	const primary = params.node.ancestry.find((ancestor) =>
		SPECIFICATION_PRIMARY_TAGS.has(ancestor.tagName),
	)
	return primary ? [primary] : []
}

/**
 * What a removal of takes away a binding the project gave another IED: each LNode of the specification bound to an IED
 * other than the one it is specified on, and what holds it below the level of the unit's kind.
 */
function unbindingIds(params: UnbindingIdsParams): ReadonlySet<string> {
	const { iedName, unitTag } = params
	return new Set(
		params.own.flatMap(function unbindingOf(node) {
			const boundTo = readAttribute({ record: node.record, name: 'iedName', defaults: 'none' })
			if (!isAssignedToIed({ iedName: boundTo }) || boundTo === iedName) return []
			const level = node.ancestry.findIndex((ancestor) => ancestor.tagName === unitTag)
			// on no level of the unit's kind, what holds it is told by its primary only
			const holders =
				level < 0
					? primaryOf({ node }).map((primary) => primary.id)
					: node.ancestry.slice(level + 1).map((ancestor) => ancestor.id)
			return [node.record.id, ...holders]
		}),
	)
}

/**
 * The template's primaries no LNode of the IED told: each claimed when the IED's level holds one instance of it
 * specified on no IED, `unresolved` when it holds several, `others` when it holds only another placement's (specified on
 * another IED) or when the specification sits on no such level (nowhere to place it), nothing when it holds none (the
 * revision gained it, or the IED's specification lost it).
 */
async function claimUnbound(params: ClaimUnboundParams): Promise<UnboundPrimaries> {
	const { sourceQuery, nodes, templatePrimaries, othersPrimaryIds, frameIds } = params
	const claimedLineages = new Set(params.claimed.map(lineageOf))
	const records = await sourceQuery.any.getRecords([...templatePrimaries])
	const result: UnboundPrimaries = { claimed: [], unresolved: [], others: [] }
	for (const [position, record] of records.entries()) {
		const primary = templatePrimaries[position]
		const uuid = record ? readAttribute({ record, name: 'uuid', defaults: 'none' }) : ''
		if (!primary || !uuid || claimedLineages.has(uuid)) continue
		const onFrame = nodes.filter(function isInstanceOnFrame(node) {
			return (
				node.record.tagName === primary.tagName &&
				lineageOf(node.record) === uuid &&
				node.ancestry.some((ancestor) => frameIds.has(ancestor.id))
			)
		})
		const free = onFrame.filter((node) => !othersPrimaryIds.has(node.record.id))
		const [only] = free
		if (free.length === 1 && only) result.claimed.push(only.record)
		else if (free.length > 1) result.unresolved.push(primary)
		// another placement's, or nowhere to place it: the IED's specification sits on no level of the unit's kind
		else if (onFrame.length > 0 || frameIds.size === 0) result.others.push(primary)
	}
	return result
}

/** The template element a record of the project was placed from. */
function lineageOf(record: AnyRawRecord): string {
	return readAttribute({ record, name: 'templateUuid', defaults: 'none' })
}

/** The records once each, in first-seen order. */
function uniqueRecords(records: readonly AnyRawRecord[]): AnyRawRecord[] {
	return [...new Map(records.map((record) => [record.id, record])).values()]
}
