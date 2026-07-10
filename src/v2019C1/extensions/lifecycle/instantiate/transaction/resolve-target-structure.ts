import { invariant } from '@dialecte/core/utils'

import type { Scl, Config } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Instantiation-direction counterpart of `ensureSubstationTemplateStructure`.
 *
 * Where `ensureSubstationTemplateStructure` *creates* the TEMPLATE
 * Substation/VoltageLevel/Bay scaffolding in an extraction target, this
 * *resolves* the already-existing structural levels from an instantiation
 * `targetParent`, so satellites (e.g. `FunctionCategory`) land at the matching
 * level in the target project.
 *
 * `targetParent` may be any valid `Function` container (`Bay`, `VoltageLevel`,
 * `Substation`, ...). The returned structure contains only the levels that
 * actually exist on the parent's ancestry (inclusive of the parent itself);
 * levels absent from the target are omitted. Callers that need a specific level
 * (a satellite scoped to it) get a clear failure from `resolveStructureRef`.
 */
export async function resolveTargetStructure(
	tx: Core.Transaction<Config>,
	targetParent: Scl.Ref<Scl.ElementsOf>,
): Promise<TargetStructure> {
	const parent = await tx.getRecord(targetParent)
	invariant(parent, {
		key: 'ELEMENT_NOT_FOUND',
		detail: `resolveTargetStructure: target parent not found: ${targetParent.tagName}#${targetParent.id}`,
	})

	const ancestors = await tx.findAncestors(targetParent, { stopAtTagName: 'Substation' })
	const chain = [parent, ...ancestors]

	const substation = chain.find((record) => record.tagName === 'Substation') as
		| Scl.RawRecord<'Substation'>
		| undefined
	const voltageLevel = chain.find((record) => record.tagName === 'VoltageLevel') as
		| Scl.RawRecord<'VoltageLevel'>
		| undefined
	const bay = chain.find((record) => record.tagName === 'Bay') as Scl.RawRecord<'Bay'> | undefined

	const structure: TargetStructure = {}
	if (substation) structure.Substation = substation
	if (voltageLevel) structure.VoltageLevel = voltageLevel
	if (bay) structure.Bay = bay
	return structure
}
