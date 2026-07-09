import type { Scl } from '@/v2019C1/config'

/** Which kind of element carries a source-file reference. */
export type ProvenanceAnchorKind = 'function' | 'application' | 'ied' | 'document'

/**
 * A resolved source-file reference: which template file produced (or was used
 * to create) which anchored element in the document.
 */
export type ProvenanceEntry = {
	fileType: string
	fileUuid?: string
	fileName?: string
	version: string
	revision: string
	anchor: {
		kind: ProvenanceAnchorKind
		ref: Scl.Ref<Scl.ElementsOf>
	}
}
