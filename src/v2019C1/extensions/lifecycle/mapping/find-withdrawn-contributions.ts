import { findMappingPolicy } from './mapping-policies'

import { REFERENCE_TAG_NAMES, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { collectInstanceScope } from '@/v2019C1/extensions/lifecycle/instance'

import type { FindWithdrawnContributionsParams, MappingReader } from './mapping.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * What an instance gave to project elements the template no longer brings anything for.
 *
 * A shared source element mapped onto an element of the project contributes references to it (an
 * `AllocationRole`'s function references). When the template drops that source element, the
 * project element stays — it is the project's — but the references this instance gave it now
 * stand for nothing: they are the ones pointing at an element of the instance.
 *
 * Read by the report (announced as removed) and by the apply (removed when accepted) alike.
 * Elements created from the template are not concerned: they carry its lineage and are removed
 * as a whole when their source element is.
 */
export async function findWithdrawnContributions(
	reader: MappingReader,
	params: FindWithdrawnContributionsParams,
): Promise<AnyTreeRecord[]> {
	const { instancePrimaryRef, instanceSatelliteRefs, resolvedMappings } = params
	const matchKey = params.matchKey ?? 'templateUuid'

	const mappedOntoIds = new Set<string>()
	for (const resolved of resolvedMappings.values()) {
		if (resolved.existing) mappedOntoIds.add(resolved.existing.id)
	}

	const leftElements: Scl.Ref<Scl.ElementsOf>[] = []
	for (const instanceSatelliteRef of instanceSatelliteRefs) {
		if (!findMappingPolicy(instanceSatelliteRef.tagName)) continue
		if (instanceSatelliteRef.id && mappedOntoIds.has(instanceSatelliteRef.id)) continue
		const lineage = await reader.any.getAttribute(instanceSatelliteRef, { name: matchKey })
		if (lineage) continue
		leftElements.push(instanceSatelliteRef)
	}
	if (leftElements.length === 0) return []

	const instanceScope = await collectInstanceScope(reader, instancePrimaryRef)

	const withdrawn: AnyTreeRecord[] = []
	for (const leftElement of leftElements) {
		const tree = await reader.any.getTree(leftElement)
		if (!tree) continue
		await collectContributions(reader, { node: tree, instanceScope, withdrawn })
	}
	return withdrawn
}

/**
 * The references below `node` pointing into the instance, at any depth: a category nests its
 * references in sub-categories.
 */
async function collectContributions(
	reader: MappingReader,
	params: { node: AnyTreeRecord; instanceScope: ReadonlySet<string>; withdrawn: AnyTreeRecord[] },
): Promise<void> {
	const { node, instanceScope, withdrawn } = params
	for (const child of node.tree) {
		if (!REFERENCE_TAG_NAMES.has(child.tagName)) {
			await collectContributions(reader, { node: child, instanceScope, withdrawn })
			continue
		}
		const isContribution = await pointsIntoInstance(reader, { reference: child, instanceScope })
		if (isContribution) withdrawn.push(child)
	}
}

/** Whether a reference points at an element of the instance. */
async function pointsIntoInstance(
	reader: MappingReader,
	params: { reference: AnyTreeRecord; instanceScope: ReadonlySet<string> },
): Promise<boolean> {
	const { reference, instanceScope } = params

	const pairs = UUID_REFERENCE_PAIRS[reference.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
	for (const pair of pairs) {
		const referencedUuid = await reader.any.getAttribute(reference, { name: pair.attribute.uuid })
		if (!referencedUuid) continue
		for (const tagName of pair.target) {
			const referenced = await reader.any.findByAttributes({
				tagName: tagName as Scl.ElementsOf,
				attributes: { uuid: referencedUuid },
			})
			if (referenced.some((record) => instanceScope.has(record.id))) return true
		}
	}
	return false
}
