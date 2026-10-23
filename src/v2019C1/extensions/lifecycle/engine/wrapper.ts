import { toRef } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The element of the project a source element lands under when it is added below an instance element. A tree read
 * shows what a transparent wrapper (a `Private`) holds as its parent's content: the source element whose record parent
 * is such a wrapper lands in the instance element's wrapper of the same `type` — the one it holds, else a new one
 * carrying the source wrapper's attributes —, never beside it. Any other lands under the instance element.
 */
export async function landingParent(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceChild: AnyTreeRecord
		instanceParent: AnyTreeRecord
	},
): Promise<AnyRefOrRecord> {
	const { sourceQuery, sourceChild, instanceParent } = params
	const wrapper = sourceChild.parent
	if (!wrapper || !isTransparentElement(wrapper.tagName)) return toRef(instanceParent)

	const wrapperAttributes = await sourceQuery.any.getAttributes(wrapper)
	const held = await findWrapperOfType(tx, {
		instanceParent,
		tagName: wrapper.tagName,
		type: wrapperAttributes.type,
	})
	if (held) return held
	return tx.any.addChild(instanceParent, {
		tagName: wrapper.tagName,
		attributes: wrapperAttributes,
	})
}

/** The instance element's wrapper of that tag and `type`, as the transaction holds it. */
async function findWrapperOfType(
	tx: Core.Transaction<Config>,
	params: { instanceParent: AnyTreeRecord; tagName: string; type: string | undefined },
): Promise<AnyRefOrRecord | undefined> {
	const { instanceParent, tagName, type } = params
	const parentRecord = await tx.any.getRecord(instanceParent)
	const wrapperRefs = parentRecord?.children.filter((child) => child.tagName === tagName) ?? []
	const wrappers = await tx.any.getRecords(wrapperRefs)
	for (const wrapper of wrappers) {
		if (!wrapper) continue
		if (readAttribute({ record: wrapper, name: 'type', defaults: 'none' }) === (type ?? ''))
			return wrapper
	}
	return undefined
}
