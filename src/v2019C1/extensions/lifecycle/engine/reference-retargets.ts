import { readFileUuid } from '@/v2019C1/extensions/lifecycle/read-file-uuid'
import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import {
	findNamedRecords,
	uuidsNamedBy,
} from '@/v2019C1/extensions/reference/query/find/named-targets'

import type { RetargetUnresolved } from './diff.types'
import type {
	IsSameFileParams,
	ReadUpdateHoldsParams,
	UnresolvedRetargetsParams,
	WithUpdateHoldsParams,
	WithoutLeftOutParams,
} from './reference-retargets.types'
import type { RemovalBase } from './removal-base.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Whether the open document is a version of the newer revision's file: both Headers name the same file, as an open
 * ISD and its other version do. A fork into a project (another file) keeps the references the project made.
 */
export async function isSameFile(params: IsSameFileParams): Promise<boolean> {
	const [fileUuid, sourceFileUuid] = await Promise.all([
		readFileUuid(params.target),
		readFileUuid(params.sourceQuery),
	])
	return fileUuid !== undefined && fileUuid === sourceFileUuid
}

/**
 * What a fork of the file itself holds (see `ForkHolds`): the uuids the newer revision's references name (both
 * registries, an LNode's binding included) that the open document holds, or the newer revision does outside what the
 * update leaves out (`leftOut`: source primaries, and what sits under them). `undefined` for another file: nothing is
 * re-targeted. Reads: the two Headers, each reference tag of the newer revision once, each target tag of both documents
 * once, and the ancestors of the revision's targets once when something is left out.
 */
export async function readUpdateHolds(
	params: ReadUpdateHoldsParams,
): Promise<ReadonlySet<string> | undefined> {
	const { sourceQuery, target } = params
	if (!(await isSameFile({ sourceQuery, target }))) return undefined
	const referrers = await Promise.all(
		[...REFERENCE_UUIDS_BY_TAG.keys()].map(function referrersOf(tagName) {
			// dialecte-allow query-in-loop: one read per reference tag of the registry, once per update
			return sourceQuery.any.getRecordsByTagName(tagName as Scl.ElementsOf)
		}),
	)
	const named = referrers
		.flat()
		.flatMap((record) => uuidsNamedBy({ tagName: record.tagName, attributes: record.attributes }))
	if (named.length === 0) return new Set()
	const [inTarget, inSource] = await Promise.all([
		findNamedRecords(target, { named }),
		findNamedRecords(sourceQuery, { named }),
	])
	const brought = params.leftOut?.size
		? await withoutLeftOut(sourceQuery, { found: inSource, leftOut: params.leftOut })
		: [...inSource.keys()]
	return new Set([...inTarget.keys(), ...brought])
}

/**
 * The removal base of a fork with what the update holds recorded (`readUpdateHolds`): for a verb that records it
 * itself, once it knows what it leaves out. Another removal base is returned as it is.
 */
export async function withUpdateHolds(params: WithUpdateHoldsParams): Promise<RemovalBase> {
	const { removalBase } = params
	if (removalBase.kind !== 'revision' && removalBase.kind !== 'no-revision') return removalBase
	const holds = await readUpdateHolds(params)
	return holds ? { ...removalBase, holds } : removalBase
}

/**
 * The references of an element the newer revision points at a uuid the fork does not hold (neither the open document
 * nor what the update brings): they keep the element they name, and the report says so.
 */
export function unresolvedRetargets(params: UnresolvedRetargetsParams): RetargetUnresolved[] {
	const { tagName, sourceAttributes, instanceAttributes, uuids } = params
	return (REFERENCE_UUIDS_BY_TAG.get(tagName) ?? []).flatMap(
		function unresolvedOf(reference): RetargetUnresolved[] {
			const uuid = sourceAttributes[reference.uuid]
			if (!uuid || uuid === instanceAttributes[reference.uuid] || uuids.has(uuid)) return []
			return [{ attribute: reference.uuid, uuid }]
		},
	)
}

/** The uuids of the revision's named targets the update brings: none of them, nor an ancestor, left out. */
async function withoutLeftOut(
	sourceQuery: Core.Query<Config>,
	params: WithoutLeftOutParams,
): Promise<string[]> {
	const entries = [...params.found].flatMap(([uuid, records]) =>
		records.map((record): [string, AnyTrackedRecord] => [uuid, record]),
	)
	const ancestries = await sourceQuery.findAncestorsOfEach(
		entries.map(([, record]) => record) as Scl.Ref<Scl.ElementsOf>[],
		{ stopAtTagName: 'Substation' },
	)
	return entries.flatMap(function broughtUuid([uuid, record], position): string[] {
		const chain = [record, ...(ancestries[position] ?? [])]
		return chain.some((element) => params.leftOut.has(element.id)) ? [] : [uuid]
	})
}
