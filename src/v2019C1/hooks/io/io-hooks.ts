import { buildImportPathIndex } from './import-path-index'
import { LOCAL_NAME_RESOLUTIONS } from './io-hooks.constants'

import {
	REFERENCE_TAG_NAMES,
	TARGET_ELEMENT_TYPES,
	UUID_REFERENCE_PAIRS,
} from '@/v2019C1/constants'
import { MAPPED_NAME_REFS, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { composeReferencePath } from '@/v2019C1/extensions/reference/query/build/compose-reference-path'
import { buildPathFromAncestry } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { parseReferencePath } from '@/v2019C1/extensions/reference/query/resolve/parse-path'
import { createSpecNamingImport } from '@/v2019C1/hooks/io/lnode-spec-naming-import'
import { createMappedDataImport } from '@/v2019C1/hooks/io/mapped-data-import'

import type {
	CollectedTarget,
	ImportPathIndex,
	PendingPathFill,
	PendingResolution,
	UnsupportedXPathWarning,
} from './io-hooks.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { PathSegmentWithRef } from '@/v2019C1/extensions/reference/query/build'
import type {
	AnyRawRecord,
	IOHooks,
	AfterImportResult,
	ImportWarning,
	RecordPatch,
} from '@dialecte/core'

/**
 * Creates SCL IO hooks for UUID reference resolution.
 * The import pipeline is two-pass:
 *
 * **Pass 1 — `beforeImportRecord`** (called once per record, in document order):
 *
 * Records arrive already standardized, so any `uuid` enforced by
 * `afterStandardizedRecord` is already present — no need to ensure it here.
 * For each record:
 * 1. If it is a *target* element (e.g. `Function`), keep it with its ancestry.
 * 2. If it is a *reference* element (e.g. `FunctionRef`) written with a path, keep it as a
 *    pending resolution. Nothing is parsed yet: a path names an LNode by its `LNodeSpecNaming`,
 *    which the file may give after the elements below the LNode.
 *
 * After processing these two XML records:
 * ```xml
 * <Function name="Fn1" uuid="abc-123" />   <!-- ancestor: S1 > Bay1 > VoltLevel1 -->
 * <FunctionRef function="S1/Bay1/VoltLevel1/Fn1" />
 * ```
 * The internal state is:
 * ```
 * pathIndex         = { "S1/Bay1/VoltLevel1/Fn1": "abc-123" }
 * pendingResolutions = [{ recordId: "ref-id", uuidAttributeName: "functionUuid",
 *                         lookupKey: "S1/Bay1/VoltLevel1/Fn1" }]
 * ```
 *
 * **Pass 2 — `afterImport`** (called once, after all records): every target is indexed under
 * its path (`buildImportPathIndex`), then each pending resolution is parsed and looked up:
 * ```
 * "S1/Bay1/VoltLevel1/Fn1" → "abc-123"   ✓ resolved
 * ```
 * Returns an update instruction:
 * ```
 * { recordId: "ref-id", attributes: [{ name: "functionUuid", value: "abc-123" }] }
 * ```
 * The import pipeline bulk-applies these updates, so the stored `FunctionRef` record
 * ends up with both `function="S1/Bay1/VoltLevel1/Fn1"` and `functionUuid="abc-123"`.
 *
 * Unresolvable references (path not in index) produce an `UnresolvedReferenceWarning`
 * instead of an update.
 *
 */
export function createSclIoHooks(): IOHooks {
	const targets: CollectedTarget[] = []
	const pendingResolutions: PendingResolution[] = []
	const pendingPathFills: PendingPathFill[] = []
	const xpathWarnings: UnsupportedXPathWarning[] = []
	let mappedDataImport = createMappedDataImport()
	let specNamingImport = createSpecNamingImport()

	function beforeImportRecord(params: {
		record: AnyRawRecord
		ancestry: readonly AnyRawRecord[]
	}): void {
		const { record, ancestry } = params
		const { tagName } = record
		mappedDataImport.collect({ record, ancestry })
		specNamingImport.collect({ record, ancestry })

		// The record is already standardized, so afterStandardizedRecord has
		// enforced a uuid where the element supports one — just read it.
		const uuid = readAttribute(record, 'uuid')
		if (uuid && TARGET_ELEMENT_TYPES.has(tagName)) {
			targets.push({ record, ancestry: [...ancestry], uuid })
		}

		if (!REFERENCE_TAG_NAMES.has(tagName)) return
		// DOS / SDS / DAS mapped data is resolved by its own rules once the pass is over.
		if (MAPPED_NAME_REFS.has(tagName)) return

		const pairs = UUID_REFERENCE_PAIRS[tagName as keyof typeof UUID_REFERENCE_PAIRS]
		for (const pair of pairs) {
			collectReference({ record, ancestry, pair })
		}
	}

	function collectReference(params: {
		record: AnyRawRecord
		ancestry: readonly AnyRawRecord[]
		pair: ReferencePair
	}): void {
		const { record, ancestry, pair } = params
		const pathValue = readAttribute(record, pair.attribute.path)
		const uuidValue = readAttribute(record, pair.attribute.uuid)
		const localAncestry = LOCAL_NAME_RESOLUTIONS.has(pair.resolution) ? [...ancestry] : undefined

		// A uuid without its path: the path is written once every target is stored. An XPath
		// selector (`unsupported`) is never rebuilt as a name path.
		if (!pathValue) {
			if (uuidValue && pair.resolution !== RESOLUTION_TYPE.unsupported) {
				pendingPathFills.push({
					recordId: record.id,
					pair,
					uuidValue,
					referenceAttributes: record.attributes,
					ancestry:
						pair.resolution === RESOLUTION_TYPE.behaviorDescription ? localAncestry : undefined,
				})
			}
			return
		}

		if (pair.resolution === RESOLUTION_TYPE.unsupported) {
			if (!uuidValue) {
				xpathWarnings.push({
					type: 'unsupported-xpath-reference',
					recordId: record.id,
					details: {
						elementTag: record.tagName,
						pathAttribute: pair.attribute.path,
						uuidAttribute: pair.attribute.uuid,
						pathValue,
					},
				})
			}
			return
		}

		pendingResolutions.push({
			recordId: record.id,
			elementTag: record.tagName,
			pair,
			pathValue,
			referenceAttributes: record.attributes,
			ancestry: localAncestry,
			uuidValue,
			alwaysStandardize:
				(pair.resolution === RESOLUTION_TYPE.behaviorDescription &&
					pair.target.every((target) => SIGNAL_TAG_NAMES.has(target))) ||
				pair.resolution === RESOLUTION_TYPE.ancestorName,
		})
	}

	async function afterImport(): Promise<AfterImportResult> {
		const updates: RecordPatch[] = []
		const warnings: ImportWarning[] = [...xpathWarnings]

		const specNaming = specNamingImport.resolve()
		const index = buildImportPathIndex({ targets, specNamings: specNaming.namings })

		for (const fill of pendingPathFills) {
			const update = fillPath({ fill, index, specNamings: specNaming.namings })
			if (update) updates.push(update)
		}

		for (const pending of pendingResolutions) {
			const outcome = resolvePending({ pending, index, specNamings: specNaming.namings })
			if (outcome.update) updates.push(outcome.update)
			if (outcome.warning) warnings.push(outcome.warning)
		}

		const mappedData = await mappedDataImport.resolve({ pathIndex: index.byPath })
		updates.push(...mappedData.updates)
		warnings.push(...mappedData.warnings)
		updates.push(...specNaming.updates)
		warnings.push(...specNaming.warnings)

		mappedDataImport = createMappedDataImport()
		specNamingImport = createSpecNamingImport()
		targets.length = 0
		pendingResolutions.length = 0
		pendingPathFills.length = 0
		xpathWarnings.length = 0

		return {
			creates: specNaming.creates,
			updates,
			warnings: warnings.length > 0 ? warnings : undefined,
		}
	}

	return { beforeImportRecord, afterImport }
}

/**
 * A reference stored with its uuid only gets the path of the target the uuid names, composed like
 * the record hooks compose it. A uuid naming no element of the file is left alone.
 */
function fillPath(params: {
	fill: PendingPathFill
	index: ImportPathIndex
	specNamings: ReadonlyMap<string, AnyRawRecord>
}): RecordPatch | undefined {
	const { fill, index, specNamings } = params
	const target = index.targetsByUuid.get(fill.uuidValue)
	if (!target || !(fill.pair.target as readonly string[]).includes(target.tagName)) return undefined
	const path = composeReferencePath({
		pair: fill.pair,
		referenceAttributes: fill.referenceAttributes,
		targetPath: target.path,
		behaviorContext: fill.ancestry
			? behaviorContextFromAncestry({ ancestry: fill.ancestry, specNamings })
			: undefined,
	})
	if (!path) return undefined
	return { recordId: fill.recordId, attributes: [{ name: fill.pair.attribute.path, value: path }] }
}

/**
 * A reference written with a path: parsed now that every LNode's naming is known, looked up, and
 * given the uuid it names. Its path is written again in the standard form when it resolved through
 * a former path, or always for the names that must be (`alwaysStandardize`). A reference that
 * already has its uuid only has a former path rewritten, when it names that same element.
 */
function resolvePending(params: {
	pending: PendingResolution
	index: ImportPathIndex
	specNamings: ReadonlyMap<string, AnyRawRecord>
}): { update?: RecordPatch; warning?: ImportWarning } {
	const { pending, index, specNamings } = params
	const parsed = parseReferencePath({
		resolution: pending.pair.resolution,
		pathAttribute: pending.pair.attribute.path,
		pathValue: pending.pathValue,
		ancestry: pending.ancestry,
		specNamings,
	})
	if (!parsed) return {}

	const triedKeys = [parsed.lookupKey, ...(parsed.fallbackLookupKeys ?? [])]
	const matchedKey = triedKeys.find((key) => index.byPath.has(key))
	const resolvedUuid = matchedKey ? index.byPath.get(matchedKey) : undefined

	if (pending.uuidValue) {
		if (!matchedKey || resolvedUuid !== pending.uuidValue || !index.legacyKeys.has(matchedKey)) {
			return {}
		}
		const standard = standardPathOf({ pending, index, uuid: resolvedUuid, specNamings })
		return standard.length > 0
			? { update: { recordId: pending.recordId, attributes: standard } }
			: {}
	}

	if (!resolvedUuid || !matchedKey) {
		return {
			warning: {
				type: 'unresolved-reference',
				recordId: pending.recordId,
				details: {
					elementTag: pending.elementTag,
					uuidAttribute: pending.pair.attribute.uuid,
					pathValue: pending.pathValue,
					triedKeys,
				},
			},
		}
	}

	const rewrite = pending.alwaysStandardize || index.legacyKeys.has(matchedKey)
	return {
		update: {
			recordId: pending.recordId,
			attributes: [
				{ name: pending.pair.attribute.uuid, value: resolvedUuid },
				...(rewrite ? standardPathOf({ pending, index, uuid: resolvedUuid, specNamings }) : []),
			],
		},
	}
}

/** The standard path of a resolved reference, when the file wrote another. */
function standardPathOf(params: {
	pending: PendingResolution
	index: ImportPathIndex
	uuid: string
	specNamings: ReadonlyMap<string, AnyRawRecord>
}): { name: string; value: string }[] {
	const { pending, index, uuid, specNamings } = params
	const target = index.targetsByUuid.get(uuid)
	if (!target) return []
	const path = composeReferencePath({
		pair: pending.pair,
		referenceAttributes: pending.referenceAttributes,
		targetPath: target.path,
		behaviorContext: pending.ancestry
			? behaviorContextFromAncestry({ ancestry: pending.ancestry, specNamings })
			: undefined,
	})
	if (!path || path === pending.pathValue) return []
	return [{ name: pending.pair.attribute.path, value: path }]
}

/**
 * The path segments of the parent of the nearest BehaviorDescription in `ancestry` (the
 * BehaviorDescription left out), as the record hooks read them through a query.
 */
function behaviorContextFromAncestry(params: {
	ancestry: readonly AnyRawRecord[]
	specNamings: ReadonlyMap<string, AnyRawRecord>
}): PathSegmentWithRef[] | undefined {
	const { ancestry, specNamings } = params
	const index = ancestry.findLastIndex((ancestor) => ancestor.tagName === 'BehaviorDescription')
	if (index === -1) return undefined
	const behaviorPath = buildPathFromAncestry({
		record: ancestry[index],
		ancestry: ancestry.slice(0, index),
		specNamings,
	})
	return behaviorPath?.segments.slice(0, -1)
}

function readAttribute(record: AnyRawRecord, name: string): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}
