import { findMappingPolicy } from './mapping-policies'
import { pairInstanceSatellites } from './pair-instance-satellites'
import { resolveMapping } from './resolve-mapping'

import { toRef } from '@dialecte/core/helpers'

import type {
	DecisionMappings,
	InstanceSatellitePairing,
	MappingReader,
	PairInstanceSatellitesParams,
	ResolvedMapping,
	ResolvedMappings,
	ResolveSatelliteMappingsParams,
	SourceSatellite,
	StoredRef,
} from './mapping.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

/**
 * Where each shared element carried with a source primary lands in the project — read by the
 * report and by the apply alike, for a first placement and for an update.
 *
 * A shared element the instance being updated already holds an element for keeps that mapping
 * (`locked`, see {@link pairInstanceSatellites}). Any other — every one of them on a first
 * placement — is resolved by {@link resolveMapping}; where the instance holds an element that
 * could stand for it and nothing tells whether it does, it is flagged `ambiguous` until the
 * consumer's choices settle it. Elements whose tag declares no mapping
 * policy are not shared elements and are left out.
 */
export async function resolveSatelliteMappings(
	reader: MappingReader,
	params: ResolveSatelliteMappingsParams,
): Promise<ResolvedMappings> {
	const { sourceQuery, satelliteRefs, instanceSatelliteRefs = [], decisionMappings } = params
	const matchKey = params.matchKey ?? 'templateUuid'

	const sourceSatellites: SourceSatellite[] = []
	for (const satelliteRef of satelliteRefs) {
		const policy = findMappingPolicy(satelliteRef.tagName)
		const satelliteId = satelliteRef.id
		if (policy && satelliteId)
			sourceSatellites.push({ ref: { ...satelliteRef, id: satelliteId }, policy })
	}

	const storedInstanceRefs: StoredRef[] = []
	for (const instanceRef of instanceSatelliteRefs) {
		const instanceId = instanceRef.id
		if (instanceId) storedInstanceRefs.push({ ...instanceRef, id: instanceId })
	}

	const { pairs, undecidedSourceIds } = await pairWithDecisions(reader, {
		sourceQuery,
		sourceSatellites,
		instanceSatelliteRefs: storedInstanceRefs,
		decisionMappings,
		matchKey,
	})

	const resolvedMappings = new Map<string, ResolvedMapping>()
	for (const { ref, policy } of sourceSatellites) {
		const pair = pairs.get(ref.id)
		if (pair) {
			resolvedMappings.set(ref.id, {
				existing: pair.existing,
				reason: 'lineage',
				ambiguous: false,
				locked: true,
				projectOwned: pair.projectOwned,
			})
			continue
		}

		const resolved = await resolveMapping(reader, {
			sourceQuery,
			sourceRef: ref,
			policy,
			decision: decisionMappings?.get(ref.id),
			matchKey,
		})
		resolvedMappings.set(ref.id, {
			...resolved,
			// the instance holds an element for it, but nothing tells which: the consumer's to map
			ambiguous: resolved.ambiguous || (!resolved.existing && undecidedSourceIds.has(ref.id)),
		})
	}
	return resolvedMappings
}

/**
 * Pair the shared source elements with the elements the instance holds, the consumer's choices
 * taken into account: a choice made for an element nothing could pair settles it, so what is left
 * is paired again without it — nor the element of the instance it was mapped onto. A pairing the
 * instance carries without any choice is never undone by one.
 */
async function pairWithDecisions(
	reader: MappingReader,
	params: PairInstanceSatellitesParams & { decisionMappings?: DecisionMappings },
): Promise<InstanceSatellitePairing> {
	const { sourceSatellites, instanceSatelliteRefs, decisionMappings, ...pairingParams } = params

	const carried = await pairInstanceSatellites(reader, {
		...pairingParams,
		sourceSatellites,
		instanceSatelliteRefs,
	})

	const decidedSourceIds = new Set<string>()
	const chosenInstanceIds = new Set<string>()
	for (const sourceId of carried.undecidedSourceIds) {
		const decision = decisionMappings?.get(sourceId)
		if (!decision) continue
		decidedSourceIds.add(sourceId)
		if ('existing' in decision && decision.existing.id) chosenInstanceIds.add(decision.existing.id)
	}
	if (decidedSourceIds.size === 0) return carried

	const pairedInstanceIds = new Set([...carried.pairs.values()].map((pair) => pair.existing.id))
	const settled = await pairInstanceSatellites(reader, {
		...pairingParams,
		sourceSatellites: sourceSatellites.filter(
			(source) => !carried.pairs.has(source.ref.id) && !decidedSourceIds.has(source.ref.id),
		),
		instanceSatelliteRefs: instanceSatelliteRefs.filter(
			(instanceRef) =>
				!pairedInstanceIds.has(instanceRef.id) && !chosenInstanceIds.has(instanceRef.id),
		),
	})

	return {
		pairs: new Map([...carried.pairs, ...settled.pairs]),
		undecidedSourceIds: settled.undecidedSourceIds,
	}
}

/**
 * The redirect mappings of the shared elements that landed on an element of the project: a
 * reference to such a source element is a reference to that project element.
 */
export async function toRedirectMappings(params: {
	sourceQuery: Core.Query<Config>
	satelliteRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	resolvedMappings: ResolvedMappings
}): Promise<RedirectMapping[]> {
	const { sourceQuery, satelliteRefs, resolvedMappings } = params

	const redirectMappings: RedirectMapping[] = []
	for (const satelliteRef of satelliteRefs) {
		const existing = satelliteRef.id ? resolvedMappings.get(satelliteRef.id)?.existing : undefined
		if (!existing) continue
		const sourceUuid = await sourceQuery.any.getAttribute(satelliteRef, { name: 'uuid' })
		if (!sourceUuid) continue
		redirectMappings.push({ sourceUuid, target: toRef(existing) as Scl.Ref<Scl.ElementsOf> })
	}
	return redirectMappings
}
