import { buildElementPath } from './build-element-path'
import { buildReferencePath } from './build-reference-path'
import { composeDerivedAttributes, derivedAttributesFollowing } from './compose-derived-attributes'

import { PAIRS_BY_REF } from '@/v2019C1/extensions/reference/constants'

import type { ElementPath } from './path-segment.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { DerivedAttributeValue } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * The attributes a reference holds for `target`: the path of its pair, then the attributes it
 * writes from the target's path (a terminal's level names). Empty when the reference has no pair
 * to that target or the target has no path. Pass `targetPath` when several references share it,
 * so it is read once.
 */
export async function buildReferenceAttributes(
	query: Core.Query<Config>,
	params: {
		reference: Scl.Ref<Scl.ElementsOf>
		target: Scl.Ref<Scl.ElementsOf>
		targetPath?: ElementPath
	},
): Promise<DerivedAttributeValue[]> {
	const { reference, target } = params
	const pair = PAIRS_BY_REF.get(reference.tagName)?.find((entry) =>
		entry.targetTagNames.includes(target.tagName),
	)
	if (!pair) return []

	const targetPath = params.targetPath ?? (await buildElementPath(query, target))
	if (!targetPath) return []

	const path = await buildReferencePath(query, { reference, target, targetPath })
	const derived = derivedAttributesFollowing({
		tagName: reference.tagName,
		follows: pair.pathAttr,
	})
	return [
		...(path ? [{ name: pair.pathAttr, value: path }] : []),
		...(derived ? composeDerivedAttributes({ derived, sourcePath: targetPath }) : []),
	]
}

/**
 * The attributes an element writes from its own path (a connectivity node's `pathName`). Empty
 * for an element that writes none, or has no path.
 */
export async function buildOwnDerivedAttributes(
	query: Core.Query<Config>,
	params: { element: Scl.Ref<Scl.ElementsOf>; elementPath?: ElementPath },
): Promise<DerivedAttributeValue[]> {
	const { element } = params
	const derived = derivedAttributesFollowing({ tagName: element.tagName, follows: 'self' })
	if (!derived) return []

	const elementPath = params.elementPath ?? (await buildElementPath(query, element))
	if (!elementPath) return []
	return composeDerivedAttributes({ derived, sourcePath: elementPath })
}
