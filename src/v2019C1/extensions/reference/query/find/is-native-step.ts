import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { AnyRawRecord } from '@dialecte/core'

/**
 * Whether one element of a read is the document's own content, given the record the read holds
 * above it. It must be defined by the dialecte in the namespace it carries. A read lifts the
 * children of a `Private` into the element holding it and leaves the `Private` out of the ancestry,
 * so an element whose parent is not the record above it went through one: only an element of an
 * extension namespace of the dialecte may do that (a function template, the inputs of an LNode),
 * never one of the namespace of the document.
 */
export function isNativeStep(params: {
	element: AnyRawRecord
	above: AnyRawRecord
	root: AnyRawRecord
}): boolean {
	const { element, above, root } = params
	const throughPrivate = element.parent?.id !== above.id
	if (throughPrivate && element.namespace.uri === root.namespace.uri) return false
	const definition = resolveDefinition({ dialecteConfig: SCL_DIALECTE_CONFIG, record: element })
	return element.namespace.uri === definition?.namespace.uri
}
