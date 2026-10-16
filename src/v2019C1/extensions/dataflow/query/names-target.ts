import type { RefPairEntry } from '@/v2019C1/extensions/reference/constants'

/** Whether the attributes give the path or the uuid of a pair of `resolution`. */
export function namesTarget(params: {
	pairs: readonly RefPairEntry[]
	resolution: string
	attributes: Readonly<Record<string, string>>
}): boolean {
	const { pairs, resolution, attributes } = params
	return pairs
		.filter((pair) => pair.resolution === resolution)
		.some((pair) => Boolean(attributes[pair.pathAttr] || attributes[pair.uuidAttr]))
}
