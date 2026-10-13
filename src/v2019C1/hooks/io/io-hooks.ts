import {
	REFERENCE_TAG_NAMES,
	TARGET_ELEMENT_TYPES,
	UUID_REFERENCE_PAIRS,
} from '@/v2019C1/constants'
import { MAPPED_NAME_REFS, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import {
	PATH_EXTRACTION_CONFIG,
	SIGNAL_TAG_NAMES,
} from '@/v2019C1/extensions/reference/constants/path-extraction'
import { composeReferencePath } from '@/v2019C1/extensions/reference/query/build/compose-reference-path'
import {
	buildPathFromAncestry,
	joinPathParts,
} from '@/v2019C1/extensions/reference/query/build/path-segment'
import { parseReferencePath } from '@/v2019C1/extensions/reference/query/resolve/parse-path'
import { createMappedDataImport } from '@/v2019C1/hooks/io/mapped-data-import'

import type {
	CollectedSignal,
	IndexedTarget,
	PendingPathFill,
	PendingResolution,
	UnsupportedXPathWarning,
} from './io-hooks.types'
import type { PathSegmentWithRef } from '@/v2019C1/extensions/reference/query/build'
import type {
	AnyAttribute,
	AnyRawRecord,
	IOHooks,
	AfterImportResult,
	ImportWarning,
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
 * 1. If it is a *target* element (e.g. `Function`), index its path → uuid in `pathIndex`.
 * 2. If it is a *reference* element (e.g. `FunctionRef`), and only the path attribute is
 *    present (not the uuid attribute), push a pending resolution.
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
 * **Pass 2 — `afterImport`** (called once, after all records):
 *
 * Each pending resolution is looked up in `pathIndex`:
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
	type Path = string & {}
	type Uuid = string & {}
	const pathIndex: Map<Path, Uuid> = new Map()
	const pendingResolutions: PendingResolution[] = []
	const targetsByUuid: Map<Uuid, IndexedTarget> = new Map()
	const pendingPathFills: PendingPathFill[] = []
	const collectedSignals: CollectedSignal[] = []
	const xpathWarnings: UnsupportedXPathWarning[] = []
	let mappedDataImport = createMappedDataImport()

	const beforeImportRecord = (params: {
		record: AnyRawRecord
		ancestry: readonly AnyRawRecord[]
	}): void => {
		const { record, ancestry } = params
		const { tagName } = record
		mappedDataImport.collect({ record, ancestry })

		// The record is already standardized, so afterStandardizedRecord has
		// enforced a uuid where the element supports one — just read it.
		const uuid = record.attributes.find((attribute) => attribute.name === 'uuid')?.value

		const isTargetElement = uuid && TARGET_ELEMENT_TYPES.has(tagName)
		// A signal is named among its siblings, some of which may come later: it is indexed once
		// the whole file is read.
		if (isTargetElement && SIGNAL_TAG_NAMES.has(tagName)) {
			collectedSignals.push({ record, ancestry: [...ancestry], uuid })
		}
		// Index target elements: build path → uuid mapping
		else if (isTargetElement) {
			const elementPath = buildPathFromAncestry({ record, ancestry })
			if (elementPath) {
				pathIndex.set(elementPath.path, uuid)
				targetsByUuid.set(uuid, { tagName, path: elementPath })
			}
		}

		const hasReferences = REFERENCE_TAG_NAMES.has(tagName)
		if (!hasReferences) return
		// DOS / SDS / DAS mapped data is resolved by its own rules once the pass is over.
		if (MAPPED_NAME_REFS.has(tagName)) return

		// Collect pending resolutions for elements with reference pairs
		const pairs = UUID_REFERENCE_PAIRS[tagName as keyof typeof UUID_REFERENCE_PAIRS]
		for (const pair of pairs) {
			const pathValue = record.attributes.find(
				(attribute: AnyAttribute) => attribute.name === pair.attribute.path,
			)?.value

			const existingUuid = record.attributes.find(
				(attribute: AnyAttribute) => attribute.name === pair.attribute.uuid,
			)?.value

			// A uuid without its path: the path is written once every target is stored. An XPath
			// selector (`unsupported`) is never rebuilt as a name path.
			if (!pathValue) {
				if (existingUuid && pair.resolution !== RESOLUTION_TYPE.unsupported) {
					pendingPathFills.push({
						recordId: record.id,
						pair,
						uuidValue: existingUuid,
						referenceAttributes: record.attributes,
						behaviorContext:
							pair.resolution === RESOLUTION_TYPE.behaviorDescription
								? behaviorContextFromAncestry(ancestry)
								: undefined,
					})
				}
				continue
			}

			// Only resolve if uuid is not already set
			if (existingUuid) continue

			const parsed = parseReferencePath(pair.resolution, pair.attribute.path, pathValue, ancestry)

			if (!parsed) {
				if (pair.resolution === RESOLUTION_TYPE.unsupported) {
					xpathWarnings.push({
						type: 'unsupported-xpath-reference',
						recordId: record.id,
						details: {
							elementTag: tagName,
							pathAttribute: pair.attribute.path,
							uuidAttribute: pair.attribute.uuid,
							pathValue,
						},
					})
				}
				continue
			}

			// Written again in the standard form once resolved: a name local to a BehaviorDescription
			// that names a signal, and a ProcessResource named by its full path by an earlier version.
			const namesSignal =
				(pair.resolution === RESOLUTION_TYPE.behaviorDescription &&
					pair.target.every((target) => SIGNAL_TAG_NAMES.has(target))) ||
				pair.resolution === RESOLUTION_TYPE.ancestorName

			pendingResolutions.push({
				recordId: record.id,
				elementTag: tagName,
				uuidAttributeName: pair.attribute.uuid,
				pathValue,
				lookupKey: parsed.lookupKey,
				fallbackLookupKeys: parsed.fallbackLookupKeys,
				normalize: namesSignal
					? {
							pair,
							referenceAttributes: record.attributes,
							behaviorContext: behaviorContextFromAncestry(ancestry),
						}
					: undefined,
			})
		}
	}

	const afterImport = async (): Promise<AfterImportResult> => {
		const updates: AfterImportResult['updates'] = []
		const warnings: ImportWarning[] = [...xpathWarnings]

		indexSignals({ signals: collectedSignals, pathIndex, targetsByUuid })

		// A reference stored with its uuid only gets the path of the target the uuid names, composed
		// like the record hooks compose it. A uuid naming no element of the file is left alone.
		for (const fill of pendingPathFills) {
			const target = targetsByUuid.get(fill.uuidValue)
			if (!target || !(fill.pair.target as readonly string[]).includes(target.tagName)) continue
			const path = composeReferencePath({
				pair: fill.pair,
				referenceAttributes: fill.referenceAttributes,
				targetPath: target.path,
				behaviorContext: fill.behaviorContext,
			})
			if (!path) continue
			updates.push({
				recordId: fill.recordId,
				attributes: [{ name: fill.pair.attribute.path, value: path }],
			})
		}

		for (const pending of pendingResolutions) {
			const triedKeys = [pending.lookupKey, ...(pending.fallbackLookupKeys ?? [])]
			const resolvedUuid = triedKeys
				.map((key) => pathIndex.get(key))
				.find((uuid) => uuid !== undefined)

			if (!resolvedUuid) {
				warnings.push({
					type: 'unresolved-reference',
					recordId: pending.recordId,
					details: {
						elementTag: pending.elementTag,
						uuidAttribute: pending.uuidAttributeName,
						pathValue: pending.pathValue,
						triedKeys,
					},
				})
				continue
			}

			updates.push({
				recordId: pending.recordId,
				attributes: [
					{ name: pending.uuidAttributeName, value: resolvedUuid },
					...standardPathOf({ pending, target: targetsByUuid.get(resolvedUuid) }),
				],
			})
		}

		const mappedData = await mappedDataImport.resolve({ pathIndex })
		updates.push(...mappedData.updates)
		warnings.push(...mappedData.warnings)
		mappedDataImport = createMappedDataImport()

		pathIndex.clear()
		pendingResolutions.length = 0
		pendingPathFills.length = 0
		collectedSignals.length = 0
		targetsByUuid.clear()
		xpathWarnings.length = 0

		return {
			updates,
			warnings: warnings.length > 0 ? warnings : undefined,
		}
	}

	return {
		beforeImportRecord,
		afterImport,
	}
}

/**
 * The path segments of the parent of the nearest BehaviorDescription in `ancestry` (the
 * BehaviorDescription left out), as the record hooks read them through a query.
 */
function behaviorContextFromAncestry(
	ancestry: readonly AnyRawRecord[],
): PathSegmentWithRef[] | undefined {
	const index = ancestry.findLastIndex((ancestor) => ancestor.tagName === 'BehaviorDescription')
	if (index === -1) return undefined
	const behaviorPath = buildPathFromAncestry({
		record: ancestry[index],
		ancestry: ancestry.slice(0, index),
	})
	return behaviorPath?.segments.slice(0, -1)
}

/**
 * Index every signal under its path, named among its siblings. The name
 * the engine wrote before the standard form (`Trip.general` for a unique input with a pDA,
 * `Trip(2)` for a unique input of instance 2, `Trip` for instance 1 of several) is indexed too,
 * unless it is the standard name of another signal, so a file written by an earlier version
 * still resolves.
 */
function indexSignals(params: {
	signals: readonly CollectedSignal[]
	pathIndex: Map<string, string>
	targetsByUuid: Map<string, IndexedTarget>
}): void {
	const { signals, pathIndex, targetsByUuid } = params

	const siblingsByParent = new Map<string, AnyRawRecord[]>()
	for (const { record } of signals) {
		const parentId = record.parent?.id ?? ''
		siblingsByParent.set(parentId, [...(siblingsByParent.get(parentId) ?? []), record])
	}

	const legacyPaths: [string, string][] = []
	for (const { record, ancestry, uuid } of signals) {
		const siblings = siblingsByParent.get(record.parent?.id ?? '') ?? [record]
		const elementPath = buildPathFromAncestry({ record, ancestry, siblings })
		if (!elementPath) continue
		pathIndex.set(elementPath.path, uuid)
		targetsByUuid.set(uuid, { tagName: record.tagName, path: elementPath })

		const legacyName = legacySignalName(record)
		const parentPath = elementPath.segments.slice(0, -1)
		if (legacyName) {
			legacyPaths.push([
				parentPath.length > 0 ? `${joinPathParts(parentPath)}.${legacyName}` : legacyName,
				uuid,
			])
		}
	}
	for (const [path, uuid] of legacyPaths) {
		if (!pathIndex.has(path)) pathIndex.set(path, uuid)
	}
}

/**
 * The name the engine gave a signal before the standard form: decided by its own values, the
 * instance when not 1, the data attribute when set.
 */
function legacySignalName(record: AnyRawRecord): string | undefined {
	const strategy = PATH_EXTRACTION_CONFIG[record.tagName]
	if (strategy?.type !== 'signal') return undefined
	const read = (name: string) =>
		record.attributes.find((attribute) => attribute.name === name)?.value
	const name = read(strategy.name)
	if (!name) return undefined
	const instance = read(strategy.instance)
	const data = strategy.data ? read(strategy.data) : undefined
	return `${name}${instance && instance !== '1' ? `(${instance})` : ''}${data ? `.${data}` : ''}`
}

/** The standard path of a resolved name local to a BehaviorDescription, when the file wrote another. */
function standardPathOf(params: {
	pending: PendingResolution
	target: IndexedTarget | undefined
}): { name: string; value: string }[] {
	const { pending, target } = params
	if (!pending.normalize || !target) return []
	const path = composeReferencePath({ ...pending.normalize, targetPath: target.path })
	if (!path || path === pending.pathValue) return []
	return [{ name: pending.normalize.pair.attribute.path, value: path }]
}
