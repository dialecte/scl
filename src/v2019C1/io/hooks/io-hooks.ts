import {
	buildElementPath,
	getResolutionType,
	parseReferencePath,
	UUID_REFERENCE_PAIRS,
} from './path-resolution'

import { ATTRIBUTES } from '@/v2019C1/definition'

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
 *
 * Phase 1 (beforeImportRecord): builds a path→uuid index for target elements
 * and collects pending resolutions for elements with path references.
 *
 * Phase 2 (afterImport): resolves each pending path reference to a UUID
 * and bulk-updates the records.
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
			const path = buildElementPath({ record, ancestry })
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

			const parsed = parseReferencePath(tagName, pair.attribute.path, pathValue, ancestry)

			if (!parsed) {
				if (getResolutionType(tagName, pair.attribute.path) === 'unsupported') {
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
		.filter(([, attributes]) => 'uuid' in (attributes as Record<string, unknown>))
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
