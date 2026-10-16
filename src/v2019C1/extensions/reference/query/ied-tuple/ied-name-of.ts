import { ownIedName } from './own-ied-name'

import { RELATIVE_IED_NAME } from '@/v2019C1/constants/naming'
import { readAttribute } from '@/v2019C1/helpers'

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
		const name = readAttribute({
			record,
			name: role.attribute,
			defaults: 'none',
			fullObject: true,
		})?.value
		return name === RELATIVE_IED_NAME ? ownIedName({ ancestry }) : name
	}
	if ('text' in role) return record.value || undefined
	if ('ancestor' in role) return ownIedName({ ancestry })
	const parent = ancestry.at(-1)
	return parent
		? readAttribute({
				record: parent,
				name: role.parentAttribute,
				defaults: 'none',
				fullObject: true,
			})?.value
		: undefined
}
