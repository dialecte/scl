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
 * With nothing to map onto, a new element is created; where several elements qualify equally,
 * none is picked and a new one is created too.
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
		}
	}
	if (decision) return createdMapping({ reason: 'decision', ambiguous: false })

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
		}
	}

	if (sameKey.length > 1) return createdMapping({ reason: 'name', ambiguous: true })
	if (sameLineage.length > 1) return createdMapping({ reason: 'lineage', ambiguous: true })
	return createdMapping({ reason: 'none', ambiguous: false })
}

/** Nothing to map onto: a new element is created, an instance of the source element. */
function createdMapping(params: Pick<ResolvedMapping, 'reason' | 'ambiguous'>): ResolvedMapping {
	return { reason: params.reason, ambiguous: params.ambiguous, locked: false, projectOwned: false }
}
