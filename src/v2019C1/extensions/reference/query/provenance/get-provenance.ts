import { PROVENANCE_ANCHOR_KIND_BY_TAG } from './get-provenance.constants'

import type { ProvenanceEntry } from './get-provenance.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: returns every source-file reference in the document, each
 * resolved to the element that carries it — the function/application/ied it was
 * instantiated from, or the header for document-level source files. Consumers
 * use it to show which templates (and versions) a document was built from and
 * to decide whether a file is compatible with a given scenario.
 */
export async function getProvenance(query: Core.Query<Config>): Promise<ProvenanceEntry[]> {
	const references = await query.getRecordsByTagName('SclFileReference')

	const entries: ProvenanceEntry[] = []
	for (const reference of references) {
		const anchor = await resolveAnchor(query, reference)
		if (!anchor) continue

		const { fileType, fileUuid, fileName, version, revision } = await query.getAttributes(reference)

		entries.push({ fileType, fileUuid, fileName, version, revision, anchor })
	}

	return entries
}

async function resolveAnchor(
	query: Core.Query<Config>,
	reference: Scl.TrackedRecord<'SclFileReference'>,
): Promise<ProvenanceEntry['anchor'] | undefined> {
	const ancestors = await query.findAncestors(reference)
	for (const ancestor of ancestors) {
		const kind = PROVENANCE_ANCHOR_KIND_BY_TAG[ancestor.tagName]
		if (kind) {
			return { kind, ref: toRef(ancestor.tagName, ancestor.id) }
		}
	}
	return undefined
}

/** Build a ref from a dynamic tag name (the per-tag Ref union needs the assertion). */
function toRef(tagName: string, id: string): Scl.Ref<Scl.ElementsOf> {
	return { tagName, id } as unknown as Scl.Ref<Scl.ElementsOf>
}
