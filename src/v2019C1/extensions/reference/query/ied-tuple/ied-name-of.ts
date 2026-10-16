import { ownIedName } from './own-ied-name'

import { RELATIVE_IED_NAME } from '@/v2019C1/constants/naming'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { IedRole } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

/** The name of the IED a referrer points into, where its role says to read it. */
export function iedNameOf(params: {
	role: IedRole
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): string | undefined {
	const { role, record, ancestry } = params
	if ('attribute' in role) {
		const name = readRawAttribute({ record, name: role.attribute })
		return name === RELATIVE_IED_NAME ? ownIedName({ ancestry }) : name
	}
	if ('text' in role) return record.value || undefined
	if ('ancestor' in role) return ownIedName({ ancestry })
	const parent = ancestry.at(-1)
	return parent ? readRawAttribute({ record: parent, name: role.parentAttribute }) : undefined
}
