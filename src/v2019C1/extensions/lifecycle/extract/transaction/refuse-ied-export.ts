import { EXPORTED_ROOT_TAGS } from './ied.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** An export writes into an empty target: refused when the target already holds an IED or a process part. */
export async function refuseTargetNotEmpty(tx: Core.Transaction<Config>): Promise<void> {
	const targetRoot = await tx.getRoot()
	const held = targetRoot.children.find(function isWrittenByExport(child) {
		return EXPORTED_ROOT_TAGS.has(child.tagName)
	})
	if (held) {
		throwDialecteError(SCL_ERRORS.EXTRACTION_TARGET_NOT_EMPTY, {
			detail: `extract.ied: target already holds a ${held.tagName}`,
		})
	}
}
