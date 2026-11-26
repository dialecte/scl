import { isNamespaceWrapper } from './pruned-when-empty'

import { describe, expect, it } from 'vitest'

import type { AnyRawRecord } from '@dialecte/core'

const SCL_NAMESPACE = { prefix: '', uri: 'http://www.iec.ch/61850/2003/SCL' }
const VENDOR_NAMESPACE = { prefix: 'v', uri: 'urn:vendor' }

/** A `Private` of the 6-100 type, in the namespace given. */
function privateOfType(params: { namespace: { prefix: string; uri: string } }): AnyRawRecord {
	return {
		id: 'private',
		tagName: 'Private',
		namespace: params.namespace,
		attributes: [{ name: 'type', value: 'eIEC61850-6-100' }],
		value: '',
		parent: null,
		children: [],
	}
}

describe('isNamespaceWrapper - a wrapper of a namespace is an SCL Private', () => {
	it('an SCL Private of the 6-100 type → a namespace wrapper', () => {
		expect(isNamespaceWrapper({ record: privateOfType({ namespace: SCL_NAMESPACE }) })).toBe(true)
	})

	it('a vendor Private (another namespace) of the 6-100 type → not one: a vendor element', () => {
		expect(isNamespaceWrapper({ record: privateOfType({ namespace: VENDOR_NAMESPACE }) })).toBe(
			false,
		)
	})
})
