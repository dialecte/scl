import { DEFINITION } from '@/v2019C1/definition'

/** The logical node classes the schema knows: they spell the class out of a segment. */
export const LN_CLASS_VALUES: ReadonlySet<string> = new Set(
	DEFINITION.LNode.attributes.details.lnClass.facets.enumeration,
)

/**
 * The IED logical nodes, found by their class then prefix and instance. An LNode is not among
 * them: it is named by its specified naming, found by its segment (`findBySegmentScan`).
 */
export const LN_CLASS_INST_ATTR: Record<string, string> = {
	LN: 'inst',
	LN0: 'inst',
}
