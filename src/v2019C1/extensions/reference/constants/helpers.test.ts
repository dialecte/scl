import {
	buildPairsByRefMap,
	buildResolutionsToTargetRefsMap,
	buildTypeIdReferrersByTarget,
} from './helpers'
import { UUID_REFERENCE_PAIRS } from './pairs'
import { TYPE_ID_REFERENCE_PAIRS } from './type-id-pairs'

import { describe, expect, test } from 'vitest'

describe('buildTypeIdReferrersByTarget', () => {
	const referrers = buildTypeIdReferrersByTarget(TYPE_ID_REFERENCE_PAIRS)

	test('LNodeType → the three lnType referrers (LN, LN0, LNode)', () => {
		expect(referrers.get('LNodeType')).toEqual([
			{ refTagName: 'LN', attribute: 'lnType' },
			{ refTagName: 'LN0', attribute: 'lnType' },
			{ refTagName: 'LNode', attribute: 'lnType' },
		])
	})

	test('DOType → DO.type and SDO.type', () => {
		expect(referrers.get('DOType')).toEqual([
			{ refTagName: 'DO', attribute: 'type' },
			{ refTagName: 'SDO', attribute: 'type' },
		])
	})

	test('EnumType → DA/BDA.type discriminated by bType=Enum', () => {
		expect(referrers.get('EnumType')).toEqual([
			{ refTagName: 'DA', attribute: 'type', when: { attribute: 'bType', equals: 'Enum' } },
			{ refTagName: 'BDA', attribute: 'type', when: { attribute: 'bType', equals: 'Enum' } },
		])
	})

	test('DAType → DA/BDA.type discriminated by bType=Struct', () => {
		expect(referrers.get('DAType')).toEqual([
			{ refTagName: 'DA', attribute: 'type', when: { attribute: 'bType', equals: 'Struct' } },
			{ refTagName: 'BDA', attribute: 'type', when: { attribute: 'bType', equals: 'Struct' } },
		])
	})
})

describe('buildResolutionsToTargetRefsMap', () => {
	const byResolution = buildResolutionsToTargetRefsMap(UUID_REFERENCE_PAIRS)

	test('groups referrers by resolution then target tag', () => {
		const lnodeTargets = byResolution['lnode'].get('LNode') ?? []
		expect(lnodeTargets).toContainEqual({
			refTagName: 'SourceRef',
			uuidAttr: 'sourceLNodeUuid',
			pathAttr: 'source',
		})
	})
})

describe('buildPairsByRefMap', () => {
	const byRef = buildPairsByRefMap(UUID_REFERENCE_PAIRS)

	test('flattens a ref tag to its uuid pair entries', () => {
		expect(byRef.get('SourceRef')).toContainEqual({
			uuidAttr: 'sourceLNodeUuid',
			pathAttr: 'source',
			resolution: 'lnode',
			targetTagNames: ['LNode'],
		})
	})
})
