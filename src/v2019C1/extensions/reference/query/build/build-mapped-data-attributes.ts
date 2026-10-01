import { MAPPED_NAME_PATTERNS } from '@/v2019C1/extensions/reference/constants'

import type {
	BuildMappedDataAttributesParams,
	MappedDataAttributes,
} from './build-mapped-data-attributes.types'

/**
 * The attributes a `DOS` / `SDS` / `DAS` stores for its implementation: nothing when it is
 * the default, otherwise the data path from the implementing logical node with that
 * logical node's uuid.
 */
export function buildMappedDataAttributes(
	params: BuildMappedDataAttributesParams,
): MappedDataAttributes {
	const { tagName, implementation, defaultData } = params

	const isDefault =
		defaultData?.lnId === implementation.lnId &&
		samePath(defaultData.dataPath, implementation.dataPath)
	if (isDefault) return { kind: 'default' }

	const mappedName = implementation.dataPath.join('.')
	const patterns = MAPPED_NAME_PATTERNS.get(tagName) ?? []
	if (!patterns.every((pattern) => pattern.test(mappedName))) return { kind: 'inexpressible' }

	return { kind: 'deviation', mappedName, mappedLnUuid: implementation.lnUuid }
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((segment, index) => segment === right[index])
}
