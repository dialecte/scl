import { LNODE_TYPE_ATTRIBUTE } from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { NAME_SCOPE_BY_TARGET } from '@/v2019C1/extensions/reference/constants/derived'
import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { scopedNameKey } from '@/v2019C1/extensions/reference/query/build/name-scope'
import {
	buildPathFromAncestry,
	fullSignalName,
	joinPathParts,
} from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readAttribute } from '@/v2019C1/helpers'

import type { CollectedTarget, ImportPathIndex, OtherPaths } from './io-hooks.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Index every target of the file under its path, once the whole file is read: a signal is named
 * among its siblings, an LNode by its `LNodeSpecNaming` (`specNamings`, by LNode id). The other paths
 * a file may write for a target are indexed too, as `legacyKeys`, unless they are the path of
 * another target: the LNode named by its own naming (the IED's, once bound), a signal named from its
 * own values as an earlier version wrote it (`Trip.general` for a unique input with a pDA, `Trip(2)`
 * for a unique input of instance 2, `Trip` for instance 1 of several), and a signal named with its
 * instance and data attribute whatever its siblings (`Trip(1).general` for the only `Trip`). The
 * names below a target's standard parent are indexed before the paths through an LNode named by its
 * own naming, and a path two targets claim in one tier names neither.
 */
export function buildImportPathIndex(params: {
	targets: readonly CollectedTarget[]
	specNamings: ReadonlyMap<string, AnyRawRecord>
}): ImportPathIndex {
	const { targets, specNamings } = params
	const siblingsByParent = groupSignalsByParent(targets)

	const index: ImportPathIndex = {
		byPath: new Map(),
		legacyKeys: new Set(),
		targetsByUuid: new Map(),
	}
	const otherPaths: OtherPaths = { underStandardParent: [], underOwnNaming: [] }

	for (const { record, ancestry, uuid } of targets) {
		const siblings = siblingsByParent.get(record.parent?.id ?? '')
		const standard = buildPathFromAncestry({ record, ancestry, siblings, specNamings })
		// an element with no segment of its own (an access point, a control block) would take its
		// parent's path: it is not named by a path
		if (!standard || standard.segments.at(-1)?.ref.id !== record.id) continue
		index.byPath.set(standard.path, uuid)
		index.targetsByUuid.set(uuid, {
			recordId: record.id,
			tagName: record.tagName,
			path: standard,
			lnType: readAttribute({
				record,
				name: LNODE_TYPE_ATTRIBUTE,
				defaults: 'none',
				fullObject: true,
			})?.value,
		})

		const paths = otherPathsOf({ record, ancestry, siblings, standardPath: standard.path })
		for (const path of paths.underStandardParent) otherPaths.underStandardParent.push([path, uuid])
		for (const path of paths.underOwnNaming) otherPaths.underOwnNaming.push([path, uuid])
	}

	for (const [key, uuid] of targets.flatMap((target) =>
		scopedNameKeysOf({ target, specNamings }),
	)) {
		if (!index.byPath.has(key)) index.byPath.set(key, uuid)
	}

	// the other names below a target's standard parent first, then the paths through an LNode named
	// by its own naming: an LNode bound to an IED may take, by its own naming, the name another LNode
	// is specified with
	const ambiguous = new Set<string>()
	for (const tier of [otherPaths.underStandardParent, otherPaths.underOwnNaming]) {
		indexOtherPaths({ index, paths: tier, ambiguous })
	}
	return index
}

/**
 * Index `paths` as `legacyKeys`, each where no target holds it yet. A path two targets of `paths`
 * claim names neither: it is left out, and kept out of the tiers after it (`ambiguous`).
 */
function indexOtherPaths(params: {
	index: ImportPathIndex
	paths: readonly [path: string, uuid: string][]
	ambiguous: Set<string>
}): void {
	const { index, paths, ambiguous } = params
	const claims = new Map<string, Set<string>>()
	for (const [path, uuid] of paths) {
		claims.set(path, (claims.get(path) ?? new Set()).add(uuid))
	}
	for (const [path, uuids] of claims) {
		if (index.byPath.has(path) || ambiguous.has(path)) continue
		if (uuids.size > 1) {
			ambiguous.add(path)
			continue
		}
		const [uuid] = uuids
		index.byPath.set(path, uuid)
		index.legacyKeys.add(path)
	}
}

/**
 * The key a target named in its scope is looked up by (`scopedNameKey`): its name below its nearest
 * scope ancestor (a variant in its Application). None for a target of no `scoped-name` pair, or
 * outside such an ancestor.
 */
function scopedNameKeysOf(params: {
	target: CollectedTarget
	specNamings: ReadonlyMap<string, AnyRawRecord>
}): [string, string][] {
	const { target, specNamings } = params
	const { record, ancestry, uuid } = target
	const nameScope = NAME_SCOPE_BY_TARGET.get(record.tagName)
	const name = readAttribute({ record, name: 'name', defaults: 'none' })
	const scopeIndex = ancestry.findLastIndex((ancestor) => ancestor.tagName === nameScope)
	if (!nameScope || !name || scopeIndex === -1) return []

	const scopePath = buildPathFromAncestry({
		record: ancestry[scopeIndex],
		ancestry: ancestry.slice(0, scopeIndex),
		specNamings,
	})
	return scopePath ? [[scopedNameKey({ scopePath: scopePath.path, name }), uuid]] : []
}

/** The signals of the file by parent id: the siblings a signal is named among. */
function groupSignalsByParent(targets: readonly CollectedTarget[]): Map<string, AnyRawRecord[]> {
	const byParent = new Map<string, AnyRawRecord[]>()
	for (const { record } of targets) {
		if (PATH_EXTRACTION_CONFIG[record.tagName]?.type !== 'signal') continue
		const parentId = record.parent?.id ?? ''
		byParent.set(parentId, [...(byParent.get(parentId) ?? []), record])
	}
	return byParent
}

/**
 * The other paths a file may write for a target, its standard path left out: its other names below
 * its standard parent, and its paths through the LNodes above it named by their own naming.
 */
function otherPathsOf(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	siblings: readonly AnyRawRecord[] | undefined
	standardPath: string
}): { underStandardParent: string[]; underOwnNaming: string[] } {
	const { record, ancestry, siblings, standardPath } = params
	const ownNaming = buildPathFromAncestry({ record, ancestry, siblings })
	const underStandardParent = new Set<string>()
	const underOwnNaming = new Set<string>(ownNaming ? [ownNaming.path] : [])

	const otherNames = [formerSignalName(record), fullSignalName(record)].filter(
		(name): name is string => Boolean(name),
	)
	if (otherNames.length > 0 && ownNaming) {
		const standardParent = parentPathOf(standardPath, ownNaming.segments.at(-1)?.segment)
		const ownParent = joinPathParts(ownNaming.segments.slice(0, -1))
		for (const name of otherNames) {
			if (standardParent) underStandardParent.add(`${standardParent}.${name}`)
			if (ownParent) underOwnNaming.add(`${ownParent}.${name}`)
		}
	}
	for (const paths of [underStandardParent, underOwnNaming]) paths.delete(standardPath)
	return { underStandardParent: [...underStandardParent], underOwnNaming: [...underOwnNaming] }
}

/** The path of a target's parent: its path without its own last segment. */
function parentPathOf(path: string, ownSegment: string | undefined): string | undefined {
	if (!ownSegment || !path.endsWith(ownSegment)) return undefined
	return path.slice(0, path.length - ownSegment.length - 1) || undefined
}

/**
 * The name the engine gave a signal before the standard form: decided by its own values, the
 * instance when not 1, the data attribute when set.
 */
function formerSignalName(record: AnyRawRecord): string | undefined {
	const strategy = PATH_EXTRACTION_CONFIG[record.tagName]
	if (strategy?.type !== 'signal') return undefined
	const name = readAttribute({ record, name: strategy.name, defaults: 'none' })
	if (!name) return undefined
	const instance = readAttribute({ record, name: strategy.instance, defaults: 'none' })
	const data = strategy.data
		? readAttribute({ record, name: strategy.data, defaults: 'none' })
		: undefined
	return `${name}${instance && instance !== '1' ? `(${instance})` : ''}${data ? `.${data}` : ''}`
}
