import { nameCreatedSharedElements } from './name-created-shared-elements'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { resolveContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import {
	assertPlacementDecided,
	cloneTopologyContent,
	resolveFrameStructure,
	resolvePlacementMappings,
	resolveSsdScope,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { SsdParams, SsdResult } from './ssd.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the process-section content carried by an SSD into a target project.
 *
 * The topology layer OWNS its frame: `cloneTopologyContent` REPRODUCES the source structural
 * skeleton (Substation/VoltageLevel/Bay + BayType + equipment) by name under `targetParent`, then
 * consumes the application/function layers to place the Applications + their composed Functions +
 * standalone Functions (with the type closure) under the name-correct level. Cross-cutting satellites
 * travel too; then the identity the scenario places with applies (a new instance, for bay-typical reuse = fresh
 * uuid + templateUuid; a fork, for a project base = preserved uuids). The placement is recorded once as a
 * document-level `SclFileReference` under the target `Header > SourceFiles`, in every scenario.
 *
 * The scope is the element the consumer names; the `TEMPLATE` scaffolding, named or read from the file when
 * nothing is, is walked down `Substation -> VoltageLevel -> Bay` to the unit it holds (see `resolveSsdScope`).
 */
export async function ssd(tx: Core.Transaction<Config>, params: SsdParams): Promise<SsdResult> {
	const { sourceQuery, scopeRef, targetParent, overrides } = params
	const decisionMappings = params.decisionMappings
	const policy = scenarioPolicy({ scenario: params.scenario ?? 'instantiate' })

	const scope = await resolveSsdScope(sourceQuery, { ref: scopeRef })
	if (!scope) {
		throwDialecteError(SCL_ERRORS.TEMPLATE_ROOT_NOT_FOUND, {
			detail: 'instantiate.ssd: no instantiable root found in the SSD',
		})
	}
	const { root } = scope
	// what the consumer left out, and the units of the scaffolding the scope does not hold
	const leftOut = mergeLeftOut({ consumer: params.leftOut, scope: scope.leftOut })

	// where each level of the template lands — the answer the report listed
	const placementLevels = await resolvePlacementMappings(tx, {
		sourceQuery,
		scopeRef: root,
		anchor: targetParent,
		decisionMappings,
		rootIsContext: scope.scaffolding,
		leftOut: scope.leftOut,
	})

	assertPlacementDecided({ placementLevels, operation: 'instantiate.ssd' })

	const {
		cloneMappings: contentMappings,
		placedRoots,
		frameIndex,
		redirectMappings,
	} = await cloneTopologyContent(tx, {
		sourceQuery,
		scopeRef: root,
		targetParent,
		decisionMappings,
		placementLevels,
		leftOut,
		matchKey: policy.matchKey,
	})
	// the consumer left everything out: nothing is written, not even where it came from
	if (params.leftOut?.size && contentMappings.length === 0)
		return { scopeRef: root, cloneMappings: [] }

	// External cross-cutting satellites (Variable / BehaviorDescription) applying to any
	// element in the scope subtree travel with it, placed at the scope's reproduced level, one of each per instance.
	const scopeStructure = await resolveFrameStructure(tx, sourceQuery, root, frameIndex)
	// what their references may name: what the scope places
	const placementScope = await resolveContributionScope(sourceQuery, { roots: [root], leftOut })
	const applied = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: root,
		structure: scopeStructure,
		leftOut,
		bumpsCollisions: policy.bumpsCollisions,
		scope: placementScope,
	})

	const allMappings = [...contentMappings, ...applied.cloneMappings]

	// Stamp/keep lineage + fix up refs (remap for stamp, restore for keep) in one seam.
	await finalizeClonedIdentity(tx, {
		cloneMappings: allMappings,
		mode: policy.placementIdentity,
		redirectMappings,
	})

	if (policy.bumpsCollisions) {
		// resolve a name collision on the CREATED frame scope root itself (instantiating one
		// bay-typical twice under a VoltageLevel yields two distinct bays -> bump B1 to B1_1). The
		// scope root's structural parent is its reproduced ancestor level (the SCL root for a
		// Substation root, which has no structural ancestor).
		// a root mapped onto an element of the project is that element: it keeps its name
		const rootLevel = placementLevels.find((level) => level.sourceRef.id === root.id)
		const rootTarget = rootLevel?.resolved.existing ? undefined : frameIndex.get(root.id)
		if (rootTarget) {
			const rootParent =
				root.tagName === 'Substation'
					? targetParent
					: await resolveStructureRef(sourceQuery, root, scopeStructure)
			await placeUniquely(tx, {
				ref: rootTarget,
				parentRef: rootParent,
				overrides: root.id ? overrides?.get(root.id) : undefined,
			})
		}

		// resolve a name collision for each placed root at its own reproduced structural level (a
		// repeated instantiate reuses the frame, so a second instance would otherwise duplicate a
		// name among siblings).
		for (const placed of placedRoots) {
			const sourceId = placed.id
			if (!sourceId) continue
			const placedMapping = allMappings.find((mapping) => mapping.source.id === sourceId)
			if (!placedMapping) continue
			const structure = await resolveFrameStructure(tx, sourceQuery, placed, frameIndex)
			const parentRef = await resolveStructureRef(sourceQuery, placed, structure)
			await placeUniquely(tx, {
				ref: placedMapping.target,
				parentRef,
				overrides: overrides?.get(sourceId),
			})
		}
	}

	// a shared element created here (no project element to map onto) is named at its level of the frame
	async function frameStructure(sourceRef: Scl.Ref<Scl.ElementsOf>): Promise<TargetStructure> {
		return resolveFrameStructure(tx, sourceQuery, sourceRef, frameIndex)
	}
	await nameCreatedSharedElements(tx, {
		sourceQuery,
		cloneMappings: allMappings,
		resolveStructure: frameStructure,
		decisionMappings,
	})

	// One document-level provenance link back to the source SSD.
	await writeProvenance(tx, { sourceQuery, target: { anchor: 'document', fileType: 'SSD' } })

	return { scopeRef: root, cloneMappings: allMappings }
}

/** The record ids left out: the consumer's, with those of the units the scope does not hold. */
function mergeLeftOut(params: {
	consumer: ReadonlySet<string> | undefined
	scope: ReadonlySet<string>
}): ReadonlySet<string> {
	const { consumer, scope } = params
	return new Set([...(consumer ?? []), ...scope])
}
