import type { Particle } from '@dialecte/core'

/**
 * Whether a content model needs at least one child element: the fewest elements it accepts is above zero. An
 * occurrence the definition leaves out is optional (it writes `minOccurs` only when required); a choice needs its
 * least demanding branch, a sequence each of its particles.
 */
export function requiresChildElement(particle: Particle | undefined): boolean {
	return fewestElements(particle) > 0
}

function fewestElements(particle: Particle | undefined): number {
	if (!particle) return 0
	const occurrences = particle.minOccurs ?? 0
	if (particle.kind === 'element' || particle.kind === 'any') return occurrences
	const counts = particle.particles.map((child) => fewestElements(child))
	if (particle.kind === 'choice') return counts.length === 0 ? 0 : occurrences * Math.min(...counts)
	return occurrences * counts.reduce((sum, count) => sum + count, 0)
}

/** The element kinds a content model needs at least one of: every required element particle, each branch of a choice. */
export function requiredChildTags(particle: Particle | undefined): Set<string> {
	const tags = new Set<string>()
	collectRequired({ particle, tags })
	return tags
}

function collectRequired(params: { particle: Particle | undefined; tags: Set<string> }): void {
	const { particle, tags } = params
	if (!particle || (particle.minOccurs ?? 0) === 0) return
	if (particle.kind === 'element') tags.add(particle.name)
	else if (particle.kind === 'any') tags.add('')
	else for (const child of particle.particles) collectRequired({ particle: child, tags })
}

/**
 * The groups of child element kinds a content model needs one of each: a required element its own group, a required
 * choice one group of every element kind its branches hold (one branch present is enough), a required sequence its
 * required particles each.
 */
export function requiredChildGroups(particle: Particle | undefined): ReadonlySet<string>[] {
	if (!particle || (particle.minOccurs ?? 0) === 0) return []
	if (particle.kind === 'element') return [new Set([particle.name])]
	if (particle.kind === 'any') return [new Set([''])]
	if (particle.kind === 'choice') return [new Set(elementNamesIn(particle))]
	return particle.particles.flatMap((child) => requiredChildGroups(child))
}

/** Every element kind a particle holds, at any depth, whatever its occurrences. */
function elementNamesIn(particle: Particle): string[] {
	if (particle.kind === 'element') return [particle.name]
	if (particle.kind === 'any') return ['']
	return particle.particles.flatMap((child) => elementNamesIn(child))
}
