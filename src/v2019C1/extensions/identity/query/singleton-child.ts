import { DEFINITION } from '@/v2019C1/definition/definition.generated'

import type { Particle } from '@dialecte/core'

const cache = new Map<string, boolean>()

/**
 * Whether the schema lets a parent hold at most one child of a tag: the tag's element particle, and every group holding
 * it, occurs at most once (an absent `maxOccurs` is unbounded). `LN0` in an `LDevice`, `Inputs` in an `LN`: yes;
 * `LN`, `ExtRef`, `DataSet`: no. Memoised per pair.
 *
 * @intent can a parent hold only one child of this tag, singleton child of a parent from the schema content model
 */
export function isSingletonChild(params: { parentTag: string; childTag: string }): boolean {
	const key = `${params.parentTag}>${params.childTag}`
	const known = cache.get(key)
	if (known !== undefined) return known
	const definition = (DEFINITION as Record<string, { contentModel?: Particle }>)[params.parentTag]
	const model = definition?.contentModel
	const singleton = model
		? occursOnce({ particle: model, childTag: params.childTag }) === true
		: false
	cache.set(key, singleton)
	return singleton
}

/** Whether `childTag` occurs at most once in the particle: undefined when the particle does not hold it. */
function occursOnce(params: { particle: Particle; childTag: string }): boolean | undefined {
	const { particle, childTag } = params
	if (particle.kind === 'any') return undefined
	if (particle.kind === 'element')
		return particle.name === childTag ? particle.maxOccurs === 1 : undefined
	const inner = particle.particles
		.map((child) => occursOnce({ particle: child, childTag }))
		.filter((found): found is boolean => found !== undefined)
	if (inner.length === 0) return undefined
	return inner.length === 1 && inner[0] && particle.maxOccurs === 1
}
