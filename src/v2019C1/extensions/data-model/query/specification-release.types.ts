import type { SpecificationLogicalNode } from '@/v2019C1/extensions/data-model/naming/lnode-naming.types'

/**
 * What a release reads once, whatever the number of LNodes released: the logical nodes of the specification IEDs
 * their specified namings name, by name path (`logicalNodes`), and the LNodes bound to each logical node of the
 * document, by the key naming it (`boundBy`: by `lnUuid` or by name path, see `boundKeyOf`), all of them.
 */
export type SpecificationRelease = {
	logicalNodes: ReadonlyMap<string, SpecificationLogicalNode>
	boundBy: ReadonlyMap<string, readonly string[]>
}
