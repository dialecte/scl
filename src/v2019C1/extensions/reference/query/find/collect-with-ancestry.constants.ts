import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

/** The elements the walk of a read subtree goes through without reading them as part of it (`Private`). */
export const TRANSPARENT_TAGS: ReadonlySet<string> = new Set(
	SCL_DIALECTE_CONFIG.transparentElements,
)
