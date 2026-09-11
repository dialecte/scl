import { TOPOLOGY_EQUIPMENT_TAGS, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { cloneApplicationContent } from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Topology-layer take-over (extract direction): gathers a topology scope's content into a
 * self-contained target.
 *
 * 1. **Applications** under `scopeRef` - delegates to `cloneApplicationContent`, CONSUMING the
 *    application layer (Application + its composed `Function`s + type closure + satellites).
 * 2. **Standalone Functions** structurally under the scope that no Application already pulled in.
 * 3. **Equipment** (the topology layer's own content) placed back at its structural level.
 *
 * Each is placed at its structural level in `structure`. Direction-agnostic: returns the full
 * `CloneMapping[]`; the caller applies identity policy and `reference.applyUuidRemap`.
 *
 * This is the building block a bay-typical extract (and later SCD) composes.
 */
export async function cloneTopologyContent(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<TopologyStructuralTag>
		structure: TargetStructure
		/** Child tags to drop from clones (extract prunes provenance refs; keeps equipment). */
		omit?: OmitEntry<Config>[]
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, scopeRef, structure, omit } = params

	const mappings: Scl.CloneMapping[] = []
	const clonedSourceIds = new Set<string>()
	function record(added: Scl.CloneMapping[]): void {
		for (const mapping of added) {
			mappings.push(mapping)
			if (mapping.source.id) clonedSourceIds.add(mapping.source.id)
		}
	}

	// 1. Applications - consume the application layer (brings their composed Functions).
	for (const applicationRef of await applicationsUnderScope(sourceQuery, scopeRef)) {
		record(await cloneApplicationContent(tx, { sourceQuery, applicationRef, structure, omit }))
	}

	// 2. Standalone Functions under the scope not already pulled in by an Application.
	for (const functionRef of await functionsUnderScope(sourceQuery, scopeRef)) {
		if (clonedSourceIds.has(functionRef.id)) continue
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
	}

	// 3. Equipment - the topology layer's own content, placed at its structural level.
	for (const equipmentRef of await topLevelEquipmentUnderScope(sourceQuery, scopeRef)) {
		const targetParent = await resolveStructureRef(sourceQuery, equipmentRef, structure)
		const clone = await cloneTree(tx, { sourceQuery, ref: equipmentRef, targetParent, omit })
		if (clone) record(clone.mappings)
	}

	return mappings
}

/** Applications whose structural ancestry includes `scopeRef` (Substation / VoltageLevel / Bay). */
async function applicationsUnderScope(
	query: Core.Query<Config>,
	scopeRef: Scl.Ref<TopologyStructuralTag>,
): Promise<Scl.Ref<'Application'>[]> {
	const applications = await query.getRecordsByTagName('Application')

	const inScope: Scl.Ref<'Application'>[] = []
	for (const application of applications) {
		const ancestors = await query.findAncestors(application, { stopAtTagName: 'Substation' })
		if (ancestors.some((ancestor) => ancestor.id === scopeRef.id)) {
			inScope.push({ tagName: 'Application', id: application.id })
		}
	}
	return inScope
}

/** Top-level Functions whose structural ancestry includes `scopeRef`. */
async function functionsUnderScope(
	query: Core.Query<Config>,
	scopeRef: Scl.Ref<TopologyStructuralTag>,
): Promise<Scl.Ref<'Function'>[]> {
	const functions = await query.getRecordsByTagName('Function')

	const inScope: Scl.Ref<'Function'>[] = []
	for (const fn of functions) {
		const ancestors = await query.findAncestors(fn, { stopAtTagName: 'Substation' })
		if (ancestors.some((ancestor) => ancestor.id === scopeRef.id)) {
			inScope.push({ tagName: 'Function', id: fn.id })
		}
	}
	return inScope
}

/** Equipment directly under a structural level (Substation/VoltageLevel/Bay) within the scope. */
async function topLevelEquipmentUnderScope(
	query: Core.Query<Config>,
	scopeRef: Scl.Ref<TopologyStructuralTag>,
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const inScope: Scl.Ref<Scl.ElementsOf>[] = []
	for (const tag of TOPOLOGY_EQUIPMENT_TAGS) {
		const records = await query.getRecordsByTagName(tag)
		for (const equipment of records) {
			const ancestors = await query.findAncestors(equipment, { stopAtTagName: 'Substation' })
			if (!ancestors.some((ancestor) => ancestor.id === scopeRef.id)) continue
			// only top-level equipment; nested equipment rides its parent's clone tree
			if (
				ancestors[0] &&
				(TOPOLOGY_STRUCTURAL_TAGS as readonly string[]).includes(ancestors[0].tagName)
			) {
				inScope.push({ tagName: tag, id: equipment.id } as Scl.Ref<Scl.ElementsOf>)
			}
		}
	}
	return inScope
}
