import { EXPORTED_ROOT_TAGS } from './ied.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The name of the IED an export selects: refused when the source holds no such IED, or one without a name. */
export async function readSelectedIedName(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'> },
): Promise<string> {
	const { iedRef } = params
	const source = await query.getRecord(iedRef)
	if (!source) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			ref: iedRef,
			detail: 'extract.ied: selected source IED not found',
		})
	}
	const iedName = await query.getAttribute(iedRef, { name: 'name' })
	if (!iedName) {
		throwDialecteError('ASSERTION_FAILED', {
			ref: iedRef,
			detail: 'extract.ied: selected source IED has no name',
		})
	}
	return iedName
}

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
