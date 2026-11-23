import { IDENTITY_ATTRIBUTES } from './element-identity.constants'

import { readAttributes } from '@/v2019C1/helpers'

import type { NamedIdentity } from './element-identity.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The name, uuid and type of a record, where its tag has them: what names it for a person. An attribute the record
 * does not carry, or carries empty, is left out. The record is read once, nothing else.
 */
export function identityOf(params: { record: AnyRawRecord }): NamedIdentity {
	const attributes = readAttributes({ record: params.record, defaults: 'none' })
	const identity: NamedIdentity = {}
	for (const name of IDENTITY_ATTRIBUTES) {
		const value = attributes[name]
		if (value) identity[name] = value
	}
	return identity
}
