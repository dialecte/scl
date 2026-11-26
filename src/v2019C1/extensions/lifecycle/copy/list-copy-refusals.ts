import { COPY_ROOT_TAGS } from './copy.constants'

import { readStructureLevel } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'
import { buildElementPaths } from '@/v2019C1/extensions/reference/query/build/build-element-path'
import { toAnyRawRecord } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.helpers'
import { readAttribute } from '@/v2019C1/helpers'
import {
	boundPairsOf,
	dataMissingOf,
	groupsTogetherOf,
	isInReach,
	toCommitRefusal,
} from '@/v2019C1/hooks/before-commit/uuid-references'
import { findTargetsByUuid } from '@/v2019C1/hooks/shared/find-targets-by-uuid'

import type { CopiedRecord, CopyWrite, ListCopyRefusalsParams } from './copy.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { LandingOf } from '@/v2019C1/extensions/lifecycle/layers/topology/source-landing.types'
import type { CommitRefusal } from '@/v2019C1/hooks/before-commit/commit-plan.types'
import type { BoundPair } from '@/v2019C1/hooks/before-commit/uuid-references.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The refusals the commit of a copy would raise, listed before it is written: each incoherent uuid reference the copy
 * creates (two exclusive groups held together, data missing beside its uuid — the commit's own read-free checks, its
 * unbind plan applied first: a pair it clears is no refusal), then each behaviour variable naming an element the copy
 * does not carry that is out of its reach where the copy lands (one held inside a copied root reaches no further than
 * the copy; one of a satellite, as far as the level the satellite lands on). Each names the source element. The
 * targets, the level of each satellite and the paths are read once each, whatever the copy carries.
 */
export async function listCopyRefusals(params: ListCopyRefusalsParams): Promise<CommitRefusal[]> {
	const { query, trees, unbinds, anchor, landingOf } = params
	const writes = new Map(
		unbinds
			.flatMap((unbind) => [
				unbind.lnode,
				...(unbind.specNaming ? [unbind.specNaming] : []),
				...unbind.references,
			])
			.map((write) => [write.element.id ?? '', write] as const),
	)
	const copied = trees.flatMap(function recordsOf(tree): CopiedRecord[] {
		return flatten(tree).map((node) => ({
			record: applyWrite({ record: toAnyRawRecord(node), write: writes.get(node.id) }),
			root: tree,
		}))
	})
	const bound = copied.map(({ record }) =>
		boundPairsOf({ change: { before: undefined, after: record } }),
	)
	const incoherent = copied.flatMap(({ record }, index) => [
		...groupsTogetherOf({ change: { before: undefined, after: record } }),
		...bound[index].flatMap((pair) => dataMissingOf({ bound: pair })),
	])
	const refusals = incoherent.map(toCommitRefusal)
	const refused = new Set(incoherent.map((refusal) => refusal.record.id))
	const carriedUuids = new Set(
		copied.flatMap(({ record }) => {
			const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
			return uuid ? [uuid] : []
		}),
	)
	// a behaviour variable naming what the copy does not carry: the element stays where it is
	const naming = copied.flatMap(({ root }, index) =>
		bound[index]
			.filter(
				(pair) =>
					pair.pair.resolution === RESOLUTION_TYPE.behaviorDescription &&
					!refused.has(pair.record.id) &&
					!carriedUuids.has(pair.uuid),
			)
			.map((pair) => ({ pair, root })),
	)
	if (naming.length === 0) return refusals
	const outOfReach = await findOutOfReach(query, { naming, anchor, landingOf })
	return [
		...refusals,
		...outOfReach.map((pair) =>
			toCommitRefusal({
				record: pair.record,
				uuidAttribute: pair.pair.attribute.uuid,
				reason: 'out-of-scope',
			}),
		),
	]
}

