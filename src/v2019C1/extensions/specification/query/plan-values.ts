import { readAttributes } from '@/v2019C1/helpers'

import type { HeldValue, SpecifiedValue } from '../build/build-input.types'
import type { IedValuePlan, ValuePath } from '../transaction/build-ied.types'
import type { PlannedValues, PlanValuesParams, TypeStep } from './plan-values.types'
import type { DataTypeRecords } from '@/v2019C1/extensions/data-model/query/read-data-type-records.types'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The values each logical node of the plan gets from what its LNode specifies (pure): a value whose data its type does
 * not hold, or whose functional constraint (the `fc` of the first data attribute on its path) is excluded, is left out;
 * a value the logical node already holds as specified is not planned; one it holds otherwise replaces it.
 */
export function planValues(params: PlanValuesParams): PlannedValues {
	const { logicalNodes, specifiedValues, heldValues, valueTypes, contextTypeIds } = params
	const excluded = new Set(params.excludeFunctionalConstraints)
	const planned: PlannedValues = { values: [], valuesLeftOut: [] }
	for (const logicalNode of logicalNodes) {
		const specified = specifiedValues.get(logicalNode.lnode.id) ?? []
		if (specified.length === 0) continue
		const types = contextTypeIds.has(logicalNode.lnType) ? valueTypes.context : valueTypes.target
		const held = logicalNode.existing ? (heldValues.get(logicalNode.existing.id ?? '') ?? []) : []
		for (const value of specified) {
			const fc =
				types && functionalConstraintOf({ types, lnType: logicalNode.lnType, path: value.path })
			if (fc === undefined) {
				planned.valuesLeftOut.push({ das: value.das, reason: 'path-not-in-type' })
				continue
			}
			if (excluded.has(fc)) {
				planned.valuesLeftOut.push({ das: value.das, reason: 'functional-constraint' })
				continue
			}
			const there = held.find((candidate) => samePath({ path: candidate.path, other: value.path }))
			if (there && sameValue({ held: there, specified: value })) continue
			planned.values.push(valuePlanOf({ lnode: logicalNode.lnode, value, there }))
		}
	}
	return planned
}

function valuePlanOf(params: {
	lnode: IedValuePlan['lnode']
	value: SpecifiedValue
	there?: HeldValue
}): IedValuePlan {
	const { lnode, value, there } = params
	return {
		lnode,
		das: value.das,
		path: value.path,
		vals: value.vals,
		...(value.valKind && { valKind: value.valKind }),
		...(value.valImport && { valImport: value.valImport }),
		...(there && { existing: there.dai }),
	}
}

/**
 * The functional constraint of the data a path names in a logical node type: the `fc` of the first data attribute
 * met going down the data object, its sub data objects, then data attribute and its sub attributes; `undefined` when
 * the type holds no such data (a name it lacks, an index on data that is no array, array data without its index, a path
 * ending above a leaf) or when its types were not read (an id several types carry: the read leaves it out).
 */
export function functionalConstraintOf(params: {
	types: DataTypeRecords
	lnType: string
	path: ValuePath
}): string | undefined {
	const { types, lnType, path } = params
	const lnodeType = types.typesByTag.get('LNodeType')?.get(lnType)
	const dataObject =
		lnodeType && memberNamed({ types, parent: lnodeType, tagName: 'DO', name: path.doi })
	const doType = dataObject && readAttributes({ record: dataObject, defaults: 'none' }).type
	if (!doType) return undefined
	let step: TypeStep | undefined = { tagName: 'DOType', id: doType }
	let fc: string | undefined
	for (const next of [...path.sdi, path.dai]) {
		if (!step) return undefined
		const member = memberOf({ types, step, name: next.name })
		if (!member) return undefined
		const attributes = readAttributes({ record: member, defaults: 'none' })
		// an index only on array data, and array data only by its index
		if ((next.ix !== undefined) !== isArray({ count: attributes.count })) return undefined
		if (member.tagName === 'DA') fc ??= attributes.fc
		step = nextStep({ member, type: attributes.type })
	}
	// a value sits on a leaf: a path ending on a sub data object or a structured attribute names no value
	return step ? undefined : fc
}

/** The member of a type step named so: a sub data object or data attribute of a DOType, a sub attribute of a DAType. */
function memberOf(params: {
	types: DataTypeRecords
	step: TypeStep
	name: string
}): AnyTrackedRecord | undefined {
	const { types, step, name } = params
	const type = types.typesByTag.get(step.tagName)?.get(step.id)
	if (!type) return undefined
	if (step.tagName === 'DAType') return memberNamed({ types, parent: type, tagName: 'BDA', name })
	return (
		memberNamed({ types, parent: type, tagName: 'SDO', name }) ??
		memberNamed({ types, parent: type, tagName: 'DA', name })
	)
}

/** Where the walk goes below a member: a sub data object's DOType, a structured attribute's DAType, else nowhere. */
function nextStep(params: { member: AnyTrackedRecord; type?: string }): TypeStep | undefined {
	const { member, type } = params
	if (!type) return undefined
	if (member.tagName === 'SDO') return { tagName: 'DOType', id: type }
	const { bType } = readAttributes({ record: member, defaults: 'none' })
	return bType === 'Struct' ? { tagName: 'DAType', id: type } : undefined
}

/** The member of the tag and name among the members read for the type. */
function memberNamed(params: {
	types: DataTypeRecords
	parent: AnyTrackedRecord
	tagName: string
	name: string
}): AnyTrackedRecord | undefined {
	const { types, parent, tagName, name } = params
	for (const child of parent.children) {
		if (child.tagName !== tagName) continue
		const member = types.membersById.get(child.id)
		if (member && readAttributes({ record: member, defaults: 'none' }).name === name) return member
	}
	return undefined
}

/** Array data: a `count` given and not `0` (the default; a name-valued count is an array too). */
function isArray(params: { count?: string }): boolean {
	return params.count !== undefined && params.count !== '' && params.count !== '0'
}

function samePath(params: { path: ValuePath; other: ValuePath }): boolean {
	return JSON.stringify(params.path) === JSON.stringify(params.other)
}

function sameValue(params: { held: HeldValue; specified: SpecifiedValue }): boolean {
	const { held, specified } = params
	return (
		JSON.stringify(held.vals) === JSON.stringify(specified.vals) &&
		held.valKind === specified.valKind &&
		held.valImport === specified.valImport
	)
}
