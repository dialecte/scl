import {
	CROSS_CUTTING_SATELLITE_TAGS,
	FRAME_CARRIED_TAGS,
	SATELLITE_HELD_REFERENCES,
	SATELLITE_REFERENCE_LINKS,
} from './applied-satellites.constants'

import { describe, expect, it } from 'vitest'

// The constants derived from the registries, by value: what the resolvers read.
describe('applied satellites constants', () => {
	it('the satellite tags: a variable and a behaviour description', () => {
		expect([...CROSS_CUTTING_SATELLITE_TAGS].sort()).toEqual(['BehaviorDescription', 'Variable'])
	})

	it('what a topology frame places with all it holds: its functions, applications, their categories and roles', () => {
		expect([...FRAME_CARRIED_TAGS].sort()).toEqual([
			'AllocationRole',
			'Application',
			'Function',
			'FunctionCategory',
		])
	})

	it('the references naming nothing but a satellite, by their uuid attribute', () => {
		expect(
			[...SATELLITE_REFERENCE_LINKS].map(
				([tagName, link]) => `${tagName}.${link.uuid} → ${link.targets.join(', ')}`,
			),
		).toEqual([
			'BehaviorDescriptionRef.behaviorDescriptionUuid → BehaviorDescription',
			'BehaviorReference.behaviorUuid → BehaviorDescription',
			'VariableRef.variableUuid → Variable',
		])
	})

	it('the references a satellite holds, by satellite tag', () => {
		expect(
			SATELLITE_HELD_REFERENCES.map(
				({ satelliteTag, tagName, pairs }) =>
					`${satelliteTag} > ${tagName}.${pairs.map((pair) => pair.attribute.uuid).join(', ')}`,
			),
		).toEqual([
			'Variable > VariableApplyTo.elementUuid',
			'BehaviorDescription > InputVar.lnodeUuid, inputUuid',
			'BehaviorDescription > OutputVar.lnodeUuid, outputUuid',
			'BehaviorDescription > BehaviorReference.behaviorUuid',
		])
	})
})
