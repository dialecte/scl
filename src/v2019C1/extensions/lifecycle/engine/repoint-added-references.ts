import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction'

import type {
	FindInstanceCounterpartParams,
	RepointAddedReferencesParams,
} from './repoint-added-references.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Repoint the references an update ADDED to one instance onto the elements of the project.
 *
 * Each subtree an update adds is finalized on its own, so a reference in it whose target lies
 * outside that subtree still carries the uuid of the SOURCE element. That target is either
 * another element the same update added (a satellite, another subtree), or an element the project
 * already holds for this instance (found by its lineage, or handed in as a redirect mapping).
 *
 * Run once per instance, when everything the update adds to it exists, with ALL the clone mappings
 * of that instance: the single uuid remap then sees every added element at once.
 *
 * Several project elements may carry the lineage of one source element (the template was
 * instantiated more than once): the one the instance contains or already refers to is taken, and a
 * reference that still cannot be told apart is left as it is.
 */
export async function repointAddedReferences(
	tx: Core.Transaction<Config>,
	params: RepointAddedReferencesParams,
): Promise<void> {
	const { cloneMappings, instanceRootRef, matchKey } = params
	if (cloneMappings.length === 0) return

	const redirectMappings: RedirectMapping[] = [...(params.redirectMappings ?? [])]
	// source uuids the remap already knows where to point: cloned by this update, or redirected
	const resolvedSourceUuids = new Set<string>(
		redirectMappings.map((redirectMapping) => redirectMapping.sourceUuid),
	)
	for (const { source } of cloneMappings) {
		const sourceUuid = readAttribute(source.attributes, 'uuid')
		if (sourceUuid) resolvedSourceUuids.add(sourceUuid)
	}

	let instanceScope: ReadonlySet<string> | undefined
	async function resolveInstanceScope(): Promise<ReadonlySet<string>> {
		instanceScope ??= await collectInstanceScope(tx, instanceRootRef)
		return instanceScope
	}

	for (const { source, target } of cloneMappings) {
		const pairs = UUID_REFERENCE_PAIRS[target.tagName as keyof typeof UUID_REFERENCE_PAIRS]
		if (!pairs) continue

		for (const pair of pairs) {
			const sourceUuid = readAttribute(source.attributes, pair.attribute.uuid)
			if (!sourceUuid || resolvedSourceUuids.has(sourceUuid)) continue

			const counterpart = await findInstanceCounterpart(tx, {
				sourceUuid,
				targetTags: pair.target,
				matchKey,
				resolveInstanceScope,
			})
			if (!counterpart) continue

			resolvedSourceUuids.add(sourceUuid)
			redirectMappings.push({
				sourceUuid,
				target: { tagName: counterpart.tagName, id: counterpart.id } as Scl.Ref<Scl.ElementsOf>,
			})
		}
	}

	await applyUuidRemap(tx, { cloneMappings, redirectMappings })
}

/**
 * The project element that stands for a source element in one instance: the element of a
 * targetable tag carrying the source element's uuid as its lineage. When several qualify, the one
 * that belongs to the instance; none when the instance does not single one out.
 */
async function findInstanceCounterpart(
	tx: Core.Transaction<Config>,
	params: FindInstanceCounterpartParams,
): Promise<AnyTrackedRecord | undefined> {
	const { sourceUuid, targetTags, matchKey, resolveInstanceScope } = params

	const candidates: AnyTrackedRecord[] = []
	for (const tagName of targetTags) {
		const matches = await tx.any.findByAttributes({
			tagName: tagName as Scl.ElementsOf,
			attributes: { [matchKey]: sourceUuid },
		})
		candidates.push(...matches)
	}
	if (candidates.length <= 1) return candidates[0]

	const instanceScope = await resolveInstanceScope()
	const inInstance = candidates.filter((candidate) => instanceScope.has(candidate.id))
	return inInstance.length === 1 ? inInstance[0] : undefined
}

/**
 * The record ids of the elements that belong to an instance: the elements of its subtree and the
 * elements its references point at.
 */
async function collectInstanceScope(
	tx: Core.Transaction<Config>,
	instanceRootRef: AnyRefOrRecord,
): Promise<Set<string>> {
	const scope = new Set<string>()
	const instanceTree = await tx.any.getTree(instanceRootRef)
	if (instanceTree) await collectNodeScope(tx, { node: instanceTree, scope })
	return scope
}

async function collectNodeScope(
	tx: Core.Transaction<Config>,
	params: { node: AnyTreeRecord; scope: Set<string> },
): Promise<void> {
	const { node, scope } = params
	scope.add(node.id)

	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
	for (const pair of pairs) {
		const referencedUuid = await tx.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!referencedUuid) continue
		for (const tagName of pair.target) {
			const referenced = await tx.any.findByAttributes({
				tagName: tagName as Scl.ElementsOf,
				attributes: { uuid: referencedUuid },
			})
			for (const record of referenced) scope.add(record.id)
		}
	}

	for (const child of node.tree) await collectNodeScope(tx, { node: child, scope })
}

function readAttribute(
	attributes: readonly { name: string; value: string }[],
	name: string,
): string | undefined {
	return attributes.find((attribute) => attribute.name === name)?.value || undefined
}
