import { isNativeRecord } from './is-native-record'

import type { AnyRawRecord } from '@dialecte/core'

/**
 * Whether one element of a read is the document's own content, given the record the read holds
 * above it. It must be a native record (`isNativeRecord`). A read lifts the
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
	return isNativeRecord(element)
}
