import type { AnyRawRecord } from '@dialecte/core'

export type ReadValueImportParams = {
	/** The `DAI` giving the value. */
	instance: AnyRawRecord
	/** The `DA` / `BDA` the `DAI` gives its value for, when it is known. */
	dataAttribute?: AnyRawRecord
}
