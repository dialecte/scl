import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

/**
 * Whether a tag is one of the dialecte's transparent wrappers (`transparentElements`: a `Private`): an element a tree
 * read shows the content of as its parent's, the content keeping the wrapper as its record parent.
 */
export function isTransparentElement(tagName: string): boolean {
	return (SCL_DIALECTE_CONFIG.transparentElements as readonly string[]).includes(tagName)
}
