import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'
import {
	buildPathFromAncestry,
	joinPathParts,
} from '@/v2019C1/extensions/reference/query/build/path-segment'

import type { CollectedTarget, ImportPathIndex } from './io-hooks.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Index every target of the file under its path, once the whole file is read: a signal is named
 * among its siblings, an LNode by its `LNodeSpecNaming` (`specNamings`, by LNode id). The paths an
 * earlier version wrote for a target are indexed too, as `legacyKeys`, unless they are the path of
 * another target: the LNode named by its own naming (the IED's, once bound), and a signal named
 * from its own values (`Trip.general` for a unique input with a pDA, `Trip(2)` for a unique input of
 * instance 2, `Trip` for instance 1 of several).
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
	const formerPaths: [string, string][] = []

	for (const { record, ancestry, uuid } of targets) {
		const siblings = siblingsByParent.get(record.parent?.id ?? '')
		const standard = buildPathFromAncestry({ record, ancestry, siblings, specNamings })
		// an element with no segment of its own (an access point, a control block) would take its
		// parent's path: it is not named by a path
		if (!standard || standard.segments.at(-1)?.ref.id !== record.id) continue
		index.byPath.set(standard.path, uuid)
		index.targetsByUuid.set(uuid, { tagName: record.tagName, path: standard })

		for (const former of formerPathsOf({
			record,
			ancestry,
			siblings,
			standardPath: standard.path,
		})) {
			formerPaths.push([former, uuid])
		}
	}

	for (const [path, uuid] of formerPaths) {
		if (index.byPath.has(path)) continue
		index.byPath.set(path, uuid)
		index.legacyKeys.add(path)
	}
	return index
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

/** The paths an earlier version wrote for a target, its standard path left out. */
function formerPathsOf(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	siblings: readonly AnyRawRecord[] | undefined
	standardPath: string
}): string[] {
	const { record, ancestry, siblings, standardPath } = params
	const ownNaming = buildPathFromAncestry({ record, ancestry, siblings })
	const paths = new Set<string>(ownNaming ? [ownNaming.path] : [])

	const formerName = formerSignalName(record)
	if (formerName && ownNaming) {
		const standardParent = parentPathOf(standardPath, ownNaming.segments.at(-1)?.segment)
		const ownParent = joinPathParts(ownNaming.segments.slice(0, -1))
		for (const parent of [standardParent, ownParent]) {
			if (parent) paths.add(`${parent}.${formerName}`)
		}
	}
	paths.delete(standardPath)
	return [...paths]
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
	const name = readAttribute(record, strategy.name)
	if (!name) return undefined
	const instance = readAttribute(record, strategy.instance)
	const data = strategy.data ? readAttribute(record, strategy.data) : undefined
	return `${name}${instance && instance !== '1' ? `(${instance})` : ''}${data ? `.${data}` : ''}`
}

function readAttribute(record: AnyRawRecord, name: string): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}
