import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { REQUIRED_ATTRIBUTES } from '@/v2019C1/definition/constants.generated'
import { MAPPED_NAME_REFS, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'

import type { ReferencePair } from '@/v2019C1/extensions/reference'

/**
 * The path references the commit resolves by their path, by tag, with the pairs it reads: every uuid pair but the
 * mapped names (`DOS` / `SDS` / `DAS`, resolved by their own rules) and the XPath selectors (`unsupported`).
 */
export const PATH_PAIRS_BY_TAG: ReadonlyMap<string, readonly ReferencePair[]> = new Map(
	Object.entries(UUID_REFERENCE_PAIRS).flatMap(
		([tagName, pairs]): [string, readonly ReferencePair[]][] => {
			if (MAPPED_NAME_REFS.has(tagName)) return []
			const resolved = (pairs as readonly ReferencePair[]).filter(
				(pair) => pair.resolution !== RESOLUTION_TYPE.unsupported,
			)
			return resolved.length > 0 ? [[tagName, resolved]] : []
		},
	),
)

/**
 * The path references whose path the definition requires, as `<tag>@<path attribute>` (a terminal's
 * `connectivityNode`): a removed path is written again from the uuid; any other removed path unbinds the reference.
 */
export const REQUIRED_PATHS: ReadonlySet<string> = new Set(
	Object.entries(UUID_REFERENCE_PAIRS).flatMap(([tagName, pairs]) =>
		(pairs as readonly ReferencePair[]).flatMap((pair) =>
			((REQUIRED_ATTRIBUTES as Record<string, readonly string[]>)[tagName] ?? []).includes(
				pair.attribute.path,
			)
				? [`${tagName}@${pair.attribute.path}`]
				: [],
		),
	),
)
