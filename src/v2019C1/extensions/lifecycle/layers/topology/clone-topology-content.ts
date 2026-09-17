import { ensureTopologyFrame, resolveFrameStructure } from './ensure-topology-frame'
import { applicationsUnderScope, functionsUnderScope } from './scope-content'

import { cloneApplicationContent } from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	findMissingReferencedRecords,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { CloneTopologyContentResult } from './clone-topology-content.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Topology-layer take-over: gathers a topology scope's content into a self-contained target.
 *
 * 1. **Frame** - reproduces the source structural skeleton (Substation/VoltageLevel/Bay + their
 *    own `Private`/BayType, equipment, connectivity) by name via {@link ensureTopologyFrame}. The
 *    topology layer OWNS this content, so it is carried here rather than fed in.
 * 2. **Applications** under `scopeRef` - delegates to `cloneApplicationContent`, CONSUMING the
 *    application layer (Application + its composed `Function`s + type closure + satellites).
 * 3. **Standalone Functions** structurally under the scope that no Application already pulled in.
 *
 * Each fn/app is placed under its name-correct reproduced level (via the frame index), so multiple
 * bays never collapse. Direction-agnostic: returns the full `CloneMapping[]` plus the placed roots
 * and the frame index; the caller applies identity policy, `applyUuidRemap`, and placement-collision.
 *
 * This is the building block a bay-typical instantiate/extract (and later SCD) composes.
 */
export async function cloneTopologyContent(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<TopologyStructuralTag>
		/** The target element the reproduced frame is rooted under (typically the SCL root). */
		targetParent: Scl.Ref<Scl.ElementsOf>
		/** Child tags to drop from clones (extract prunes provenance refs). */
		omit?: OmitEntry<Config>[]
	},
): Promise<CloneTopologyContentResult> {
	const { sourceQuery, scopeRef, targetParent, omit } = params

	const { frameIndex, mappings: frameMappings } = await ensureTopologyFrame(tx, {
		sourceQuery,
		scopeRef,
		targetParent,
		omit,
	})

	const mappings: Scl.CloneMapping[] = [...frameMappings]
	const placedRoots: Scl.Ref<Scl.ElementsOf>[] = []
	const clonedSourceIds = new Set<string>()
	function record(added: Scl.CloneMapping[]): void {
		for (const mapping of added) {
			mappings.push(mapping)
			if (mapping.source.id) clonedSourceIds.add(mapping.source.id)
		}
	}

	// 1. Applications - consume the application layer (brings their composed Functions).
	for (const applicationRef of await applicationsUnderScope(sourceQuery, scopeRef)) {
		// capture the composed Functions before cloning (they are "missing" only until placed) so
		// each placed Function can be collision-checked at its structural level by the caller
		const composedFunctions = await findMissingReferencedRecords(tx, {
			sourceQuery,
			scopeRef: applicationRef,
			refTagName: 'FunctionRef',
			targetTagName: 'Function',
		})
		const structure = await resolveFrameStructure(tx, sourceQuery, applicationRef, frameIndex)
		record(await cloneApplicationContent(tx, { sourceQuery, applicationRef, structure, omit }))
		placedRoots.push(applicationRef, ...composedFunctions)
	}

	// 2. Standalone Functions under the scope not already pulled in by an Application.
	for (const functionRef of await functionsUnderScope(sourceQuery, scopeRef)) {
		if (clonedSourceIds.has(functionRef.id)) continue
		const structure = await resolveFrameStructure(tx, sourceQuery, functionRef, frameIndex)
		const targetParentRef = await resolveStructureRef(sourceQuery, functionRef, structure)
		record(await cloneFunction(tx, { sourceQuery, functionRef, targetParentRef, omit }))
		record(
			await cloneFunctionCategories(tx, {
				sourceQuery,
				functionRef,
				structure,
				stripCategoriesUuid: false,
			}),
		)
		placedRoots.push(functionRef)
	}

	return { mappings, placedRoots, frameIndex }
}
