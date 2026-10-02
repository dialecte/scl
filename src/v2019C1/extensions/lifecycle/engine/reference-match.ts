import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { Config, Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * For each project element a source element was mapped onto: the project element's `uuid` -> the
 * source element's `uuid`. Such an element carries no lineage (it is the project's own), so this
 * is what tells a reference to it from the template reference it stands for.
 */
export type RedirectedSourceUuids = ReadonlyMap<string, string>

/** A read surface shared by the diff (Query) and reconcile (Transaction) sides. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The reference identity of a link element: the set of target `*Uuid` attributes it carries, as a
 * stable string. When `mapToTemplate` is set (the INSTANCE/target side), each target uuid is resolved
 * to its element's `templateUuid` so an instantiated (remapped) reference compares equal to the
 * template reference it came from. A target the source element was MAPPED onto carries no lineage:
 * `redirectedSourceUuids` gives the source element it stands for. The SOURCE side passes the raw
 * uuids, which are already template space. Returns `undefined` when no uuid attribute is set
 * (unresolved ref), so matching falls back to position. Lineage-aware by design — this is a matching
 * helper, not an agnostic identity read.
 */
export async function referenceIdentity(
	query: Reader,
	node: AnyTreeRecord,
	options: { mapToTemplate: boolean; redirectedSourceUuids?: RedirectedSourceUuids },
): Promise<string | undefined> {
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	const parts: string[] = []
	for (const pair of pairs) {
		const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!uuidValue) continue
		const identity = options.mapToTemplate
			? (options.redirectedSourceUuids?.get(uuidValue) ??
				(await toTemplateSpaceUuid(query, uuidValue, pair.target)))
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

/**
 * Index redirect mappings for the matcher: the `uuid` of each project element mapped onto -> the
 * `uuid` of the source element it stands for.
 */
export async function indexRedirectedSourceUuids(
	query: Reader,
	redirectMappings: readonly RedirectMapping[] | undefined,
): Promise<RedirectedSourceUuids> {
	const redirectedSourceUuids = new Map<string, string>()
	for (const { sourceUuid, target } of redirectMappings ?? []) {
		const targetUuid = await query.any.getAttribute(target as Scl.Ref<Scl.ElementsOf>, {
			name: 'uuid',
		})
		if (targetUuid) redirectedSourceUuids.set(targetUuid, sourceUuid)
	}
	return redirectedSourceUuids
}
