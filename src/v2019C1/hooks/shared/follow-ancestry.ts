import { isElementOf, toRawRecord } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { REF_ENTRIES_BY_TARGET } from '@/v2019C1/extensions/reference'
import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { buildReferenceAttributes } from '@/v2019C1/extensions/reference/query/build/build-reference-attributes'
import {
	composeDerivedAttributes,
	derivedAttributesFollowing,
} from '@/v2019C1/extensions/reference/query/build/compose-derived-attributes'
import {
	buildPathFromAncestry,
	getPathSegment,
} from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readSiblingsOfEach } from '@/v2019C1/extensions/reference/query/build/read-siblings-of-each'
import { readSpecNamings } from '@/v2019C1/extensions/reference/query/build/spec-namings'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { readAttribute } from '@/v2019C1/helpers'
import { updatedOperation, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'

import type {
	FollowedElement,
	FollowedPaths,
	FollowedReferrer,
	FollowedRoot,
	FollowedWrite,
	ReferrerSearch,
} from './follow-ancestry.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { CollectedWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'
import type { AttributeList } from '@/v2019C1/hooks/shared/record-ops'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Rebuild what follows the paths of `roots` (a rename, a change of the naming of an LNode, a created target): the
 * references to each root (`references`), the attributes the root writes from its own path (`ownPath`), and, with
 * `below`, both for every element under it. A root followed below is read once with its subtree and ancestry, the
 * other roots in one read; each referrer tag is read once for all the roots, and every path is composed from the
 * ancestry read. One operation per record written, with all it holds for every element it names.
 */
export async function followAncestry(
	query: Core.Query<Config>,
	params: { roots: readonly FollowedRoot[] },
): Promise<Scl.Operation[]> {
	const { elements, held } = await readFollowedElements(query, params)
	if (elements.length === 0) return []
	const referrers = await readReferrers(query, { elements })
	const referred = new Set(referrers.map((found) => found.target))
	const pathed = elements.filter((element) => writesOwnPath(element) || referred.has(element))
	if (pathed.length === 0) return []
	const paths = await composePaths(query, { elements: pathed, held })
	return writeFollowing(query, { elements: pathed, referrers, paths })
}

/**
 * The elements whose paths are followed: each root, and every element below a root followed below; with every record
 * the subtrees hold, by id (`held`), for what a path reads below them.
 */
async function readFollowedElements(
	query: Core.Query<Config>,
	params: { roots: readonly FollowedRoot[] },
): Promise<{ elements: FollowedElement[]; held: ReadonlyMap<string, AnyRawRecord> }> {
	const { roots } = params
	const belowRoots = roots.filter((root) => root.below)
	const shallowRoots = roots.filter((root) => !root.below)

	const subtrees = await Promise.all(
		belowRoots.map(function readSubtree(followed) {
			return collectWithAncestry(query, { root: followed.root })
		}),
	)
	const shallowRecords =
		shallowRoots.length > 0 ? await query.getRecords(shallowRoots.map((root) => root.root)) : []

	const below = belowRoots.flatMap((followed, index) =>
		elementsOfSubtree({ followed, subtree: subtrees[index] }),
	)
	const shallow = shallowRoots.flatMap((followed, index) => {
		const record = shallowRecords[index]
		return record
			? [
					{
						record: toRawRecord(record) as AnyRawRecord,
						ancestry: undefined,
						siblings: undefined,
						references: followed.references,
						ownPath: followed.ownPath,
					},
				]
			: []
	})
	const held = new Map(
		subtrees.flatMap((subtree) =>
			subtree.records.map((record): [string, AnyRawRecord] => [record.id, record]),
		),
	)
	return { elements: mergeElements([...below, ...shallow]).filter(isFollowed), held }
}

/** The root of a subtree with what its caller follows of it, and every element below it with both followed. */
function elementsOfSubtree(params: {
	followed: FollowedRoot
	subtree: CollectedWithAncestry
}): FollowedElement[] {
	const { followed, subtree } = params
	const childrenOf = new Map<string, AnyRawRecord[]>()
	for (const record of subtree.records) {
		const parentId = record.parent?.id
		if (!parentId) continue
		const children = childrenOf.get(parentId)
		if (children) children.push(record)
		else childrenOf.set(parentId, [record])
	}
	return subtree.records.map((record) => {
		const isRoot = record.id === followed.root.id
		return {
			record,
			ancestry: subtree.ancestryOf(record.id),
			siblings: isRoot || !record.parent ? undefined : childrenOf.get(record.parent.id),
			references: isRoot ? followed.references : true,
			ownPath: isRoot ? followed.ownPath : true,
		}
	})
}

/** One element per record: an element followed twice (a root below another) keeps what either follows. */
function mergeElements(elements: readonly FollowedElement[]): FollowedElement[] {
	const byId = new Map<string, FollowedElement>()
	for (const element of elements) {
		const held = byId.get(element.record.id)
		byId.set(
			element.record.id,
			held
				? {
						...held,
						ancestry: held.ancestry ?? element.ancestry,
						siblings: held.siblings ?? element.siblings,
						references: held.references || element.references,
						ownPath: held.ownPath || element.ownPath,
					}
				: element,
		)
	}
	return [...byId.values()]
}

/** Whether a path of the element is written: a reference may name it by its uuid, or it writes its own path. */
function isFollowed(element: FollowedElement): boolean {
	const { record } = element
	const isTarget =
		element.references &&
		REF_ENTRIES_BY_TARGET.has(record.tagName) &&
		Boolean(readAttribute({ record, name: 'uuid' }))
	return isTarget || writesOwnPath(element)
}

/** Whether the element writes attributes from its own path (a node's `pathName`) and that is followed. */
function writesOwnPath(element: FollowedElement): boolean {
	return (
		element.ownPath &&
		Boolean(derivedAttributesFollowing({ tagName: element.record.tagName, follows: 'self' }))
	)
}

/**
 * The references naming a followed element by its uuid, through a pair to that element's tag: one search per referrer
 * tag and uuid attribute, for every followed uuid that attribute may hold (a search matches every attribute it names,
 * so two uuid attributes of a tag are two searches).
 */
async function readReferrers(
	query: Core.Query<Config>,
	params: { elements: readonly FollowedElement[] },
): Promise<FollowedReferrer[]> {
	const targetsByUuid = new Map<string, FollowedElement[]>()
	for (const element of params.elements) {
		if (!element.references) continue
		const uuid = readAttribute({ record: element.record, name: 'uuid' })
		if (!uuid || !REF_ENTRIES_BY_TARGET.has(element.record.tagName)) continue
		const targets = targetsByUuid.get(uuid)
		if (targets) targets.push(element)
		else targetsByUuid.set(uuid, [element])
	}
	if (targetsByUuid.size === 0) return []

	const searches = referrerSearchesOf({ targetsByUuid })
	const found = await Promise.all(
		searches.map(function searchReferrers({ tagName, uuidAttribute, uuids }) {
			// dialecte-allow query-in-loop: one search per referrer tag and uuid attribute, for every followed uuid at once
			return query.findByAttributes({
				tagName,
				// the attribute is named at run time: the filter type is per tag, the pair entries say it holds a uuid
				attributes: { [uuidAttribute]: uuids } as never,
			})
		}),
	)

	const named = new Map<string, FollowedReferrer>()
	searches.forEach(function matchReferrers({ uuidAttribute, targetTags }, index) {
		for (const referrer of found[index] as Scl.TrackedRecord<Scl.ElementsOf>[]) {
			const uuid = readAttribute({ record: referrer, name: uuidAttribute, defaults: 'none' })
			for (const target of (uuid && targetsByUuid.get(uuid)) || []) {
				if (!targetTags.has(target.record.tagName)) continue
				named.set(`${referrer.id} ${target.record.id}`, { referrer, target })
			}
		}
	})
	return [...named.values()]
}

/** Per referrer tag and uuid attribute that may name a followed element: the target tags it names and the uuids sought. */
function referrerSearchesOf(params: {
	targetsByUuid: ReadonlyMap<string, readonly FollowedElement[]>
}): ReferrerSearch[] {
	const searches = new Map<
		string,
		{ tagName: Scl.ElementsOf; uuidAttribute: string; targetTags: Set<string>; uuids: Set<string> }
	>()
	for (const [uuid, targets] of params.targetsByUuid) {
		for (const target of targets) {
			const targetTagName = target.record.tagName
			for (const entry of REF_ENTRIES_BY_TARGET.get(targetTagName) ?? []) {
				if (!isElementOf(entry.refTagName, SCL_DIALECTE_CONFIG)) continue
				const key = `${entry.refTagName} ${entry.uuidAttr}`
				const search = searches.get(key) ?? {
					tagName: entry.refTagName,
					uuidAttribute: entry.uuidAttr,
					targetTags: new Set<string>(),
					uuids: new Set<string>(),
				}
				search.targetTags.add(targetTagName)
				search.uuids.add(uuid)
				searches.set(key, search)
			}
		}
	}
	return [...searches.values()].map((search) => ({ ...search, uuids: [...search.uuids] }))
}

/**
 * The path of each element, from the ancestry read with it: the ancestors of an element read alone, the siblings of a
 * signal read with neither and the specified namings of the LNodes on the paths that no subtree `held` are read here,
 * once each.
 */
async function composePaths(
	query: Core.Query<Config>,
	params: { elements: readonly FollowedElement[]; held: ReadonlyMap<string, AnyRawRecord> },
): Promise<FollowedPaths> {
	const elements = params.elements.filter((element) => getPathSegment(element.record) !== null)
	const composed = new Set(elements)
	const ancestries = await readMissingAncestries(query, { elements })
	const siblings = await readMissingSiblings(query, { elements })
	function ancestryOf(element: FollowedElement): readonly AnyRawRecord[] {
		return element.ancestry ?? ancestries.get(element.record.id) ?? []
	}
	const specNamings = await readSpecNamings(query, {
		records: elements.flatMap((element) => [...ancestryOf(element), element.record]),
		held: params.held,
	})

	return new Map(
		params.elements.map((element) => [
			element.record.id,
			composed.has(element)
				? buildPathFromAncestry({
						record: element.record,
						ancestry: ancestryOf(element),
						siblings: SIGNAL_TAG_NAMES.has(element.record.tagName)
							? (element.siblings ?? siblings.get(element.record.parent?.id ?? ''))
							: undefined,
						specNamings,
					})
				: null,
		]),
	)
}

/** The ancestors, outermost first, of each element read without them. */
async function readMissingAncestries(
	query: Core.Query<Config>,
	params: { elements: readonly FollowedElement[] },
): Promise<Map<string, readonly AnyRawRecord[]>> {
	const alone = params.elements.filter((element) => element.ancestry === undefined)
	const ancestors = await Promise.all(
		alone.map(function readAncestors(element) {
			// dialecte-allow query-in-loop: one ancestor read per root followed alone that a reference names (its own levels)
			return query.findAncestors(element.record as Scl.Ref<Scl.ElementsOf>, { order: 'top-down' })
		}),
	)
	return new Map(
		alone.map((element, index) => [
			element.record.id,
			ancestors[index].map((record) => toRawRecord(record) as AnyRawRecord),
		]),
	)
}

/** The siblings of each signal read without them, by parent id: one batch for all their parents. */
async function readMissingSiblings(
	query: Core.Query<Config>,
	params: { elements: readonly FollowedElement[] },
): Promise<Map<string, readonly AnyRawRecord[]>> {
	// keyed by parent alone: a signal parent holds one signal tag
	const firstByParent = new Map<string, AnyRawRecord>()
	for (const { record, siblings } of params.elements) {
		if (siblings || !SIGNAL_TAG_NAMES.has(record.tagName) || !record.parent) continue
		if (!firstByParent.has(record.parent.id)) firstByParent.set(record.parent.id, record)
	}
	const signals = [...firstByParent.values()]
	const read = await readSiblingsOfEach({ query, records: signals })
	return new Map(signals.map((record, index) => [record.parent?.id ?? '', read[index]]))
}

/**
 * The operations writing what follows the paths: each reference to an element its pair's path and the attributes it
 * writes from it, each element the attributes it writes from its own path; one operation per record changed.
 */
async function writeFollowing(
	query: Core.Query<Config>,
	params: {
		elements: readonly FollowedElement[]
		referrers: readonly FollowedReferrer[]
		paths: FollowedPaths
	},
): Promise<Scl.Operation[]> {
	const { elements, referrers, paths } = params
	const referenceValues = await Promise.all(
		referrers.map(function referenceValuesOf({ referrer, target }) {
			const targetPath = paths.get(target.record.id)
			return targetPath
				? buildReferenceAttributes(query, {
						reference: { tagName: referrer.tagName, id: referrer.id } as Scl.Ref<Scl.ElementsOf>,
						referenceRecord: referrer,
						target: {
							tagName: target.record.tagName,
							id: target.record.id,
						} as Scl.Ref<Scl.ElementsOf>,
						targetPath,
					})
				: []
		}),
	)
	const writes: FollowedWrite[] = [
		...referrers.map((found, index) => ({
			record: toRawRecord(found.referrer) as AnyRawRecord,
			values: referenceValues[index],
		})),
		...elements.flatMap((element) => ownPathWrite({ element, paths })),
	]
	return foldWrites(writes)
}

/** The attributes an element writes from its own path, when it is followed and has one. */
function ownPathWrite(params: { element: FollowedElement; paths: FollowedPaths }): FollowedWrite[] {
	const { element, paths } = params
	if (!element.ownPath) return []
	const derived = derivedAttributesFollowing({ tagName: element.record.tagName, follows: 'self' })
	const sourcePath = paths.get(element.record.id)
	if (!derived || !sourcePath) return []
	return [{ record: element.record, values: composeDerivedAttributes({ derived, sourcePath }) }]
}

/** One operation per record whose attributes the writes change, every write to it applied in turn. */
function foldWrites(writes: readonly FollowedWrite[]): Scl.Operation[] {
	const byId = new Map<string, { record: AnyRawRecord; attributes: AttributeList }>()
	for (const { record, values } of writes) {
		const held = byId.get(record.id)
		const attributes = withAttributeValues(held?.attributes ?? record.attributes, values)
		byId.set(record.id, { record: held?.record ?? record, attributes })
	}
	return [...byId.values()]
		.filter(({ record, attributes }) => attributes !== record.attributes)
		.map(({ record, attributes }) =>
			updatedOperation(record as Scl.RawRecord<Scl.ElementsOf>, attributes),
		)
}
