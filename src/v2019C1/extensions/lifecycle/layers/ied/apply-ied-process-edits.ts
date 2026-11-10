import type { IedProcessPlan } from './ied-process.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Apply the planned changes to the written process part, through the clone mappings: the cut links and removed
 * mappings, then each LNode's specified naming, on the one it brought or on a new one.
 */
export async function applyIedProcessEdits(
	tx: Core.Transaction<Config>,
	params: { plan: IedProcessPlan; cloneMappings: readonly Scl.CloneMapping[] },
): Promise<void> {
	const { plan, cloneMappings } = params
	const targetOf = new Map(
		cloneMappings.map(function bySource(mapping) {
			return [mapping.source.id, mapping.target] as const
		}),
	)
	// `update` removes an attribute given `undefined`; the untyped surface takes string values only
	for (const edit of plan.edits) {
		const target = targetOf.get(edit.ref.id)
		if (target)
			await tx.any.update(target, { attributes: edit.attributes as Record<string, string> })
	}
	for (const naming of plan.namings) {
		const lnode = targetOf.get(naming.lnode.id)
		const specNaming = naming.specNaming && targetOf.get(naming.specNaming.id)
		if (specNaming)
			await tx.any.update(specNaming, { attributes: naming.attributes as Record<string, string> })
		else if (lnode?.id)
			await tx.addChild(
				{ tagName: 'LNode', id: lnode.id },
				{
					tagName: 'LNodeSpecNaming',
					attributes: definedAttributes(naming.attributes),
				},
			)
	}
}

function definedAttributes(
	attributes: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(attributes).filter(function isDefined(entry): entry is [string, string] {
			return entry[1] !== undefined
		}),
	)
}
