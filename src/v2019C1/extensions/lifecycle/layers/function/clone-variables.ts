import { resolveAppliedSatellites } from '@/v2019C1/extensions/lifecycle/satellites/applied-satellites'
import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Clones the external `Variable` elements that apply to ANY element in the
 * function subtree (a cross-cutting satellite — 90-30 §12.1) into the target,
 * each placed at its source structural level. Discovery is the generic
 * `resolveAppliedSatellites` (subtree-wide, internal/external-guarded); Variables
 * living inside the function subtree are cloned by `deep`, not here. UUID
 * remapping is handled by the afterDeepClone hook; the caller stamps lineage via
 * `writeIdentity`.
 */
export async function cloneVariables(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		structure: TargetStructure
		stripVariablesUuid?: boolean
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, functionRef, structure, stripVariablesUuid = true } = params

	const variableIds = await collectApplyingVariableIds(sourceQuery, functionRef)

	const mappings: Scl.CloneMapping[] = []
	for (const variableId of variableIds) {
		if (await isVariableAlreadyCloned(tx, sourceQuery, variableId)) continue

		const variableRef: Scl.Ref<'Variable'> = { tagName: 'Variable', id: variableId }
		const targetParent = await resolveStructureRef(sourceQuery, variableRef, structure)

		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: variableRef,
			targetParent,
			...(stripVariablesUuid ? {} : { strip: false as const }),
		})
		if (clone) mappings.push(...clone.mappings)
	}
	return mappings
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The external Variable ids that apply to any element in the function subtree. */
async function collectApplyingVariableIds(
	sourceQuery: Core.Query<Config>,
	functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>,
): Promise<Set<string>> {
	const satellites = await resolveAppliedSatellites(sourceQuery, { primaryRef: functionRef })
	return new Set(satellites.map((ref) => ref.id).filter((id): id is string => Boolean(id)))
}

async function isVariableAlreadyCloned(
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
	variableId: string,
): Promise<boolean> {
	const sourceVar = await sourceQuery.getRecord({ tagName: 'Variable' as const, id: variableId })
	if (!sourceVar) return false

	const name = await sourceQuery.getAttribute(sourceVar, { name: 'name' })
	if (!name) return false

	const [existing] = await tx.findByAttributes({ tagName: 'Variable', attributes: { name } })
	return Boolean(existing)
}