/**
 * The behaviour variables naming an element outside their reach once copied, as the commit judges a variable left
 * without its path (`isInReach`): held inside a copied root, every one (the element is outside the copy); held by a
 * satellite, those whose element is not at or below the level the satellite lands on — the level `cloneAppliedSatellites`
 * places it on (`readStructureLevel`). A variable naming nothing is no refusal (the commit does not look a created one
 * up). The targets, the satellites' ancestors and the paths are read once each.
 */
async function findOutOfReach(
	query: Core.Query<Config>,
	params: {
		naming: readonly { pair: BoundPair; root: AnyTreeRecord }[]
		anchor: Scl.Ref<Scl.ElementsOf>
		landingOf?: LandingOf
	},
): Promise<BoundPair[]> {
	const { naming, anchor, landingOf } = params
	const targets = await findTargetsByUuid(query, {
		sought: naming.map(({ pair }) => ({ uuid: pair.uuid, targetTagNames: pair.pair.target })),
	})
	const named = naming.flatMap((entry, index) => {
		const target = targets[index]
		return target ? [{ ...entry, target }] : []
	})
	const satellites = [
		...new Map(
			named
				.filter(({ root }) => !COPY_ROOT_TAGS.has(root.tagName))
				.map(({ root }) => [root.id, root] as const),
		).values(),
	]
	const landing = await landingLevels(query, { satellites, anchor, landingOf })
	const levelRefs = [
		...new Map([...landing.values()].map((level) => [level.id ?? '', level])).values(),
	]
	const paths = await buildElementPaths(query, {
		refs: [
			...levelRefs,
			...named.map(
				({ target }) => ({ tagName: target.tagName, id: target.id }) as Scl.Ref<Scl.ElementsOf>,
			),
		],
	})
	const levelPaths = new Map(levelRefs.map((level, index) => [level.id ?? '', paths[index]]))
	return named.flatMap(function judged({ pair, root }, index) {
		if (COPY_ROOT_TAGS.has(root.tagName)) return [pair]
		const level = landing.get(root.id)
		const behaviorContext = level ? levelPaths.get(level.id ?? '')?.segments : undefined
		const targetPath = paths[levelRefs.length + index]
		return isInReach({ targetPath, behaviorContext }) ? [] : [pair]
	})
}

/**
 * The level each satellite lands on where the copy is pasted, as `cloneAppliedSatellites` places it: where its source
 * level's row lands it, else the structure's level of its tag.
 */
async function landingLevels(
	query: Core.Query<Config>,
	params: {
		satellites: readonly AnyTreeRecord[]
		anchor: Scl.Ref<Scl.ElementsOf>
		/** Where a satellite held by a source level lands (a copy by its rows): there, before the structure's level. */
		landingOf?: LandingOf
	},
): Promise<Map<string, Scl.Ref<Scl.ElementsOf>>> {
	const { satellites, anchor, landingOf } = params
	if (satellites.length === 0) return new Map()
	const structure = await resolveTargetStructure(query, anchor)
	const ancestries = await query.findAncestorsOfEach(
		satellites.map(
			(satellite) => ({ tagName: satellite.tagName, id: satellite.id }) as Scl.Ref<Scl.ElementsOf>,
		),
		{ stopAtTagName: 'Substation' },
	)
	return new Map(
		satellites.map((satellite, index) => [
			satellite.id,
			landingOf?.(ancestries[index] ?? []) ??
				readStructureLevel({ ancestors: ancestries[index] ?? [], structure }),
		]),
	)
}

/** A tree and what it holds, at every depth, in document order. */
function flatten(node: AnyTreeRecord): AnyTreeRecord[] {
	return [node, ...node.tree.flatMap(flatten)]
}

/** A record as the copy writes it: the unbind plan's values written, the attributes it removes gone. */
function applyWrite(params: { record: AnyRawRecord; write: CopyWrite | undefined }): AnyRawRecord {
	const { record, write } = params
	if (!write) return record
	const removed = new Set([...write.removed, ...Object.keys(write.written)])
	const attributes = [
		...record.attributes.filter((attribute) => !removed.has(attribute.name)),
		...Object.entries(write.written).map(([name, value]) => ({ name, value })),
	]
	return { ...record, attributes }
}
