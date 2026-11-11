import { ensureTopologyFrame, resolveFrameStructure } from './ensure-topology-frame'
import { resolveFrameLandings } from './frame-landings'
import { resolveLandedLevels, withLandedLevels } from './landed-levels'
import { applicationsUnderScope, functionsUnderScope, resolveUnitPlacement } from './scope-content'

import {
	readSatelliteIndex,
	resolveAppliedSatelliteTargets,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { scopeCarriedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/carried-satellites'
import { readHeldApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications'
import {
	cloneApplicationContent,
	resolveRoleMappings,
} from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	findMissingReferencedRecords,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { readAttribute } from '@/v2019C1/helpers'

import type { CloneTopologyContentResult } from './clone-topology-content.types'
import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { IndexedSatellite } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord, OmitEntry } from '@dialecte/core'

/**
 * Topology-layer take-over: gathers a topology scope's content into a self-contained target.
 *
 * 1. **Frame** - reproduces the source structural skeleton (Substation/VoltageLevel/Bay + their
 *    own `Private`/BayType, equipment, connectivity) by name via {@link ensureTopologyFrame}. The
 *    topology layer OWNS this content, so it is carried here rather than fed in.
 * 2. **Applications** under `scopeRef` - delegates to `cloneApplicationContent`, CONSUMING the
 *    application layer (Application + its composed `Function`s + type closure + satellites).
 * 3. **Standalone Functions** structurally under the scope that no Application already pulled in, and the
 *    functions its Applications compose that no placed Application pulled in.
 *
 * What the consumer left out (`leftOut`) is not placed: a level takes what it holds with it (the
 * report makes what it holds depend on it), an application left out leaves the functions it
 * composes to step 3, wherever they sit.
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
		/** The key a project element carries a source element's uuid in, to find what it lands on. Default `templateUuid`. */
		matchKey?: MatchKey
	},
): Promise<CloneTopologyContentResult> {
	const { sourceQuery, scopeRef, targetParent, omit, decisionMappings, placementLevels } = params
	const { leftOut } = params
	function isLeftOut(ref: Scl.Ref<Scl.ElementsOf>): boolean {
		return Boolean(leftOut?.has(ref.id ?? ''))
	}
	const matchKey = params.matchKey ?? 'templateUuid'

	// what the project holds applying to what the placement lands on, read before anything is written, as the report
	// reads it; a placement resolved nowhere (an extract into a file of its own) lands on nothing the file holds
	const landings = await resolveFrameLandings(tx, {
		sourceQuery,
		placementLevels: placementLevels ?? [],
		matchKey,
	})
	const held = await readHeldApplications({ landings, projectQuery: tx, matchKey })
	// where the roles of the applications land, read before anything is written, as the report reads it: a role placed
	// for one application is not the one another application's role maps onto
	const applicationRefs = await applicationsUnderScope(sourceQuery, scopeRef)
	const roleMappings = await resolveRoleMappings(tx, {
		sourceQuery,
		applicationRefs: applicationRefs.filter(function isPlaced(applicationRef) {
			return !isLeftOut(applicationRef)
		}),
		decisionMappings,
		matchKey,
	})

	const frame = await ensureTopologyFrame(tx, {
		sourceQuery,
		scopeRef,
		targetParent,
		placementLevels,
		leftOut,
		matchKey: params.matchKey,
	})
	const { frameIndex } = frame
	// what the unit places beyond its subtree, and what the references of the applications' roles, and of what they
	// refer to, may name
	const placedUnit = await resolveUnitPlacement(sourceQuery, { scopeRef, applicationRefs, leftOut })
	// the levels above the unit land where the frame put them: a reference to one names it
	const landedLevels = await resolveLandedLevels(sourceQuery, {
		primaryRef: scopeRef,
		landsOn: function isReproduced(level) {
			return frameIndex.has(level.id)
		},
	})
	const unit = {
		...placedUnit,
		scope: withLandedLevels({ scope: placedUnit.scope, levels: landedLevels }),
	}

	const cloneMappings: Scl.CloneMapping[] = [...frame.cloneMappings]
	// what the roles of the applications refer to, placed by the caller with what applies to the unit; each once
	const referenced = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	const referencedBy = new Map<string, readonly Scl.Ref<Scl.ElementsOf>[]>()
	const referencedLeaveOut = new Set<string>()
	const satellitesNotPlaced = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	const placedRoots: Scl.Ref<Scl.ElementsOf>[] = []
	const redirectMappings: RedirectMapping[] = [...frame.redirectMappings]
	// what is placed so far (source record id -> its clone): an application composing a function another one placed,
	// or referring to what such a function holds, refers to that clone
	const placed = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	function record(added: Scl.CloneMapping[]): void {
		for (const mapping of added) {
			cloneMappings.push(mapping)
			if (mapping.source.id) placed.set(mapping.source.id, mapping.target)
		}
	}

	// what the functions of the unit hold is placed with them: a role referring to something there refers to that copy
	const standaloneFunctions = (await functionsUnderScope(sourceQuery, scopeRef)).filter(
		function isPlaced(functionRef) {
			return !isLeftOut(functionRef)
		},
	)
	// the satellites of the template, read once for every application and for the caller
	const index = await readSatelliteIndex(sourceQuery)
	// what the frame places of what applies to the unit and of what its levels hold: placed by the caller, resolved once
	const satellites = await resolveAppliedSatelliteTargets(sourceQuery, {
		primaryRef: scopeRef,
		composedRefs: unit.composedRefs,
		leftOut,
		frame: true,
		index,
		scope: unit.scope,
	})
	// and what the functions of the unit carry, read with the unit: references to what is not placed left out
	const carried = scopeCarriedSatellites({
		trees: unit.functionTrees,
		satellites: satellites.map(function indexedOf(satellite) {
			return index.get(satellite.satelliteRef.id ?? '') as IndexedSatellite
		}),
		scope: unit.scope,
		index,
		held,
	})
	// what the roles refer to inside a function the unit places later is that function's to place
	const placedLater = unit.functionContentIds

	// 1. Applications - consume the application layer (brings their composed Functions).
	for (const applicationRef of applicationRefs) {
		// an application left out leaves the functions it composes to the step below
		if (isLeftOut(applicationRef)) continue
		// capture the composed Functions before cloning (they are "missing" only until placed) so
		// each placed Function can be collision-checked at its structural level by the caller
		const composedFunctions = await findMissingReferencedRecords(tx, {
			sourceQuery,
			scopeRef: applicationRef,
			refTagName: 'FunctionRef',
			targetTagName: 'Function',
			alreadyCloned: new Set(placed.keys()),
		})
		const structure = await resolveFrameStructure(tx, sourceQuery, applicationRef, frameIndex)
		const applicationContent = await cloneApplicationContent(tx, {
			sourceQuery,
			applicationRef,
			structure,
			omit,
			decisionMappings,
			leftOut,
			matchKey: params.matchKey,
			alreadyPlaced: placed,
			scope: unit.scope,
			placedLater,
			index,
			carried,
			held,
			roles: roleMappings.get(applicationRef.id),
		})
		record(applicationContent.cloneMappings)
		redirectMappings.push(...applicationContent.redirectMappings)
		for (const satelliteRef of applicationContent.referenced.satelliteRefs)
			referenced.set(satelliteRef.id ?? '', satelliteRef)
		referencedBy.set(applicationRef.id, applicationContent.referenced.satelliteRefs)
		for (const id of applicationContent.referenced.leaveOut) referencedLeaveOut.add(id)
		for (const satelliteRef of applicationContent.satellitesNotPlaced)
			satellitesNotPlaced.set(satelliteRef.id ?? '', satelliteRef)
		placedRoots.push(applicationRef, ...composedFunctions)
	}

	// 2. Standalone Functions under the scope not already pulled in by an Application, and the functions the unit's
	// applications compose that none placed: a function is placed as its own decision says, whatever its applications'.
	// A category classifying several of them is placed once.
	const placedCategories = new Map<string, Scl.Ref<'FunctionCategory'>>()
	// one the project holds by its uuid already (a fork placed again) is the one the applications refer to: not written twice
	const heldFunctionIds = await findHeldFunctionIds(tx, { functionTrees: unit.functionTrees })
	for (const functionRef of [...standaloneFunctions, ...unit.composedRefs]) {
		if (placed.has(functionRef.id) || heldFunctionIds.has(functionRef.id)) continue
		const structure = await resolveFrameStructure(tx, sourceQuery, functionRef, frameIndex)
		const targetParentRef = await resolveStructureRef(sourceQuery, functionRef, structure)
		const functionMappings = await cloneFunction(tx, {
			sourceQuery,
			functionRef,
			targetParentRef,
			omit,
			leaveOut: carried.leaveOut,
		})
		record(functionMappings)
		const categories = await cloneFunctionCategories(tx, {
			sourceQuery,
			functionRef,
			structure,
			decisionMappings,
			placedCategories,
			matchKey: params.matchKey,
		})
		record(categories.cloneMappings)
		redirectMappings.push(...categories.redirectMappings)
		placedRoots.push(functionRef)
	}

	return {
		cloneMappings,
		placedRoots,
		frameIndex,
		redirectMappings,
		unit,
		referenced: { satelliteRefs: [...referenced.values()], leaveOut: referencedLeaveOut },
		referencedBy,
		satellitesNotPlaced: [...satellitesNotPlaced.values()],
		index,
		satellites,
		carried,
		held,
	}
}

/** The functions of the unit the project already holds by their uuid (source record ids), read from their trees: one read. */
async function findHeldFunctionIds(
	projectQuery: Core.Query<Config>,
	params: { functionTrees: readonly AnyTreeRecord[] },
): Promise<Set<string>> {
	const uuidsById = new Map(
		params.functionTrees.map(function uuidOf(tree) {
			return [tree.id, readAttribute({ record: tree, name: 'uuid', defaults: 'none' })] as const
		}),
	)
	const records = await projectQuery.findByAttributes({
		tagName: 'Function',
		attributes: { uuid: [...uuidsById.values()] },
	})
	const heldUuids = new Set(
		records.map(function uuidOf(record) {
			return readAttribute({ record, name: 'uuid', defaults: 'none' })
		}),
	)
	const held = new Set<string>()
	for (const [id, uuid] of uuidsById) if (heldUuids.has(uuid)) held.add(id)
	return held
}
