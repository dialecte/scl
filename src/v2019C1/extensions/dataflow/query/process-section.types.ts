import type { SectionNode } from './section-node.types'

/**
 * What one read of the process section (every substation, line, process and function template,
 * down to each LNode and signal) gives: the LNodes by uuid and by path, the signals (SourceRef, ControlRef) in
 * document order by id, and the LNode holding each signal, by signal id.
 */
export type ProcessSection = {
	lnodeByUuid: ReadonlyMap<string, SectionNode<'LNode'>>
	lnodeByPath: ReadonlyMap<string, SectionNode<'LNode'>>
	/** The uuids of the elements the further references of the signals name, by tag. */
	uuidsByTag: ReadonlyMap<string, ReadonlySet<string>>
	/** Every SourceRef and ControlRef, by id, in document order. */
	signals: ReadonlyMap<string, SectionNode<'SourceRef' | 'ControlRef'>>
	holderOfSignal: ReadonlyMap<string, SectionNode<'LNode'>>
}
