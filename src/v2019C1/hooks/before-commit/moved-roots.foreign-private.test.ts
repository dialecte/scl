import { movedRecordsOf } from './moved-roots'

import { describe, expect, it } from 'vitest'

import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'

const SCL_NAMESPACE = { prefix: '', uri: 'http://www.iec.ch/61850/2003/SCL' }
const VENDOR_NAMESPACE = { prefix: 'v', uri: 'urn:vendor' }

/** A record of a test: its tag, id, namespace and parent. */
function recordOf(params: {
	tagName: string
	id: string
	namespace: { prefix: string; uri: string }
	parent: { tagName: string; id: string }
}): AnyRawRecord {
	return { ...params, attributes: [], value: '', children: [] }
}

/** A bay's element put in a Private created under the bay in the same transaction, in the namespace given. */
function wrappedUnderBay(params: { namespace: { prefix: string; uri: string } }): Scl.Operation[] {
	const bay = { tagName: 'Bay', id: 'bay' }
	const wrapper = recordOf({
		tagName: 'Private',
		id: 'wrapper',
		namespace: params.namespace,
		parent: bay,
	})
	const before = recordOf({
		tagName: 'Variable',
		id: 'variable',
		namespace: SCL_NAMESPACE,
		parent: bay,
	})
	const after = { ...before, parent: { tagName: 'Private', id: 'wrapper' } }
	return [
		{ status: 'created', newRecord: wrapper },
		{ status: 'updated', oldRecord: before, newRecord: after },
	] as unknown as Scl.Operation[]
}

describe('movedRecordsOf - an element put in an SCL Private where it stood has not moved', () => {
	it('an element put in a new SCL Private of its parent → not moved', () => {
		expect([
			...movedRecordsOf({ operations: wrappedUnderBay({ namespace: SCL_NAMESPACE }) }).keys(),
		]).toEqual([])
	})

	it('an element put in a new vendor Private (another namespace) of its parent → moved into it', () => {
		expect([
			...movedRecordsOf({ operations: wrappedUnderBay({ namespace: VENDOR_NAMESPACE }) }).keys(),
		]).toEqual(['variable'])
	})
})
