import { TRANSPARENT_ELEMENT_NAMESPACES } from './transparent-elements.constants'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

/**
 * Whether a tag is one of the dialecte's transparent wrappers (`transparentElements`: a `Private`): an element a tree
 * read shows the content of as its parent's, the content keeping the wrapper as its record parent. By tag only: a
 * pre-filter on refs, which carry no namespace; a decision on a record is {@link isOwnTransparentElement}'s, a vendor's
 * `Private` of another namespace being an ordinary element.
 */
export function isTransparentElement(tagName: string): boolean {
	return (SCL_DIALECTE_CONFIG.transparentElements as readonly string[]).includes(tagName)
}

/**
 * Whether a record is one of the dialecte's own transparent wrappers: a transparent tag in a namespace the definition
 * declares for it (an SCL `Private`), the element core's reads walk through. A vendor's `Private` of another namespace
 * is an ordinary element.
 *
 * @intent tell the SCL Private from a vendor element of the same name, check an element is a wrapper the reads walk through
 */
export function isOwnTransparentElement(params: {
	record: { tagName: string; namespace: { uri: string } }
}): boolean {
	const { record } = params
	return TRANSPARENT_ELEMENT_NAMESPACES.get(record.tagName)?.has(record.namespace.uri) ?? false
}
