import { ATTRIBUTES } from '@/v2019C1/definition'
import { RESOLUTION_TYPE, UUID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference/constants'
import { buildPathFromAncestry } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { parseReferencePath } from '@/v2019C1/extensions/reference/query/resolve/parse-path'

import type { PendingResolution, UnsupportedXPathWarning } from './io-hooks.types'
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
 * **Phase 1 — `beforeImportRecord`** (called once per record, in document order):
 *
 * For each record, two things happen:
 * 1. `ensureUuid` — if the element type supports `uuid`, generate and attach one if missing.
 * 2. If it is a *target* element (e.g. `Function`), index its path → uuid in `pathIndex`.
 * 3. If it is a *reference* element (e.g. `FunctionRef`), and only the path attribute is
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
 * **Phase 2 — `afterImport`** (called once, after all records):
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
	const xpathWarnings: UnsupportedXPathWarning[] = []

	const beforeImportRecord = (params: {
		record: AnyRawRecord
		ancestry: readonly AnyRawRecord[]
	}): void => {
		const { record, ancestry } = params
		const { tagName } = record

		const uuid = ensureUuid(record)

		const isTargetElement = uuid && TARGET_ELEMENT_TYPES.has(tagName)
		// Index target elements: build path → uuid mapping
		if (isTargetElement) {
			const path = buildPathFromAncestry({ record, ancestry })
			if (path) pathIndex.set(path, uuid)
		}

		const hasReferences = ELEMENTS_WITH_REFERENCES.has(tagName)
		if (!hasReferences) return

		// Collect pending resolutions for elements with reference pairs
		const pairs = UUID_REFERENCE_PAIRS[tagName as keyof typeof UUID_REFERENCE_PAIRS]
		for (const pair of pairs) {
			const pathValue = record.attributes.find(
				(attribute: AnyAttribute) => attribute.name === pair.attribute.path,
			)?.value

			if (!pathValue) continue

			// Only resolve if uuid is not already set
			const existingUuid = record.attributes.find(
				(attribute: AnyAttribute) => attribute.name === pair.attribute.uuid,
			)?.value

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

			pendingResolutions.push({
				recordId: record.id,
				elementTag: tagName,
				uuidAttributeName: pair.attribute.uuid,
				pathValue,
				lookupKey: parsed.lookupKey,
				fallbackLookupKey: parsed.fallbackLookupKey,
			})
		}
	}

	const afterImport = async (): Promise<AfterImportResult> => {
		const updates: AfterImportResult['updates'] = []
		const warnings: ImportWarning[] = [...xpathWarnings]

		for (const pending of pendingResolutions) {
			const resolvedUuid =
				pathIndex.get(pending.lookupKey) ??
				(pending.fallbackLookupKey ? pathIndex.get(pending.fallbackLookupKey) : undefined)

			if (!resolvedUuid) {
				warnings.push({
					type: 'unresolved-reference',
					recordId: pending.recordId,
					details: {
						elementTag: pending.elementTag,
						uuidAttribute: pending.uuidAttributeName,
						pathValue: pending.pathValue,
						triedKeys: pending.fallbackLookupKey
							? [pending.lookupKey, pending.fallbackLookupKey]
							: [pending.lookupKey],
					},
				})
				continue
			}

			updates.push({
				recordId: pending.recordId,
				attributes: [{ name: pending.uuidAttributeName, value: resolvedUuid }],
			})
		}

		pathIndex.clear()
		pendingResolutions.length = 0
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
 * Set of element types which includes a `uuid` attribute.
 * Pre-computed from the generated ATTRIBUTES constant.
 */
const ELEMENTS_WITH_UUID: ReadonlySet<string> = new Set(
	Object.entries(ATTRIBUTES)
		.filter(([, attributes]) => 'uuid' in attributes)
		.map(([name]) => name),
)

/**
 * Elements that have reference pairs (quick lookup set).
 */
const ELEMENTS_WITH_REFERENCES: Set<string> = new Set(Object.keys(UUID_REFERENCE_PAIRS))

/**
 * All element types that can be targeted by a UUID reference.
 * Built from the `target` arrays in UUID_REFERENCE_PAIRS.
 */
const TARGET_ELEMENT_TYPES: Set<string> = new Set(
	Object.values(UUID_REFERENCE_PAIRS).flatMap((pairs) => pairs.flatMap((pair) => pair.target)),
)

/**
 * Ensures that a record has a `uuid` attribute if its element type supports it.
 * Returns the existing or newly generated uuid, or undefined if the element
 * type does not support uuid in the SCL schema.
 */
export function ensureUuid(record: AnyRawRecord): string | undefined {
	if (!ELEMENTS_WITH_UUID.has(record.tagName)) return undefined

	const existing = record.attributes.find((a: AnyAttribute) => a.name === 'uuid')
	if (existing) return existing.value

	const uuid = crypto.randomUUID()
	record.attributes.push({ name: 'uuid', value: uuid })
	return uuid
}
