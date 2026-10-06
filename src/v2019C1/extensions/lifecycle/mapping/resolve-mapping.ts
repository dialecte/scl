import type { MappingReader, ResolveMappingParams, ResolvedMapping } from './mapping.types'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Decide where a shared source element lands in the project — the ONE answer the report and the
 * apply both read, so the review shows what is applied.
 *
 * The first of these that answers wins:
 *  1. the consumer's choice;
 *  2. the one project element created from this source element (it carries its lineage);
 *  3. the one project element carrying the same key (its name).
 * With nothing to map onto, a new element is created. Where several elements qualify equally,
 * none is picked: the mapping is left `undecided` for the consumer to choose — or, for an element
 * whose mapping cannot be chosen, a new one is created too.
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

	const sameLineage: AnyTrackedRecord[] = sourceUuid
		? await reader.any.findByAttributes({
				tagName: policy.tagName,
				attributes: { [matchKey]: sourceUuid },
			})
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
	const sameKey: AnyTrackedRecord[] = key
		? await reader.any.findByAttributes({
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

	// several qualify equally: none is picked — the consumer's to choose when it may, else a new one
	const undecided = policy.selectable
	if (sameKey.length > 1) return createdMapping({ reason: 'name', ambiguous: true, undecided })
	if (sameLineage.length > 1) {
		return createdMapping({ reason: 'lineage', ambiguous: true, undecided })
	}
	return createdMapping({ reason: 'none', ambiguous: false, undecided: false })
}

/** Nothing mapped onto: a new element is created, an instance of the source element — once decided. */
function createdMapping(
	params: Pick<ResolvedMapping, 'reason' | 'ambiguous' | 'undecided'>,
): ResolvedMapping {
	const { reason, ambiguous, undecided } = params
	return { reason, ambiguous, locked: false, projectOwned: false, undecided }
}
