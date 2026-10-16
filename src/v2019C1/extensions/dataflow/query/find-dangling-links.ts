import type { DanglingLink } from '../dataflow.types'
import type { Scl } from '@/v2019C1/config'

/**
 * The links that name nothing: an attribute (a uuid, or an address when no uuid names the target)
 * written on `element` whose target was not found. A link whose attribute is not written is not
 * dangling, it is not made.
 */
export function findDanglingLinks(params: {
	element: Scl.Ref<Scl.ElementsOf>
	attributes: Readonly<Record<string, string>>
	links: readonly { attribute: string; found: boolean }[]
}): DanglingLink[] {
	const { element, attributes, links } = params
	return links.flatMap(({ attribute, found }) => {
		const value = attributes[attribute]
		return value && !found ? [{ element, attribute, value }] : []
	})
}
