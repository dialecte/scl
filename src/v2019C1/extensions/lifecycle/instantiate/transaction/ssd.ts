import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import {
	cloneTopologyContent,
	resolveFrameStructure,
	resolveInstantiableRoot,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { SsdParams, SsdResult } from './ssd.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the process-section content carried by an SSD into a target project.
 *
 * The topology layer OWNS its frame: `cloneTopologyContent` REPRODUCES the source structural
 * skeleton (Substation/VoltageLevel/Bay + BayType + equipment) by name under `targetParent`, then
 * consumes the application/function layers to place the Applications + their composed Functions +
 * standalone Functions (with the type closure) under the name-correct level. Cross-cutting satellites
 * travel too; then the identity policy applies (`stamp-template` for bay-typical reuse = fresh uuid +
 * templateUuid, `keep` for a project base = preserved uuids). The instantiation is recorded once as a
 * document-level `SclFileReference` under the target `Header > SourceFiles`.
 *
 * The scope defaults to the SSD's instantiable root (the first named level down the
 * `Substation -> VoltageLevel -> Bay` chain).
 */
export async function ssd(tx: Core.Transaction<Config>, params: SsdParams): Promise<SsdResult> {
	const { sourceQuery, scopeRef, targetParent, mode = 'stamp-template', overrides } = params

	const root = scopeRef ?? (await resolveInstantiableRoot(sourceQuery))
	if (!root) throw new Error('instantiate.ssd: no instantiable root found in the SSD')

	const {
		mappings: contentMappings,
		placedRoots,
		frameIndex,
	} = await cloneTopologyContent(tx, {
		sourceQuery,
		scopeRef: root,
		targetParent,
	})

	// External cross-cutting satellites (Variable / BehaviorDescription) applying to any
	// element in the scope subtree travel with it, placed at the scope's reproduced level.
	const scopeStructure = await resolveFrameStructure(tx, sourceQuery, root, frameIndex)
	const appliedMappings = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: root,
		structure: scopeStructure,
		strip: false,
	})

	const allMappings = [...contentMappings, ...appliedMappings]

	// Stamp/keep lineage + fix up refs (remap for stamp, restore for keep) in one seam.
	await finalizeClonedIdentity(tx, { mappings: allMappings, mode })

	if (mode !== 'keep') {
		// resolve a name collision on the CREATED frame scope root itself (instantiating one
		// bay-typical twice under a VoltageLevel yields two distinct bays -> bump B1 to B1_1). The
		// scope root's structural parent is its reproduced ancestor level (the SCL root for a
		// Substation root, which has no structural ancestor). Fork/keep preserves identity, no bump.
		const rootTarget = frameIndex.get(root.id)
		if (rootTarget) {
			const rootParent =
				root.tagName === 'Substation'
					? targetParent
					: await resolveStructureRef(sourceQuery, root, scopeStructure)
			await resolvePlacementCollision(tx, {
				ref: rootTarget,
				parentRef: rootParent,
				overrides: root.id ? overrides?.get(root.id) : undefined,
			})
		}

		// resolve a name collision for each placed root at its own reproduced structural level (a
		// repeated instantiate reuses the frame, so a second instance would otherwise duplicate a
		// name among siblings). Fork/keep preserves identity, so it never bumps.
		for (const placed of placedRoots) {
			const sourceId = placed.id
			if (!sourceId) continue
			const placedMapping = allMappings.find((mapping) => mapping.source.id === sourceId)
			if (!placedMapping) continue
			const structure = await resolveFrameStructure(tx, sourceQuery, placed, frameIndex)
			const parentRef = await resolveStructureRef(sourceQuery, placed, structure)
			await resolvePlacementCollision(tx, {
				ref: placedMapping.target,
				parentRef,
				overrides: overrides?.get(sourceId),
			})
		}
	}

	// One document-level provenance link back to the source SSD.
	await writeProvenance(tx, { sourceQuery, target: { anchor: 'document', fileType: 'SSD' } })

	return { scopeRef: root, recordMappings: contentMappings }
}
