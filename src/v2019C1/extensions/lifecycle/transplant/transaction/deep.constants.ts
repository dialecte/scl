import { declaredNamespaces } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

/** The namespaces the definition declares a `Private` in: a same-name element of any other is a vendor's own. */
export const SCL_PRIVATE_NAMESPACES = declaredNamespaces({
	dialecteConfig: SCL_DIALECTE_CONFIG,
	tagName: 'Private',
})
