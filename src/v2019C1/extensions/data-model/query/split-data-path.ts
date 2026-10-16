import { DATA_TYPE_MODEL } from './data-types.constants'

import type { DataPathSplit, DataTypeMember, DataTypes } from './data-types.types'

/**
 * Splits the data path a signal carries (`PhV.phsA.cVal.mag.f`) into the data object and the data
 * attribute it names, walking the data model of the logical node type `lnType`: a data object
 * (`DO`), then sub data objects (`SDO`) each in the data object type of the one before, then a data
 * attribute (`DA`), then nested data attributes (`BDA`) each in the data attribute type of the one
 * before. `doName` is the first group dot-joined, `daName` the second; `daName` is absent when the
 * path stops on a data object.
 *
 * The split is never guessed: `undefined` when a segment is not found where the walk stands (the
 * type missing from the document included), or when a data attribute that holds no structure is
 * followed by another segment. A path of a signal that names no data attribute (`dataObjectOnly`)
 * that reaches one has no split either.
 */
export function splitDataPath(params: {
	qualifier: string
	lnType: string
	types: DataTypes
	dataObjectOnly?: boolean
}): DataPathSplit | undefined {
	const { qualifier, lnType, types, dataObjectOnly } = params
	const [first, ...rest] = qualifier.split('.')
	const dataObject = types.lnodeTypesById.get(lnType)?.find((member) => member.name === first)
	if (!dataObject) return undefined
	const split = splitBelowDataObject({ doNames: [first], dataObject, segments: rest, types })
	return dataObjectOnly && split?.daName !== undefined ? undefined : split
}

/** The walk below a data object or sub data object: more sub data objects, then the data attribute. */
function splitBelowDataObject(params: {
	doNames: readonly string[]
	dataObject: DataTypeMember
	segments: readonly string[]
	types: DataTypes
}): DataPathSplit | undefined {
	const { doNames, dataObject, segments, types } = params
	const doName = doNames.join('.')
	const [next, ...rest] = segments
	if (next === undefined) return { doName }

	const members = dataObject.type ? types.doTypesById.get(dataObject.type) : undefined
	const subObject = members?.subObjects.find((member) => member.name === next)
	if (subObject) {
		return splitBelowDataObject({
			doNames: [...doNames, next],
			dataObject: subObject,
			segments: rest,
			types,
		})
	}
	const dataAttribute = members?.attributes.find((member) => member.name === next)
	if (!dataAttribute) return undefined
	const daName = namesOfAttributes({
		names: [next],
		attribute: dataAttribute,
		segments: rest,
		types,
	})
	return daName === undefined ? undefined : { doName, daName }
}

/** The data attribute name once the nested attributes of `segments` are found below `attribute`. */
function namesOfAttributes(params: {
	names: readonly string[]
	attribute: DataTypeMember
	segments: readonly string[]
	types: DataTypes
}): string | undefined {
	const { names, attribute, segments, types } = params
	const [next, ...rest] = segments
	if (next === undefined) return names.join('.')
	if (attribute.bType !== DATA_TYPE_MODEL.attributeTypeCondition.equals || !attribute.type) {
		return undefined
	}

	const nested = types.daTypesById.get(attribute.type)?.find((member) => member.name === next)
	if (!nested) return undefined
	return namesOfAttributes({ names: [...names, next], attribute: nested, segments: rest, types })
}
