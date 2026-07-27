import { splitLnodeQualifier } from '../resolve/parse-path'
import { buildElementPath } from './build-element-path'
import { getPathSegment } from './path-segment'

import { toRawRecord } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE, MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference'

import type { Scl, Config } from '@/v2019C1/config'
import type { ResolutionType, ReferencePair } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * Build the path value to store on a REF element's path attribute
 * when pointing at a given target.
 *
 * Derives resolution strategy and path attribute from `UUID_REFERENCE_PAIRS`
 * using `reference.tagName` + `target.tagName`. For lnode resolution,
 * reads the REF's current path value to preserve the DO/DA qualifier.
 *
 * `unsupported` marks a path we cannot *parse* (path -> target) during streaming
 * (e.g. `VariableApplyTo.element` may be an XPath). The reverse direction
 * (target -> path) is still buildable from the resolved target: we write a plain
 * name-path, which is a coherent single-target form (a simple name-path is also a
 * valid XPath) and keeps uuid + name references in agreement (61850-6 §8.5.6).
 *
 * @param query   - Active document query
 * @param params  - reference (the REF element) + target (the element it points to)
 * @returns The computed path value, or null if unresolvable
 */
export async function buildReferencePath(
	query: Core.Query<Config>,
	params: {
		reference: Scl.Ref<Scl.ElementsOf>
		target: Scl.Ref<Scl.ElementsOf>
	},
): Promise<string | null> {
	const { reference, target } = params

	// DOS/SDS/DAS `mappedDoName`/`mappedDaName` is authored short-name mapping
	// documentation, not a rebuildable ObjectReference. Never regenerate it here —
	// that would re-expand it into a full path and break rename/clone cascades. Its
	// value is produced by `buildMappedName` (dispatched from the create/update hook).
	if (MAPPED_NAME_REFS.has(reference.tagName)) return null

	const pair = findPair(reference.tagName, target.tagName)
	if (!pair) return null

	const resolution = pair.resolution as ResolutionType

	if (resolution === RESOLUTION_TYPE.behaviorDescription) {
		const record = await query.getRecord(target)
		if (!record) return null
		return getPathSegment(toRawRecord(record))?.segment ?? null
	}

	const elementPath = await buildElementPath(query, target)
	if (!elementPath) return null
	const basePath = elementPath.path

	if (resolution === RESOLUTION_TYPE.lnode) {
		const refRecord = await query.getRecord(reference)
		if (!refRecord) return basePath
		// A path that stops at the LN level is a valid companions-only form (the
		// DO/DA lives in the companion attributes); leave it at that level. Only when
		// the path already carries a DO/DA qualifier do the companions drive its value.
		const currentQualifier = currentPathQualifier(refRecord, pair)
		if (!currentQualifier) return basePath
		const qualifier = qualifierFromCompanions(refRecord, pair) ?? currentQualifier
		return `${basePath}.${qualifier}`
	}

	// direct + unsupported: the plain name-path to the target.
	return basePath
}

/**
 * Build the DO[.DA] qualifier from the companion name attributes (the
 * authoritative expression of the DO/DA), so a rebind done by editing
 * `sourceDoName`/`sourceDaName` (or their peers) is reflected in the path.
 * Returns undefined when no companion DO name is set.
 */
function qualifierFromCompanions(
	record: { attributes: readonly { name: string; value: string }[] },
	pair: ReferencePair,
): string | undefined {
	const [doCompanion, daCompanion] = pair.companions
	if (!doCompanion) return undefined
	const doValue = record.attributes.find((a) => a.name === doCompanion.name)?.value
	if (!doValue) return undefined
	const daValue = daCompanion
		? record.attributes.find((a) => a.name === daCompanion.name)?.value
		: undefined
	return daValue ? `${doValue}.${daValue}` : doValue
}

/** The DO[.DA] qualifier currently embedded in the reference's own path value. */
function currentPathQualifier(
	record: { attributes: readonly { name: string; value: string }[] },
	pair: ReferencePair,
): string | undefined {
	const currentValue = record.attributes.find((a) => a.name === pair.attribute.path)?.value
	if (!currentValue) return undefined
	return splitLnodeQualifier(currentValue).qualifier
}

function findPair(referenceTagName: string, targetTagName: string): ReferencePair | null {
	const pairs = UUID_REFERENCE_PAIRS[referenceTagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return null
	return pairs.find((p) => p.target.includes(targetTagName as never)) ?? null
}
