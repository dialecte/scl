import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { CHILDREN } from '@/v2019C1/definition/constants.generated'

const [FUNCTION_REF_PAIR] = UUID_REFERENCE_PAIRS.FunctionRef

/** The function-like tags a `FunctionRef` names, as the reference registry declares them. */
export const FUNCTION_TAGS = FUNCTION_REF_PAIR.target

/** The attributes of a `FunctionRef` naming its function: by uuid, or by path. */
export const FUNCTION_REF_ATTRIBUTES = FUNCTION_REF_PAIR.attribute

/**
 * The tags read below the functions of a role: the LNodes, and every tag between a function-like and an LNode it holds
 * (the walk in document order goes through them). Derived from the definition; transparent elements are left out, so
 * an LNode wrapped in vendor payload is not one of the role's.
 */
export const LNODE_PATH_TAGS: readonly string[] = tagsLeadingTo({
	from: FUNCTION_TAGS,
	to: 'LNode',
})

/** The tags reachable from `from` (included) from which `to` is reachable, and `to` itself. */
function tagsLeadingTo(params: { from: readonly string[]; to: string }): string[] {
	const children: Readonly<Record<string, readonly string[] | undefined>> = CHILDREN
	const transparent = new Set<string>(SCL_DIALECTE_CONFIG.transparentElements)
	const reachable = new Set<string>()
	const pending = [...params.from]
	while (pending.length > 0) {
		const tagName = pending.pop() as string
		if (reachable.has(tagName) || transparent.has(tagName)) continue
		reachable.add(tagName)
		pending.push(...(children[tagName] ?? []))
	}
	const leading = new Set<string>([params.to])
	let grew = true
	while (grew) {
		grew = false
		for (const tagName of reachable) {
			if (leading.has(tagName)) continue
			if (!(children[tagName] ?? []).some((child) => leading.has(child))) continue
			leading.add(tagName)
			grew = true
		}
	}
	return [...reachable].filter((tagName) => leading.has(tagName))
}
