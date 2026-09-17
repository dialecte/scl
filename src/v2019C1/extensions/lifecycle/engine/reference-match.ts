import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** A read surface shared by the diff (Query) and reconcile (Transaction) sides. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The reference identity of a link element: the set of target `*Uuid` attributes it carries, as a
 * stable string. When `mapToTemplate` is set (the INSTANCE/target side), each target uuid is resolved
 * to its element's `templateUuid` so an instantiated (remapped) reference compares equal to the
 * template reference it came from. The SOURCE side passes the raw uuids, which are already template
 * space. Returns `undefined` when no uuid attribute is set (unresolved ref), so matching falls back to
 * position. Lineage-aware by design — this is a matching helper, not an agnostic identity read.
 */
export async function referenceIdentity(
	query: Reader,
	node: AnyTreeRecord,
	options: { mapToTemplate: boolean },
): Promise<string | undefined> {
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	const parts: string[] = []
	for (const pair of pairs) {
		const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!uuidValue) continue
		const identity = options.mapToTemplate
			? await toTemplateSpaceUuid(query, uuidValue, pair.target)
			: uuidValue
		parts.push(`${pair.attribute.uuid}=${identity}`)
	}
	return parts.length > 0 ? parts.sort().join('|') : undefined
}

/**
 * Resolve an instance target `uuid` to its template-space identity: the referenced element's
 * `templateUuid` if it is an instance, else the uuid itself (an external/unresolvable target).
 */
async function toTemplateSpaceUuid(
	query: Reader,
	uuidValue: string,
	targetTags: readonly string[],
): Promise<string> {
	for (const tagName of targetTags) {
		const matches = await query.any.findByAttributes({
			tagName: tagName as Parameters<typeof query.any.findByAttributes>[0]['tagName'],
			attributes: { uuid: uuidValue } as Record<string, string>,
		})
		const target = matches[0]
		if (target) {
			const templateUuid = await query.any.getAttribute(target, { name: 'templateUuid' })
			return templateUuid || uuidValue
		}
	}
	return uuidValue
}

/**
 * Fallback identity for a reference node: the NAME of each resolved target element. Stable across
 * instantiate even when the project uses placeholder `templateUuid`s that are not the source
 * element's own `uuid` (so the uuid round-trip in {@link referenceIdentity} cannot bridge the two
 * sides). Undefined when no target resolves to a named element.
 */
export async function referenceNameIdentity(
	query: Reader,
	node: AnyTreeRecord,
): Promise<string | undefined> {
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	const parts: string[] = []
	for (const pair of pairs) {
		const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!uuidValue) continue
		const name = await resolveTargetName(query, uuidValue, pair.target)
		if (name === undefined) continue
		parts.push(`${pair.attribute.uuid}=${name}`)
	}
	return parts.length > 0 ? parts.sort().join('|') : undefined
}

async function resolveTargetName(
	query: Reader,
	uuidValue: string,
	targetTags: readonly string[],
): Promise<string | undefined> {
	for (const tagName of targetTags) {
		const matches = await query.any.findByAttributes({
			tagName: tagName as Parameters<typeof query.any.findByAttributes>[0]['tagName'],
			attributes: { uuid: uuidValue } as Record<string, string>,
		})
		const target = matches[0]
		if (target) {
			const name = await query.any.getAttribute(target, { name: 'name' })
			return name || undefined
		}
	}
	return undefined
}
