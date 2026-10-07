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
import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
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
 * What the consumer left out (`leftOut`) is not placed: a level takes what it holds with it (the
 * report makes what it holds depend on it), an application left out leaves the functions it
 * composes to step 3.
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
		/** The consumer's choices for the shared elements the applications refer to. */
		decisionMappings?: DecisionMappings
		/** Where each structural level lands, as resolved for a placement. */
		placementLevels?: readonly PlacementLevel[]
		/** The source elements the consumer left out (record ids): a level, an application, a function. */
		leftOut?: ReadonlySet<string>
	},
): Promise<CloneTopologyContentResult> {
	const { sourceQuery, scopeRef, targetParent, omit, decisionMappings, placementLevels } = params
	const { leftOut } = params
	const isLeftOut = (ref: Scl.Ref<Scl.ElementsOf>) => Boolean(leftOut?.has(ref.id ?? ''))

	const frame = await ensureTopologyFrame(tx, {
		sourceQuery,
		scopeRef,
		targetParent,
		omit,
		placementLevels,
		leftOut,
	})
	const { frameIndex } = frame

	const cloneMappings: Scl.CloneMapping[] = [...frame.cloneMappings]
	const placedRoots: Scl.Ref<Scl.ElementsOf>[] = []
	const redirectMappings: RedirectMapping[] = [...frame.redirectMappings]
	const clonedSourceIds = new Set<string>()
	function record(added: Scl.CloneMapping[]): void {
		for (const mapping of added) {
			cloneMappings.push(mapping)
			if (mapping.source.id) clonedSourceIds.add(mapping.source.id)
		}
	}

	// 1. Applications - consume the application layer (brings their composed Functions).
	for (const applicationRef of await applicationsUnderScope(sourceQuery, scopeRef)) {
		// an application left out leaves the functions it composes to the step below
		if (isLeftOut(applicationRef)) continue
		// capture the composed Functions before cloning (they are "missing" only until placed) so
		// each placed Function can be collision-checked at its structural level by the caller
		const composedFunctions = await findMissingReferencedRecords(tx, {
			sourceQuery,
			scopeRef: applicationRef,
			refTagName: 'FunctionRef',
			targetTagName: 'Function',
		})
		const structure = await resolveFrameStructure(tx, sourceQuery, applicationRef, frameIndex)
		const applicationContent = await cloneApplicationContent(tx, {
			sourceQuery,
			applicationRef,
			structure,
			omit,
			decisionMappings,
			leftOut,
		})
		record(applicationContent.cloneMappings)
		redirectMappings.push(...applicationContent.redirectMappings)
		placedRoots.push(applicationRef, ...composedFunctions)
	}

	// 2. Standalone Functions under the scope not already pulled in by an Application.
	// A category classifying several of them is placed once.
	const placedCategories = new Map<string, Scl.Ref<'FunctionCategory'>>()
	for (const functionRef of await functionsUnderScope(sourceQuery, scopeRef)) {
		if (clonedSourceIds.has(functionRef.id) || isLeftOut(functionRef)) continue
		const structure = await resolveFrameStructure(tx, sourceQuery, functionRef, frameIndex)
		const targetParentRef = await resolveStructureRef(sourceQuery, functionRef, structure)
		record(await cloneFunction(tx, { sourceQuery, functionRef, targetParentRef, omit }))
		const categories = await cloneFunctionCategories(tx, {
			sourceQuery,
			functionRef,
			structure,
			stripCategoriesUuid: false,
			decisionMappings,
			placedCategories,
		})
		record(categories.cloneMappings)
		redirectMappings.push(...categories.redirectMappings)
		placedRoots.push(functionRef)
	}

	return { cloneMappings, placedRoots, frameIndex, redirectMappings }
}
