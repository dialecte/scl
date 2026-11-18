import {
	FILE_IDENTITY_TAGS,
	HELD_ELEMENT_RANK,
	IDENTITY_KEEPING_FILE_TYPES,
	LANDED_ON_TAGS,
} from './ied-placement.constants'
import { isIsdInstance } from './is-isd-instance'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { IED_ROOT_TAG } from '@/v2019C1/extensions/lifecycle/source-root/source-root.constants'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	AssertIedPlacementParams,
	HeldElement,
	UuidRecord,
} from './assert-ied-placement.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Refuse, before anything is read further, an IED placement the report and the apply do not offer yet, with
 * `OPTION_NOT_AVAILABLE`: the IED of a template ISD or of an ICD is placed as a new IED, the IED of an ISD instance file
 * as a fork only, keeping its identity, and only a first placement.
 *  - an IED read from an IID or an SCD: `meta: { option: 'source', value: 'iid' | 'scd' }`;
 *  - the IED of an ISD instance file (an ISD whose IED is not named `SPECIFICATION`) placed other than as a fork:
 *    `meta: { option: 'source', value: 'isd-instance' }`;
 *  - `template` or `fork` finding the IED already in the project (an IED carrying its uuid as lineage, or as its own
 *    uuid for a fork): `meta: { option: 'scenario', value }`. `instantiate` places a new IED whatever the project holds;
 *  - a fork whose IED or specification (the file's substation section) the project holds any element of by its uuid,
 *    whatever kind of element holds that uuid there: `meta: { option: 'scenario', value: 'fork', held: { tagName, path }
 *    }`, `held` naming the project's element holding it. A fork keeps the
 *    file's uuids: placed beside what the project holds, it would hold one uuid twice; what the project holds of it is
 *    an update, never a placement beside it.
 */
export async function assertIedPlacementOffered(
	query: Core.Query<Config>,
	params: AssertIedPlacementParams,
): Promise<void> {
	const { sourceQuery, scenario } = params
	const { uuid } = await assertIedSourceOffered(params)
	const { matchesInstances, matchKey } = scenarioPolicy({ scenario })
	if (!matchesInstances) return
	const matched = await findInstancesByTemplateUuid(query, {
		tagName: IED_ROOT_TAG,
		sourceUuid: uuid,
		matchKey,
	})
	if (matched.length > 0) {
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option: 'scenario', value: scenario },
			detail: `${params.operation}: "${scenario}" finds the IED in the project, only a first placement is offered yet`,
		})
	}
	if (scenario !== 'fork') return
	const held = await findHeldPlacedElement(query, { sourceQuery })
	if (!held) return
	throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
		meta: { option: 'scenario', value: scenario, held },
		detail: `${params.operation}: "${scenario}" finds in the project the ${held.tagName} ${held.path ?? ''} holding a uuid of the IED or of its specification, only a first placement is offered yet`,
	})
}

/**
 * Refuse a source an IED is not read from yet, with `OPTION_NOT_AVAILABLE` (`meta: { option: 'source', value }`): an
 * IID or an SCD (`'iid'` / `'scd'`), an ISD instance file other than as a fork (`'isd-instance'`). Returns the source
 * IED's name and uuid, read once.
 */
export async function assertIedSourceOffered(
	params: AssertIedPlacementParams,
): Promise<{ name: string; uuid: string | undefined }> {
	const { sourceQuery, iedRef, scenario, fileType } = params
	if (fileType && IDENTITY_KEEPING_FILE_TYPES.has(fileType)) {
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option: 'source', value: fileType.toLowerCase() },
			detail: `${params.operation}: an IED read from an ${fileType} is not placed yet, only one of a template ISD or an ICD`,
		})
	}
	const { name, uuid } = await sourceQuery.getAttributes(iedRef)
	if (isIsdInstance({ fileType, iedName: name }) && scenario !== 'fork') {
		throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
			meta: { option: 'source', value: 'isd-instance' },
			detail: `${params.operation}: the IED of an ISD instance file (named "${name}") keeps its identity: it is placed as a fork only`,
		})
	}
	return { name, uuid }
}

/**
 * The element of the project holding, under any tag, a uuid the placement keeps: one the source file gives an element
 * it places (its IED, its specification, a subnetwork it adds). The file's own `Header` is no element placed. A
 * subnetwork lands on the project's subnetwork of its uuid, lineage or name, so a project `SubNetwork` holding the uuid
 * of the source's subnetwork is that subnetwork, no clash (`LANDED_ON_TAGS`); any other element holding it is. Several
 * held: the one of the highest-ranked tag (`HELD_ELEMENT_RANK`), then of the smallest uuid, with its path. One collect
 * of each document (read by tag), one path read.
 */
async function findHeldPlacedElement(
	query: Core.Query<Config>,
	params: { sourceQuery: Core.Query<Config> },
): Promise<HeldElement | undefined> {
	const sourceRecords = await readUuidRecords(params.sourceQuery, { leaveOut: FILE_IDENTITY_TAGS })
	const placedTags = new Map(sourceRecords.map(({ uuid, ref }) => [uuid, ref.tagName] as const))
	if (placedTags.size === 0) return undefined
	const projectRecords = await readUuidRecords(query, { leaveOut: new Set() })
	const [first] = projectRecords
		.filter(function clashes({ uuid, ref }) {
			const sourceTag = placedTags.get(uuid)
			if (!sourceTag) return false
			return !(LANDED_ON_TAGS.has(sourceTag) && ref.tagName === sourceTag)
		})
		.sort(byRankThenUuid)
	if (!first) return undefined
	const elementPath = await buildElementPath(query, first.ref)
	return { tagName: first.ref.tagName, path: elementPath?.path }
}

/** The order the held elements are told in: the tag's rank (unranked last), then the uuid. */
function byRankThenUuid(left: UuidRecord, right: UuidRecord): number {
	return rankOf(left) - rankOf(right) || left.uuid.localeCompare(right.uuid)
}

/** The rank of a held element's tag: its place in `HELD_ELEMENT_RANK`, an unranked tag last. */
function rankOf(record: UuidRecord): number {
	const index = HELD_ELEMENT_RANK.indexOf(record.ref.tagName)
	return index === -1 ? HELD_ELEMENT_RANK.length : index
}

/** The elements of a document carrying a uuid, but those of the tags left out: one collect under its root. */
async function readUuidRecords(
	query: Core.Query<Config>,
	params: { leaveOut: ReadonlySet<string> },
): Promise<UuidRecord[]> {
	const root = await query.getRoot()
	const found = await query.findDescendants(root)
	return Object.values(found)
		.flat()
		.flatMap(function uuidRecordOf(record) {
			if (params.leaveOut.has(record.tagName)) return []
			const uuid = readAttribute({ record, name: 'uuid' })
			const ref = { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>
			return uuid ? [{ uuid, ref }] : []
		})
}
