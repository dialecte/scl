import {
	readAttribute as readAnyAttribute,
	readAttributes as readAnyAttributes,
} from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type { ReadAttributeParams, ReadAttributesParams } from './read-attributes.types'
import type { AnyAttribute } from '@dialecte/core'

/**
 * Read one attribute of an SCL record you hold (raw, tracked or tree) the way `query.getAttribute` reads it - same
 * `namespace` scope, same `defaults` fill, same `''` for an absent attribute - with no query and no configuration to
 * pass: synchronous, for an import pass or a pure composer.
 *
 * `fullObject: true` returns the attribute object, or `undefined` when there is none in that view: with
 * `defaults: 'none'`, how to tell an absent attribute from one written empty.
 *
 * Reads the record as you hold it. Inside a transaction use `tx.getAttribute`, which sees the transaction's staged
 * writes.
 *
 * @example
 * readAttribute({ record, name: 'iedName' })                                      // → 'B1', or 'None' when absent
 * readAttribute({ record, name: 'iedName', defaults: 'none', fullObject: true }) // → undefined when absent
 */
export function readAttribute(params: ReadAttributeParams & { fullObject?: false }): string
export function readAttribute(
	params: ReadAttributeParams & { fullObject: true },
): AnyAttribute | undefined
export function readAttribute(
	params: ReadAttributeParams & { fullObject?: boolean },
): AnyAttribute | string | undefined {
	const { fullObject, ...rest } = params
	const bound = { ...rest, dialecteConfig: SCL_DIALECTE_CONFIG }
	return fullObject
		? readAnyAttribute({ ...bound, fullObject })
		: readAnyAttribute({ ...bound, fullObject })
}

/**
 * Read the attributes of an SCL record you hold (raw, tracked or tree) the way `query.getAttributes` reads them -
 * each under the name it is stored by, or keyed by local name in a `namespace` scope, absent schema attributes filled
 * per `defaults` - with no query and no configuration to pass. `fullObject: true` returns the attribute objects.
 *
 * Reads the record as you hold it. Inside a transaction use `tx.getAttributes`, which sees the transaction's staged
 * writes.
 *
 * @example
 * readAttributes({ record })                      // → { lnClass: 'XCBR', iedName: 'None', ... }
 * readAttributes({ record, defaults: 'none' })    // → stored only
 */
export function readAttributes(
	params: ReadAttributesParams & { fullObject?: false },
): Record<string, string>
export function readAttributes(
	params: Omit<ReadAttributesParams, 'namespace'> & { fullObject: true },
): AnyAttribute[]
export function readAttributes(
	params: ReadAttributesParams & { fullObject?: boolean },
): Record<string, string> | AnyAttribute[] {
	const { fullObject, ...rest } = params
	const bound = { ...rest, dialecteConfig: SCL_DIALECTE_CONFIG }
	return fullObject
		? readAnyAttributes({ ...bound, fullObject })
		: readAnyAttributes({ ...bound, fullObject })
}
