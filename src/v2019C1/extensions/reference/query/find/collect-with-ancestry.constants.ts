import { declaredNamespaces } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

/** The elements the walk of a read subtree goes through without reading them as part of it (`Private`). */
export const TRANSPARENT_TAGS: ReadonlySet<string> = new Set(
	SCL_DIALECTE_CONFIG.transparentElements,
)

/**
 * The namespaces each transparent tag is the dialecte's own in: a same-name element of another namespace (a vendor's
 * `Private`) is an ordinary element, as core's reads take it.
 */
export const TRANSPARENT_NAMESPACES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
	[...TRANSPARENT_TAGS].map(function namespacesOf(tagName) {
		const uris = declaredNamespaces({ dialecteConfig: SCL_DIALECTE_CONFIG, tagName }).map(
			function uriOf(namespace) {
				return namespace.uri
			},
		)
		return [tagName, new Set(uris)] as const
	}),
)
