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
