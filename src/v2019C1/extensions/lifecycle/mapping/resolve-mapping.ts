import { isTopologyLevel, readAttribute } from '@/v2019C1/helpers'

import type {
	MappingPolicy,
	MappingReader,
	ResolveMappingParams,
	ResolvedMapping,
} from './mapping.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Decide where a shared source element lands in the project — the ONE answer the report and the
 * apply both read, so the review shows what is applied.
 *
 * The first of these that answers wins:
 *  1. the consumer's choice;
 *  2. the one project element created from this source element (it carries its lineage) where the source element's own
 *     level lands — a template element may be instantiated several times; kept by its own uuid (a fork), anywhere;
 *  3. the one project element carrying the same key (its name) where the source element's own level lands — a role or
 *     a category is identified by where it sits: one of that name elsewhere is no match, only a choice the consumer
 *     may make.
 * With nothing to map onto, a new element is created. Where several elements qualify equally,
 * none is picked: the mapping is left `undecided` for the consumer to choose.
 */
export async function resolveMapping(
	reader: MappingReader,
	params: ResolveMappingParams,
): Promise<ResolvedMapping> {
	const { sourceQuery, sourceRef, policy, decision } = params
	const matchKey = params.matchKey ?? 'templateUuid'

	const sourceUuid = await sourceQuery.any.getAttribute(sourceRef, { name: 'uuid' })

	if (decision && 'existing' in decision) {
		const existing = await reader.any.getRecord(decision.existing)
		const lineage = existing
			? await reader.any.getAttribute(existing, { name: matchKey })
			: undefined
		return {
			existing,
			reason: 'decision',
			ambiguous: false,
			locked: false,
			projectOwned: existing !== undefined && (!sourceUuid || lineage !== sourceUuid),
			undecided: false,
		}
	}
	if (decision) return createdMapping({ reason: 'decision', ambiguous: false, undecided: false })

	// where the source element's own level lands: an instance of it, or one of its name, is looked for there only
	const landsOn = await findOwnLevelLanding(sourceQuery, { sourceRef, landings: params.landings })
	const sameLineage = sourceUuid
		? await findSameLineage(reader, { policy, matchKey, sourceUuid, landsOn })
		: []
	if (sameLineage.length === 1) {
		return {
			existing: sameLineage[0],
			reason: 'lineage',
			ambiguous: false,
			locked: false,
			projectOwned: false,
			undecided: false,
		}
	}

	const key = await sourceQuery.any.getAttribute(sourceRef, { name: policy.key })
	const sameKey: AnyTrackedRecord[] =
		key && landsOn
			? await findHeldAt(reader, {
					landsOn,
					tagName: policy.tagName,
					attributes: { [policy.key]: key },
				})
			: []
	if (sameKey.length === 1) {
		const lineage = await reader.any.getAttribute(sameKey[0], { name: matchKey })
		return {
			existing: sameKey[0],
			reason: 'name',
			ambiguous: false,
			locked: false,
			projectOwned: !sourceUuid || lineage !== sourceUuid,
			undecided: false,
		}
	}

	// several qualify equally: none is picked — the consumer's to choose
	if (sameKey.length > 1)
		return createdMapping({ reason: 'name', ambiguous: true, undecided: true })
	if (sameLineage.length > 1) {
		return createdMapping({ reason: 'lineage', ambiguous: true, undecided: true })
	}
	return createdMapping({ reason: 'none', ambiguous: false, undecided: false })
}

/**
 * The project element the level holding a source element lands on (its nearest Substation, VoltageLevel or Bay, by
 * `landings`): none when that level is created, or the element sits elsewhere. One read per step up.
 */
async function findOwnLevelLanding(
	sourceQuery: Core.Query<Config>,
	params: { sourceRef: Scl.Ref<Scl.ElementsOf>; landings: readonly RedirectMapping[] },
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const { landings } = params
	let record = await sourceQuery.any.getRecord(params.sourceRef)
	while (record?.parent) {
		record = await sourceQuery.any.getRecord(record.parent)
		if (!record || !isTopologyLevel(record.tagName)) continue
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		return landings.find(function landsFrom(landing) {
			return landing.sourceUuid === uuid
		})?.target
	}
	return undefined
}

/**
 * The project elements standing for the source element by lineage. A template element may be instantiated several
 * times, so its uuid as `templateUuid` tells no instance from another: one counts only where the source element's own
 * level lands. Kept by its own `uuid` (a fork), the element is the one of the file wherever it sits.
 */
async function findSameLineage(
	reader: MappingReader,
	params: {
		policy: MappingPolicy
		matchKey: MatchKey
		sourceUuid: string
		landsOn: Scl.Ref<Scl.ElementsOf> | undefined
	},
): Promise<AnyTrackedRecord[]> {
	const { policy, matchKey, sourceUuid, landsOn } = params
	const attributes = { [matchKey]: sourceUuid }
	if (matchKey === 'uuid')
		return reader.any.findByAttributes({ tagName: policy.tagName, attributes })
	return landsOn ? findHeldAt(reader, { landsOn, tagName: policy.tagName, attributes }) : []
}

/** The elements of a tag carrying `attributes` that sit in `landsOn` itself (its `Private`), not below it. */
async function findHeldAt(
	reader: MappingReader,
	params: {
		landsOn: Scl.Ref<Scl.ElementsOf>
		tagName: Scl.ElementsOf
		attributes: Record<string, string>
	},
): Promise<AnyTrackedRecord[]> {
	const { landsOn, tagName, attributes } = params
	const named = await reader.any.findByAttributes({ tagName, attributes })
	const held: AnyTrackedRecord[] = []
	for (const record of named) {
		const container = record.parent ? await reader.any.getRecord(record.parent) : undefined
		if (container?.parent?.id === landsOn.id) held.push(record)
	}
	return held
}

/** Nothing mapped onto: a new element is created, an instance of the source element — once decided. */
function createdMapping(
	params: Pick<ResolvedMapping, 'reason' | 'ambiguous' | 'undecided'>,
): ResolvedMapping {
	const { reason, ambiguous, undecided } = params
	return { reason, ambiguous, locked: false, projectOwned: false, undecided }
}
