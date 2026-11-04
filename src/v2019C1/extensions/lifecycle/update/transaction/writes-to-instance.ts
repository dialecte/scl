import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'

/**
 * Whether an update wrote to an instance, the one rule for the roots it returns: a group of the instance accepted
 * (always without decisions: a direct verb called without them writes everything the template brings, and returns
 * every instance it matched), or the file reference the instance records
 * brought to the newer revision (`provenanceChanged`). An instance whose every group is declined, or that has none,
 * and whose reference the update did not change (it names that revision already, or the update writes none on it)
 * is left as it is. Without `provenanceChanged`, it answers whether the instance's own groups write to it.
 */
export function writesToInstance(params: {
	accepted: AcceptedIds | undefined
	/** Whether the update changed the file reference the instance records: see `writeProvenance`. Default `false`. */
	provenanceChanged?: boolean
}): boolean {
	const { accepted, provenanceChanged = false } = params
	if (provenanceChanged) return true
	return !accepted || accepted.sourceIds.size > 0 || accepted.instanceIds.size > 0
}
