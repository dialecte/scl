import { BEHAVIOUR_PAIRS_BY_TAG } from './out-of-scope-variables.constants'

import { toRef } from '@dialecte/core/helpers'

import { buildElementPaths } from '@/v2019C1/extensions/reference/query/build/build-element-path'
import { localSegments } from '@/v2019C1/extensions/reference/query/build/local-segments'
import { toAnyRawRecord } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.helpers'
import { readAttribute } from '@/v2019C1/helpers'
import { findTargetsByUuid } from '@/v2019C1/hooks/shared/find-targets-by-uuid'
import { parentRefOf } from '@/v2019C1/hooks/shared/parent-ref'

import type { ListedVariable, OutOfReach, OutOfScopeVariable } from './out-of-scope-variables.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Every stored behaviour variable (`InputVar`, `OutputVar`) whose uuid names an element out of its behaviour's reach
 * (not at or below the element holding its BehaviorDescription), one entry per pair, the `InputVar`s first, then the
 * `OutputVar`s, each tag in document order: the state the
 * commit refuses (`REFERENCE_INCOHERENT` `out-of-scope`) for what a transaction writes, kept by projects written before.
 * Its `counterpart` is the one element of the target's tag in reach sharing its template lineage: an instance of it
 * (`templateUuid` its uuid), the template it is an instance of, or another instance of that template; none when no
 * element, or several, are. A variable naming nothing (the orphan rules' case) or in reach is not listed.
 * `tx.cleanUp.repairOutOfScopeVariables` writes what this answers.
 *
 * Perf: each behaviour variable tag read once; the targets by `findTargetsByUuid` (one lookup per target tag); their
 * paths and those of the behaviours in one `buildElementPaths`. Only with a variable out of reach: two lookups per
 * target tag for the lineage, and the paths of the candidates in one more `buildElementPaths`.
 *
 * @intent find behaviour variables naming an LNode outside their behaviour, list out-of-scope InputVar OutputVar, preview the repair of stored out-of-reach references
 */
export async function findOutOfScopeVariables(
	query: Core.Query<Config> | Core.Transaction<Config>,
): Promise<OutOfScopeVariable[]> {
	const listed = await listOutOfScopeVariables(query)
	return listed.map(asOutOfScopeVariable)
}

/** A variable out of reach as the query answers it: refs, and the counterpart's uuid. */
export function asOutOfScopeVariable(entry: ListedVariable): OutOfScopeVariable {
	const { record, pair, target, counterpart } = entry
	return {
		variable: toRef(record) as Scl.Ref<Scl.ElementsOf>,
		uuidAttribute: pair.attribute.uuid,
		target: toRef(target) as Scl.Ref<Scl.ElementsOf>,
		...(counterpart
			? {
					counterpart: {
						ref: toRef(counterpart) as Scl.Ref<Scl.ElementsOf>,
						uuid: readAttribute({ record: counterpart, name: 'uuid', defaults: 'none' }),
					},
				}
			: {}),
	}
}

/**
 * What `findOutOfScopeVariables` answers, as records: each variable out of reach with its pair, its target and its
 * counterpart, for `repairOutOfScopeVariables` to write from.
 */
export async function listOutOfScopeVariables(
	query: Core.Query<Config> | Core.Transaction<Config>,
): Promise<ListedVariable[]> {
	const reader = query as Core.Query<Config>
	const read = await Promise.all(
		[...BEHAVIOUR_PAIRS_BY_TAG.keys()].map(function readTag(tagName) {
			return reader.getRecordsByTagName(tagName as Scl.ElementsOf)
		}),
	)
	const bound = read.flat().flatMap(function boundPairs(found) {
		const record = toAnyRawRecord(found)
		return (BEHAVIOUR_PAIRS_BY_TAG.get(record.tagName) ?? []).flatMap((pair) => {
			const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
			return uuid ? [{ record, pair, uuid }] : []
		})
	})
	if (bound.length === 0) return []
	const targets = await findTargetsByUuid(reader, {
		sought: bound.map(({ uuid, pair }) => ({ uuid, targetTagNames: pair.target })),
	})
	const named = bound.flatMap((entry, index) => {
		const target = targets[index]
		return target ? [{ ...entry, target: toAnyRawRecord(target) }] : []
	})
	if (named.length === 0) return []
	const paths = await buildElementPaths(reader, {
		refs: named.flatMap(({ record, target }) => [
			toRef(target),
			parentRefOf({ record, caller: 'findOutOfScopeVariables' }),
		]) as Scl.Ref<Scl.ElementsOf>[],
	})
	const outOfReach = named.flatMap(function judged(entry, index): OutOfReach[] {
		const targetPath = paths[index * 2]
		// the level above the BehaviorDescription: its path, the BehaviorDescription's own segment left out
		const reach = paths[index * 2 + 1]?.segments.slice(0, -1)
		if (!targetPath || !reach) return []
		const inReach = localSegments({ context: reach, segments: targetPath.segments }) !== null
		return inReach ? [] : [{ record: entry.record, pair: entry.pair, target: entry.target, reach }]
	})
	if (outOfReach.length === 0) return []
	const counterparts = await readCounterparts({ query: reader, outOfReach })
	return outOfReach.map(({ record, pair, target }, index) => ({
		record,
		pair,
		target,
		counterpart: counterparts[index],
	}))
}

/**
 * For each variable out of reach, the one element of its target's tag in its reach sharing the target's template
 * lineage, else `undefined`: the candidates looked up by their `templateUuid` and by their uuid (two lookups per tag),
 * their paths in one `buildElementPaths`.
 */
async function readCounterparts(params: {
	query: Core.Query<Config>
	outOfReach: readonly OutOfReach[]
}): Promise<(AnyRawRecord | undefined)[]> {
	const { query, outOfReach } = params
	const lineages = outOfReach.map(({ target }) => lineageOf({ record: target }))
	const tags = [...new Set(outOfReach.map(({ target }) => target.tagName))]
	const lookups = await Promise.all(
		tags.flatMap(function lookUpTag(tagName) {
			const ofTag = lineages.filter((_, index) => outOfReach[index].target.tagName === tagName)
			const byTemplate = [
				...new Set(ofTag.flatMap(({ uuid, templateUuid }) => [uuid, templateUuid].filter(Boolean))),
			]
			const byUuid = [
				...new Set(ofTag.flatMap(({ templateUuid }) => (templateUuid ? [templateUuid] : []))),
			]
			return [
				// dialecte-allow query-in-loop: two lookups per target tag, whatever the number of variables
				query.findByAttributes({
					tagName: tagName as Scl.ElementsOf,
					attributes: { templateUuid: byTemplate },
				}),
				byUuid.length > 0
					? query.findByAttributes({
							tagName: tagName as Scl.ElementsOf,
							attributes: { uuid: byUuid },
						})
					: Promise.resolve([]),
			]
		}),
	)
	const found = [
		...new Map(lookups.flat().map((record) => [record.id, toAnyRawRecord(record)])).values(),
	]
	const candidatesOf = outOfReach.map(({ target }, index) =>
		found.filter(
			(candidate) =>
				candidate.tagName === target.tagName &&
				candidate.id !== target.id &&
				sharesLineage({ candidate: lineageOf({ record: candidate }), target: lineages[index] }),
		),
	)
	const unique = [
		...new Map(candidatesOf.flat().map((candidate) => [candidate.id, candidate])).values(),
	]
	if (unique.length === 0) return outOfReach.map(() => undefined)
	const paths = await buildElementPaths(query, {
		refs: unique.map((candidate) => toRef(candidate)) as Scl.Ref<Scl.ElementsOf>[],
	})
	const pathById = new Map(unique.map((candidate, index) => [candidate.id, paths[index]]))
	return outOfReach.map(function counterpartOf({ reach }, index) {
		const inReach = candidatesOf[index].filter((candidate) => {
			const path = pathById.get(candidate.id)
			return path ? localSegments({ context: reach, segments: path.segments }) !== null : false
		})
		return inReach.length === 1 ? inReach[0] : undefined
	})
}

/** An element's uuid and the uuid of the template it is an instance of. */
function lineageOf(params: { record: AnyRawRecord }): { uuid: string; templateUuid: string } {
	const { record } = params
	return {
		uuid: readAttribute({ record, name: 'uuid', defaults: 'none' }),
		templateUuid: readAttribute({ record, name: 'templateUuid', defaults: 'none' }),
	}
}

/** Whether a candidate is an instance of the target, its template, or another instance of its template. */
function sharesLineage(params: {
	candidate: { uuid: string; templateUuid: string }
	target: { uuid: string; templateUuid: string }
}): boolean {
	const { candidate, target } = params
	if (candidate.templateUuid && candidate.templateUuid === target.uuid) return true
	if (!target.templateUuid) return false
	return candidate.uuid === target.templateUuid || candidate.templateUuid === target.templateUuid
}
