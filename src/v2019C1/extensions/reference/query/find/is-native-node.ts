import { isNativeStep } from './is-native-step'

import type { AnyRawRecord } from '@dialecte/core'

/**
 * Whether an element read with its ancestry is the document's own content, not vendor payload:
 * every step from the root down to it is one {@link isNativeStep} accepts.
 */
export function isNativeNode(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): boolean {
	const { record, ancestry } = params
	const chain = [...ancestry, record]
	return chain.every(
		(element, index) =>
			index === 0 || isNativeStep({ element, above: chain[index - 1], root: chain[0] }),
	)
}
