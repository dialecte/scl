import { ensureSubstationTemplateStructure } from './ensure-substation-structure'

import { throwDialecteError } from '@dialecte/core'

import { CHILDREN } from '@/v2019C1/definition'
import { SCL_ERRORS } from '@/v2019C1/errors'
import { templateTagOf } from '@/v2019C1/extensions/lifecycle/engine/instance-tag'
import { findFunctionCategoryIds } from '@/v2019C1/extensions/lifecycle/layers/function'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { ROOT_ANCHORS } from '@/v2019C1/extensions/reference/transaction/write-provenance.constants'
import { isNamespaceWrapper, isTopologyLevel } from '@/v2019C1/helpers'

import type { FunctionFrame, FunctionPlacement } from './extract.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord, OmitEntry } from '@dialecte/core'

/**
 * Where an FSD holds the function it is extracted for, and the `TEMPLATE` levels its categories are placed at: below the
 * `TEMPLATE` level matching the one the function sits at in the source (`source-level`), below the `TEMPLATE`
 * substation (`substation`), or as a function template below the document root, with no level (`function-template`).
 * The `TEMPLATE` substation, voltage level and bay are written whatever the level: a substation holds a voltage level,
 * a voltage level a bay.
 */
export async function placeFunction(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		placement: FunctionPlacement
	},
): Promise<FunctionFrame> {
	const { sourceQuery, functionRef, placement } = params
	switch (placement) {
		case 'substation': {
			const structure = await ensureSubstationTemplateStructure(tx)
			const { Substation } = structure
			return { parent: { tagName: 'Substation', id: Substation.id }, structure, asTemplate: false }
		}
		case 'source-level': {
			await assertSitsInSubstation(sourceQuery, { functionRef })
			const structure = await ensureSubstationTemplateStructure(tx)
			const parent = await resolveStructureRef(sourceQuery, functionRef, structure)
			return { parent, structure, asTemplate: false }
		}
		case 'function-template': {
			const root = await tx.getRoot()
			return { parent: { tagName: 'SCL', id: root.id }, structure: {}, asTemplate: true }
		}
	}
}

/**
 * Refuse a function that sits in a line or a process with `placement: 'source-level'`: an FSD holding it at such a level
 * is not written yet (`OPTION_NOT_AVAILABLE`, `meta: { option: 'placement', value: 'source-level' }`); it is extracted
 * below the `TEMPLATE` substation or as a function template.
 */
async function assertSitsInSubstation(
	sourceQuery: Core.Query<Config>,
	params: { functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'> },
): Promise<void> {
	const { functionRef } = params
	const ancestors = await sourceQuery.findAncestors(functionRef)
	if (ancestors.some((ancestor) => isTopologyLevel(ancestor.tagName))) return
	throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
		detail: `${functionRef.tagName} ${functionRef.id} sits at no substation, voltage level or bay: an FSD holding it at its own level is not written yet`,
		meta: { option: 'placement', value: 'source-level' },
	})
}

/**
 * Refuse a function a function template cannot hold as it would be written (`omit` left out) — the transaction is
 * refused, nothing is written: an element at the function's or a subfunction's own level the template has no place for (what is in its
 * logical nodes and its equipment is held), or categories classifying it, which a template with no level has no place
 * for either. The function's own file reference is one unless its link is broken (it then goes).
 * `FUNCTION_TEMPLATE_CANNOT_HOLD`, `meta: { tags }`.
 */
export async function assertFunctionTemplateHolds(
	sourceQuery: Core.Query<Config>,
	params: {
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		omit: OmitEntry<Config>[]
		withCategories: boolean
		withOwnProvenance: boolean
	},
): Promise<void> {
	const { functionRef, omit, withCategories, withOwnProvenance } = params
	const tree = await sourceQuery.getTree(functionRef, { omit, unwrap: [] })
	const unheld = new Set<string>()
	if (tree) {
		// the reference to the file the function was placed from goes with a broken link
		const ignored = withOwnProvenance ? [] : [ROOT_ANCHORS.function.tag]
		collectUnheld({ node: tree, templateTag: 'FunctionTemplate', unheld, ignored })
	}
	const categoryIds = withCategories
		? await findFunctionCategoryIds(sourceQuery, { functionRef })
		: new Set<string>()
	if (categoryIds.size > 0) unheld.add('FunctionCategory')
	if (unheld.size === 0) return

	const tags = [...unheld].sort()
	throwDialecteError(SCL_ERRORS.FUNCTION_TEMPLATE_CANNOT_HOLD, {
		detail: `A function template cannot hold ${tags.join(', ')}`,
		meta: { tags },
	})
}

/**
 * The tags below a function (or a subfunction) its template cannot hold: a child the template element does not declare,
 * a `Private` (the dialecte writes none in a function template yet), and what a `Private` of the dialecte's own elements
 * wraps. `ignored`: the tags the function itself may hold all the same, at its own level only.
 */
function collectUnheld(params: {
	node: AnyTreeRecord
	templateTag: string
	unheld: Set<string>
	ignored: readonly string[]
}): void {
	const { node, templateTag, unheld, ignored } = params
	const held: readonly string[] = CHILDREN[templateTag as keyof typeof CHILDREN] ?? []
	for (const child of node.tree) {
		const childTemplateTag = templateTagOf(child.tagName)
		if (childTemplateTag !== child.tagName && held.includes(childTemplateTag)) {
			collectUnheld({ node: child, templateTag: childTemplateTag, unheld, ignored: [] })
			continue
		}
		if (held.includes(child.tagName)) continue
		if (isNamespaceWrapper({ record: child })) {
			const wrapped = child.tree.filter((element) => !ignored.includes(element.tagName))
			for (const element of wrapped) unheld.add(element.tagName)
			continue
		}
		unheld.add(child.tagName)
	}
}
