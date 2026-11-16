import { nameCreatedSharedElements } from './name-created-shared-elements'

import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import {
	assertPlacementDecided,
	cloneTopologyContent,
	landGroundedTerminals,
	resolveFrameStructure,
	resolvePlacementMappings,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type {
	ClonedProcessSection,
	CloneProcessSectionParams,
	SettleProcessSectionParams,
} from './process-section.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * The clone step of placing a process section (a substation scope and what it holds) in a project, before the
 * identity of what it wrote is settled: where each level lands (the answer the report listed), the frame and the
 * functions and applications it holds, then the cross-cutting satellites that travel with them (Variable /
 * BehaviorDescription applying to the scope, or to a function its applications compose, those a level of it holds,
 * what the roles of its applications refer to), placed at their reproduced level, one of each per instance.
 * `undefined` when the consumer left everything out: nothing written.
 */
export async function cloneProcessSection(
	tx: Core.Transaction<Config>,
	params: CloneProcessSectionParams,
): Promise<ClonedProcessSection | undefined> {
	const { sourceQuery, scope, targetParent, policy, decisionMappings } = params
	const { root } = scope
	// what the consumer left out, and the units of the scaffolding the scope does not hold
	const leftOut = new Set([...(params.leftOut ?? []), ...scope.leftOut])

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

	const content = await cloneTopologyContent(tx, {
		sourceQuery,
		scopeRef: root,
		targetParent,
		decisionMappings,
		placementLevels,
		leftOut,
		matchKey: policy.matchKey,
	})
	// the consumer left everything out: nothing is written
	if (params.leftOut?.size && content.cloneMappings.length === 0) return undefined

	const scopeStructure = await resolveFrameStructure(tx, sourceQuery, root, content.frameIndex)
	const applied = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: root,
		structure: scopeStructure,
		leftOut,
		bumpsCollisions: policy.bumpsCollisions,
		// resolved and scoped once, with what the project held
		satellites: content.satellites,
		carried: content.carried,
		index: content.index,
		held: content.held,
		// what their references may name: what the unit places
		scope: content.unit.scope,
		frame: { cloneMappings: content.cloneMappings, redirectMappings: content.redirectMappings },
		referenced: content.referenced,
	})

	return {
		root,
		cloneMappings: [...content.cloneMappings, ...applied.cloneMappings],
		redirectMappings: content.redirectMappings,
		placementLevels,
		frameIndex: content.frameIndex,
		placedRoots: content.placedRoots,
		scopeStructure,
	}
}

/**
 * The settle step of placing a process section, once the identity of what it wrote is final: a name collision on the
 * scope root and on each placed root resolved at its own level, the terminals on the predefined grounded node named,
 * the shared elements created named at their level of the frame.
 */
export async function settleProcessSection(
	tx: Core.Transaction<Config>,
	params: SettleProcessSectionParams,
): Promise<void> {
	const { sourceQuery, cloned, policy, decisionMappings } = params
	if (policy.bumpsCollisions) await placeRootsUniquely(tx, params)

	// a terminal on the predefined grounded node names it by the path of its bay as placed, now named
	await landGroundedTerminals(tx, {
		sourceQuery,
		cloneMappings: params.cloneMappings,
		placedLevels: cloned.frameIndex,
	})

	// a shared element created here (no project element to map onto) is named at its level of the frame
	async function frameStructure(sourceRef: Scl.Ref<Scl.ElementsOf>): Promise<TargetStructure> {
		return resolveFrameStructure(tx, sourceQuery, sourceRef, cloned.frameIndex)
	}
	await nameCreatedSharedElements(tx, {
		sourceQuery,
		cloneMappings: [...params.cloneMappings],
		resolveStructure: frameStructure,
		decisionMappings,
	})
}

/**
 * A name collision on the CREATED scope root (instantiating one bay typical twice under a voltage level gives two
 * bays: B1, B1_1), then on each placed root at its own reproduced structural level (a repeated instantiate reuses the
 * frame, so a second instance would otherwise duplicate a name among siblings). A root mapped onto an element of the
 * project is that element: it keeps its name.
 */
async function placeRootsUniquely(
	tx: Core.Transaction<Config>,
	params: SettleProcessSectionParams,
): Promise<void> {
	const { sourceQuery, cloned, targetParent, overrides } = params
	const { root, placementLevels, frameIndex, scopeStructure } = cloned
	const rootLevel = placementLevels.find((level) => level.sourceRef.id === root.id)
	const rootTarget = rootLevel?.resolved.existing ? undefined : frameIndex.get(root.id)
	if (rootTarget) {
		// its structural parent: its reproduced ancestor level, the project's root for a substation
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

	for (const placed of cloned.placedRoots) {
		const sourceId = placed.id
		if (!sourceId) continue
		const placedMapping = params.cloneMappings.find((mapping) => mapping.source.id === sourceId)
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
