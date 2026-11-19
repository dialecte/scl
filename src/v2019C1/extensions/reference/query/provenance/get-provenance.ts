import { PROVENANCE_ANCHOR_KIND_BY_TAG } from './get-provenance.constants'

import { readAttributes } from '@/v2019C1/helpers'

import type { ProvenanceEntry } from './get-provenance.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: returns every source-file reference in the document, each
 * resolved to the element that carries it — the function/application/ied it was
 * instantiated from, or the header for document-level source files. Consumers
 * use it to show which templates (and versions) a document was built from and
 * to decide whether a file is compatible with a given scenario.
 *
 * Perf: one tag read for the references, then one ancestor walk for all of them (one read per level).
 *
 * @intent which templates (FSD/ASD/SSD) a document was built from, source files and versions of a document, template origin of a Function/Application/IED
 */
export async function getProvenance(query: Core.Query<Config>): Promise<ProvenanceEntry[]> {
	const references = await query.getRecordsByTagName('SclFileReference')
	if (references.length === 0) return []
	const ancestries = await query.findAncestorsOfEach(references)

	const entries: ProvenanceEntry[] = []
	for (const [index, reference] of references.entries()) {
		const anchor = anchorOf(ancestries[index] ?? [])
		if (!anchor) continue

		const { fileType, fileUuid, fileName, version, revision } = readAttributes({
			record: reference,
		})

		entries.push({ fileType, fileUuid, fileName, version, revision, anchor })
	}

	return entries
}

/** The nearest ancestor of an anchor kind, bottom-up. */
function anchorOf(
	ancestors: readonly Scl.TrackedRecord<Scl.ElementsOf>[],
): ProvenanceEntry['anchor'] | undefined {
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
