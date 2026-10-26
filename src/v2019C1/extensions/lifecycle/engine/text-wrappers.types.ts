import type { AnyTrackedRecord } from '@dialecte/core'

/** A wrapper of the template holding text only (vendor data in a `Private`), and the instance's of its type, if any. */
export type TextWrapperPair = {
	source: AnyTrackedRecord
	instance: AnyTrackedRecord | undefined
}
