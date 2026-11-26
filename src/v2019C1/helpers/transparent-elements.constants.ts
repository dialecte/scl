import { declaredNamespaces } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

/**
 * The namespaces each transparent tag is the dialecte's own in (the SCL one for a `Private`): a same-name element of
 * another namespace (a vendor's `Private`) is an ordinary element, as core's reads take it.
 */
export const TRANSPARENT_ELEMENT_NAMESPACES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
	(SCL_DIALECTE_CONFIG.transparentElements as readonly string[]).map(
		function namespacesOf(tagName) {
			const uris = declaredNamespaces({ dialecteConfig: SCL_DIALECTE_CONFIG, tagName }).map(
				function uriOf(namespace) {
					return namespace.uri
				},
			)
			return [tagName, new Set(uris)] as const
		},
	),
)
