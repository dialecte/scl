import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { referenceIdentity } from '@/v2019C1/extensions/lifecycle/engine/reference-match'

import type {
	InstanceSatellitePair,
	InstanceSatellitePairing,
	MappingReader,
	PairInstanceSatellitesParams,
	SourceSatellite,
	StoredRef,
} from './mapping.types'
import type { AnyTreeRecord } from '@dialecte/core'

/** Whether a project element can be the one a shared source element stands for. */
type Qualifies = (params: { source: SourceSatellite; instanceRef: StoredRef }) => Promise<boolean>

/**
 * Recognise, for one instance, the project element it already holds for each shared source
 * element — the mapping an earlier placement made. Nothing in the file records it, so it is read
 * from what that placement wrote, strongest evidence first:
 *  1. the project element carries the source element's lineage (it was created from it);
 *  2. it holds a reference to the element that stands, in the project, for one the source element
 *     refers to (the references the mapping contributed to it);
 *  3. it carries the same key (its name);
 *  4. it is the only one left, for the only source element left.
 * Each step pairs a source element with a project element only when neither has another
 * possibility at that step. A source element left unpaired is new to the instance — or, when
 * elements of the instance are left too, undecided: nothing tells which one stands for it.
 */
export async function pairInstanceSatellites(
	reader: MappingReader,
	params: PairInstanceSatellitesParams,
): Promise<InstanceSatellitePairing> {
	const { sourceQuery, sourceSatellites, instanceSatelliteRefs, matchKey } = params

	const pairs = new Map<string, InstanceSatellitePair>()
	const pairedInstanceIds = new Set<string>()

	async function carriesLineage({
		source,
		instanceRef,
	}: Parameters<Qualifies>[0]): Promise<boolean> {
		const sourceUuid = await sourceQuery.any.getAttribute(source.ref, { name: 'uuid' })
		if (!sourceUuid) return false
		const lineage = await reader.any.getAttribute(instanceRef, { name: matchKey })
		return lineage === sourceUuid
	}

	async function sharesReferencedTarget({
		source,
		instanceRef,
	}: Parameters<Qualifies>[0]): Promise<boolean> {
		const sourceTree = await sourceQuery.any.getTree(source.ref)
		const instanceTree = await reader.any.getTree(instanceRef)
		if (!sourceTree || !instanceTree) return false

		const sourceIdentities = new Set<string>()
		await collectReferenceIdentities(sourceQuery, {
			node: sourceTree,
			mapToTemplate: false,
			identities: sourceIdentities,
		})
		if (sourceIdentities.size === 0) return false

		const instanceIdentities = new Set<string>()
		await collectReferenceIdentities(reader, {
			node: instanceTree,
			mapToTemplate: true,
			identities: instanceIdentities,
		})
		return [...sourceIdentities].some((identity) => instanceIdentities.has(identity))
	}

	async function sharesKey({ source, instanceRef }: Parameters<Qualifies>[0]): Promise<boolean> {
		const sourceKey = await sourceQuery.any.getAttribute(source.ref, { name: source.policy.key })
		if (!sourceKey) return false
		const instanceKey = await reader.any.getAttribute(instanceRef, { name: source.policy.key })
		return instanceKey === sourceKey
	}

	async function isLeft(): Promise<boolean> {
		return true
	}

	const steps: { qualifies: Qualifies; projectOwned: boolean }[] = [
		{ qualifies: carriesLineage, projectOwned: false },
		{ qualifies: sharesReferencedTarget, projectOwned: true },
		{ qualifies: sharesKey, projectOwned: true },
		{ qualifies: isLeft, projectOwned: true },
	]

	for (const { qualifies, projectOwned } of steps) {
		const remainingSources = sourceSatellites.filter((source) => !pairs.has(source.ref.id))
		const remainingInstanceRefs = instanceSatelliteRefs.filter(
			(instanceRef) => !pairedInstanceIds.has(instanceRef.id),
		)

		// who qualifies for whom at this step
		const qualifying: { source: SourceSatellite; instanceRef: StoredRef }[] = []
		for (const source of remainingSources) {
			for (const instanceRef of remainingInstanceRefs) {
				if (instanceRef.tagName !== source.policy.tagName) continue
				if (await qualifies({ source, instanceRef })) qualifying.push({ source, instanceRef })
			}
		}

		// a pair is made only when neither side has another possibility
		for (const { source, instanceRef } of qualifying) {
			const sourceIsUnique =
				qualifying.filter((entry) => entry.source.ref.id === source.ref.id).length === 1
			const instanceIsUnique =
				qualifying.filter((entry) => entry.instanceRef.id === instanceRef.id).length === 1
			if (!sourceIsUnique || !instanceIsUnique) continue

			const existing = await reader.any.getRecord(instanceRef)
			if (!existing) continue
			pairs.set(source.ref.id, { existing, projectOwned })
			pairedInstanceIds.add(instanceRef.id)
		}
	}

	const undecidedSourceIds = new Set<string>()
	for (const source of sourceSatellites) {
		if (pairs.has(source.ref.id)) continue
		const instanceElementIsLeft = instanceSatelliteRefs.some(
			(instanceRef) =>
				instanceRef.tagName === source.policy.tagName && !pairedInstanceIds.has(instanceRef.id),
		)
		if (instanceElementIsLeft) undecidedSourceIds.add(source.ref.id)
	}

	return { pairs, undecidedSourceIds }
}

/** The identity of every reference in a subtree: what it points at, in template space. */
async function collectReferenceIdentities(
	reader: MappingReader,
	params: { node: AnyTreeRecord; mapToTemplate: boolean; identities: Set<string> },
): Promise<void> {
	const { node, mapToTemplate, identities } = params
	if (node.tagName in UUID_REFERENCE_PAIRS) {
		const identity = await referenceIdentity(reader, node, { mapToTemplate })
		if (identity) identities.add(identity)
	}
	for (const child of node.tree) {
		await collectReferenceIdentities(reader, { node: child, mapToTemplate, identities })
	}
}
