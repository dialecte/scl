import { buildElementPath } from './build-element-path'
import { buildMappedLNodePath } from './build-mapped-lnode-path'
import { composeReferencePath } from './compose-reference-path'
import { isFunctionScoped } from './function-scope'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE, MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import { functionBasesOfReferrer } from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'

import type { ReferrerContext } from './compose-reference-path.types'
import type { ElementPath, PathSegmentWithRef } from './path-segment.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type {
	FunctionBases,
	FunctionBasesCache,
} from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path.types'
import type * as Core from '@dialecte/core'

/**
 * Build the path value to store on a REF element's path attribute
 * when pointing at a given target.
 *
 * Derives resolution strategy and path attribute from `UUID_REFERENCE_PAIRS`
 * using `reference.tagName` + `target.tagName`, reads the parts through the query
 * (the target's path, the reference's own attributes, the BehaviorDescription's
 * parent), and composes them with `composeReferencePath`.
 *
 * `unsupported` marks a path we cannot *parse* (path -> target) during streaming
 * (e.g. `VariableApplyTo.element` may be an XPath). The reverse direction
 * (target -> path) is still buildable from the resolved target: we write a plain
 * name-path, which is a coherent single-target form (a simple name-path is also a
 * valid XPath) and keeps uuid + name references in agreement.
 *
 * A signal role's reference (`scope: 'function'`) is written below the function the FunctionRef
 * holding it names, read through the query too.
 *
 * @intent compute the path value of a reference (SourceRef, FunctionRef, ...) to a target, write a reference attribute pointing at an element, refresh a stale reference path
 *
 * @param query   - Active document query
 * @param params  - reference (the REF element) + target (the element it points to), the
 *                  target's path when the caller already read it (several references to one target),
 *                  where the referrer's LNode is mapped when the caller holds it as the store
 *                  does not yet (an `ied-address` path), and where its signal role path starts
 *                  (`functionBases`) when the caller read it for several references below one FunctionRef, or a
 *                  `functionBasesCache` shared by the references of a loop
 * @returns The computed path value, or null if unresolvable
 */
export async function buildReferencePath(
	query: Core.Query<Config>,
	params: {
		reference: Scl.Ref<Scl.ElementsOf>
		target: Scl.Ref<Scl.ElementsOf>
		targetPath?: ElementPath
		referrerContext?: ReferrerContext
		functionBases?: FunctionBases
		functionBasesCache?: FunctionBasesCache
	},
): Promise<string | null> {
	const { reference, target } = params

	// DOS/SDS/DAS `mappedDoName`/`mappedDaName` is a data path inside the logical node
	// named by `mappedLnUuid`, not a path to the target element. The create/update hooks
	// store it; never rebuild it here.
	if (MAPPED_NAME_REFS.has(reference.tagName)) return null

	const pair = findPair(reference.tagName, target.tagName)
	if (!pair) return null

	const targetPath = params.targetPath ?? (await buildElementPath(query, target))
	if (!targetPath) return null

	const referenceRecord = await query.getRecord(reference)
	const behaviorContext =
		pair.resolution === RESOLUTION_TYPE.behaviorDescription && referenceRecord?.parent
			? await behaviorContextOf(query, referenceRecord.parent as Scl.Ref<Scl.ElementsOf>)
			: undefined

	const referrerContext =
		params.referrerContext ??
		(pair.resolution === RESOLUTION_TYPE.iedAddress && referenceRecord?.parent
			? await referrerContextOf(query, referenceRecord.parent as Scl.Ref<Scl.ElementsOf>)
			: undefined)

	const functionBases =
		params.functionBases ??
		(isFunctionScoped(pair) && referenceRecord
			? await functionBasesOfReferrer(query, {
					record: referenceRecord,
					cache: params.functionBasesCache,
				})
			: undefined)

	return composeReferencePath({
		pair,
		referenceAttributes: referenceRecord?.attributes ?? [],
		targetPath,
		behaviorContext,
		referrerContext,
		functionBase: functionBases?.functionPath.segments,
	})
}

/**
 * Where the LNode holding a signal is mapped: the signal sits in the inputs or outputs of its
 * LNode (`signalContainer`), possibly in a `Private`. `undefined` when no LNode holds it.
 */
async function referrerContextOf(
	query: Core.Query<Config>,
	signalContainer: Scl.Ref<Scl.ElementsOf>,
): Promise<ReferrerContext | undefined> {
	let holder: Scl.Ref<Scl.ElementsOf> | undefined = signalContainer
	while (holder && holder.tagName !== 'LNode') {
		const record = await query.getRecord(holder)
		holder = (record?.parent ?? undefined) as Scl.Ref<Scl.ElementsOf> | undefined
	}
	if (!holder) return undefined
	const lnodeAttributes = await query.getAttributes(holder as Scl.Ref<'LNode'>)
	return { mappedLnPath: buildMappedLNodePath(lnodeAttributes) }
}

/** The path segments of the parent of a BehaviorDescription (the BehaviorDescription left out). */
async function behaviorContextOf(
	query: Core.Query<Config>,
	behaviorDescription: Scl.Ref<Scl.ElementsOf>,
): Promise<PathSegmentWithRef[] | undefined> {
	const behaviorPath = await buildElementPath(query, behaviorDescription)
	return behaviorPath?.segments.slice(0, -1)
}

function findPair(referenceTagName: string, targetTagName: string): ReferencePair | null {
	const pairs = UUID_REFERENCE_PAIRS[referenceTagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return null
	return pairs.find((p) => p.target.includes(targetTagName as never)) ?? null
}
