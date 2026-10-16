import { buildImportPathIndex } from './import-path-index'
import { LOCAL_NAME_RESOLUTIONS } from './io-hooks.constants'

import {
	GROUNDED_CONNECTIVITY_NODE_NAME,
	REFERENCE_TAG_NAMES,
	TARGET_ELEMENT_TYPES,
	UUID_REFERENCE_PAIRS,
} from '@/v2019C1/constants'
import { createDataTypeIndex } from '@/v2019C1/extensions/data-model/query/create-data-type-index'
import { splitDataPath } from '@/v2019C1/extensions/data-model/query/split-data-path'
import { MAPPED_NAME_REFS, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { buildMappedLNodePath } from '@/v2019C1/extensions/reference/query/build/build-mapped-lnode-path'
import {
	composeDerivedAttributes,
	derivedAttributesFollowing,
} from '@/v2019C1/extensions/reference/query/build/compose-derived-attributes'
import { composeReferencePath } from '@/v2019C1/extensions/reference/query/build/compose-reference-path'
import { dataCompanionsOf } from '@/v2019C1/extensions/reference/query/build/data-companions'
import {
	functionBaseOf,
	isFunctionScoped,
} from '@/v2019C1/extensions/reference/query/build/function-scope'
import { buildPathFromAncestry } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readRawAttributes } from '@/v2019C1/extensions/reference/query/build/raw-attribute'
import { parseReferencePath } from '@/v2019C1/extensions/reference/query/resolve/parse-path'
import { createSpecNamingImport } from '@/v2019C1/hooks/io/lnode-spec-naming-import'
import { createMappedDataImport } from '@/v2019C1/hooks/io/mapped-data-import'
import { createTupleReferenceImport } from '@/v2019C1/hooks/io/tuple-reference-import'

import type {
	AttributeChanges,
	CollectedElement,
	CollectedTarget,
	ImportPathIndex,
	PendingPathFill,
	PendingResolution,
	UnsupportedXPathWarning,
} from './io-hooks.types'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type { DerivedAttributeValue, ReferencePair } from '@/v2019C1/extensions/reference'
import type {
	ElementPath,
	PathSegmentWithRef,
	ReferrerContext,
} from '@/v2019C1/extensions/reference/query/build'
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
	const ownPathElements: CollectedElement[] = []
	let mappedDataImport = createMappedDataImport()
	let specNamingImport = createSpecNamingImport()
	const tupleReferenceImport = createTupleReferenceImport()
	let dataTypeIndex = createDataTypeIndex()

	function beforeImportRecord(params: {
		record: AnyRawRecord
		ancestry: readonly AnyRawRecord[]
	}): void {
		const { record, ancestry } = params
		const { tagName } = record
		mappedDataImport.collect({ record, ancestry })
		specNamingImport.collect({ record, ancestry })
		tupleReferenceImport.collect({ record, ancestry })
		dataTypeIndex.add({ record, ancestry })

		// The record is already standardized, so afterStandardizedRecord has
		// enforced a uuid where the element supports one — just read it.
		const uuid = readAttribute(record, 'uuid')
		if (uuid && TARGET_ELEMENT_TYPES.has(tagName)) {
			targets.push({ record, ancestry: [...ancestry], uuid })
		}
		if (derivedAttributesFollowing({ tagName, follows: 'self' })) {
			ownPathElements.push({ record, ancestry: [...ancestry] })
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
		const localAncestry =
			LOCAL_NAME_RESOLUTIONS.has(pair.resolution) || isFunctionScoped(pair)
				? [...ancestry]
				: undefined

		// A uuid without its path: the path is written once every target is stored. An XPath
		// selector (`unsupported`) is never rebuilt as a name path.
		if (!pathValue) {
			if (uuidValue && pair.resolution !== RESOLUTION_TYPE.unsupported) {
				pendingPathFills.push({
					recordId: record.id,
					elementTag: record.tagName,
					pair,
					uuidValue,
					referenceAttributes: record.attributes,
					ancestry:
						pair.resolution === RESOLUTION_TYPE.behaviorDescription ||
						pair.resolution === RESOLUTION_TYPE.iedAddress
							? localAncestry
							: undefined,
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
				pair.resolution === RESOLUTION_TYPE.ancestorName ||
				isFunctionScoped(pair),
		})
	}

	async function afterImport(): Promise<AfterImportResult> {
		const updates: RecordPatch[] = []
		const warnings: ImportWarning[] = [...xpathWarnings]

		const specNaming = specNamingImport.resolve()
		const index = buildImportPathIndex({ targets, specNamings: specNaming.namings })
		const dataTypes = dataTypeIndex.build()

		for (const fill of pendingPathFills) {
			const outcome = fillPath({ fill, index, specNamings: specNaming.namings })
			if (outcome.update) updates.push(outcome.update)
			warnings.push(...outcome.warnings)
		}

		for (const pending of pendingResolutions) {
			const outcome = resolvePending({
				pending,
				index,
				specNamings: specNaming.namings,
				dataTypes,
			})
			if (outcome.update) updates.push(outcome.update)
			warnings.push(...outcome.warnings)
		}

		for (const element of ownPathElements) {
			const outcome = ownPathAttributesOf({ element, specNamings: specNaming.namings })
			if (outcome.update) updates.push(outcome.update)
			warnings.push(...outcome.warnings)
		}

		const mappedData = await mappedDataImport.resolve({ pathIndex: index.byPath })
		updates.push(...mappedData.updates)
		warnings.push(...mappedData.warnings)
		updates.push(...specNaming.updates)
		warnings.push(...specNaming.warnings)
		updates.push(...tupleReferenceImport.resolve().updates)

		mappedDataImport = createMappedDataImport()
		specNamingImport = createSpecNamingImport()
		dataTypeIndex = createDataTypeIndex()
		targets.length = 0
		pendingResolutions.length = 0
		pendingPathFills.length = 0
		ownPathElements.length = 0
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
 * the record hooks compose it, and the attributes it writes from that path. A uuid naming no
 * element of the file is left alone.
 */
function fillPath(params: {
	fill: PendingPathFill
	index: ImportPathIndex
	specNamings: ReadonlyMap<string, AnyRawRecord>
}): { update?: RecordPatch; warnings: ImportWarning[] } {
	const { fill, index, specNamings } = params
	const target = index.targetsByUuid.get(fill.uuidValue)
	if (!target || !(fill.pair.target as readonly string[]).includes(target.tagName)) {
		return { warnings: [] }
	}
	const path = composeReferencePath({
		pair: fill.pair,
		referenceAttributes: fill.referenceAttributes,
		targetPath: target.path,
		behaviorContext: fill.ancestry
			? behaviorContextFromAncestry({ ancestry: fill.ancestry, specNamings })
			: undefined,
		referrerContext: referrerContextFromAncestry({ pair: fill.pair, ancestry: fill.ancestry }),
	})
	if (!path) return { warnings: [] }
	const changes = derivedChangesOf({
		tagName: fill.elementTag,
		pair: fill.pair,
		targetPath: target.path,
		referenceAttributes: fill.referenceAttributes,
	})
	return {
		update: patchFrom({
			recordId: fill.recordId,
			attributes: [{ name: fill.pair.attribute.path, value: path }, ...changes.attributes],
			removeAttributes: changes.removeAttributes,
		}),
		warnings: incoherentPathNamesWarnings({
			recordId: fill.recordId,
			elementTag: fill.elementTag,
			changes,
		}),
	}
}

/**
 * The attributes an element writes from its own path (a connectivity node's `pathName`), where
 * they differ from what the file gives: its position wins.
 */
function ownPathAttributesOf(params: {
	element: CollectedElement
	specNamings: ReadonlyMap<string, AnyRawRecord>
}): { update?: RecordPatch; warnings: ImportWarning[] } {
	const { element, specNamings } = params
	const { record, ancestry } = element
	const derived = derivedAttributesFollowing({ tagName: record.tagName, follows: 'self' })
	const ownPath = buildPathFromAncestry({ record, ancestry, specNamings })
	if (!derived || !ownPath) return { warnings: [] }

	const changes = attributeChangesOf({
		values: composeDerivedAttributes({ derived, sourcePath: ownPath }),
		current: record.attributes,
	})
	return {
		update: patchFrom({ recordId: record.id, ...changes }),
		warnings: incoherentPathNamesWarnings({
			recordId: record.id,
			elementTag: record.tagName,
			changes,
		}),
	}
}

/**
 * A reference written with a path: parsed now that every LNode's naming is known, looked up, and
 * given the uuid it names. Its path is written again in the standard form when it resolved through
 * a former path, or always for the names that must be (`alwaysStandardize`). A reference that
 * already has its uuid only has a former path rewritten, when it names that same element. Either
 * way, the attributes it writes from the target's path (a terminal's level names) are made to
 * agree with that path.
 */
function resolvePending(params: {
	pending: PendingResolution
	index: ImportPathIndex
	specNamings: ReadonlyMap<string, AnyRawRecord>
	dataTypes: DataTypes
}): { update?: RecordPatch; warnings: ImportWarning[] } {
	const { pending, index, specNamings, dataTypes } = params
	const scoped = isFunctionScoped(pending.pair)
	const functionBase = scoped
		? functionBaseOfReferrer({ ancestry: pending.ancestry, index })
		: undefined
	if (scoped && functionBase === undefined) return { warnings: [] }
	const parsed = parseReferencePath({
		resolution: pending.pair.resolution,
		pathAttribute: pending.pair.attribute.path,
		pathValue: pending.pathValue,
		ancestry: pending.ancestry,
		specNamings,
		functionBase,
	})
	if (!parsed) return { warnings: [] }

	const triedKeys = [parsed.lookupKey, ...(parsed.fallbackLookupKeys ?? [])]
	const matchedKey = triedKeys.find((key) => index.byPath.has(key))
	const resolvedUuid = matchedKey ? index.byPath.get(matchedKey) : undefined
	// A path in a form an earlier version wrote: a former name, or an absolute signal role path.
	const formerForm =
		matchedKey !== undefined &&
		(index.legacyKeys.has(matchedKey) || (scoped && matchedKey !== parsed.lookupKey))

	if (pending.uuidValue) {
		return resolveWithUuid({
			pending,
			uuid: pending.uuidValue,
			index,
			specNamings,
			pathNamesIt: resolvedUuid === pending.uuidValue,
			formerForm,
		})
	}

	if (!resolvedUuid || !matchedKey) {
		if (namesUndeclaredGroundedNode(pending)) return { warnings: [] }
		return {
			warnings: [
				{
					type: 'unresolved-reference',
					recordId: pending.recordId,
					details: {
						elementTag: pending.elementTag,
						uuidAttribute: pending.pair.attribute.uuid,
						pathValue: pending.pathValue,
						triedKeys,
					},
				},
			],
		}
	}

	const dataNames = dataNamesOfPath({
		pending,
		qualifier: parsed.qualifier,
		lnType: index.targetsByUuid.get(resolvedUuid)?.lnType,
		dataTypes,
	})
	if (dataNames === undefined) return { warnings: [dataPathNotSplitWarning(pending)] }

	const rewrite = pending.alwaysStandardize || formerForm
	return patchOf({
		pending,
		index,
		uuid: resolvedUuid,
		attributes: [
			{ name: pending.pair.attribute.uuid, value: resolvedUuid },
			...(rewrite ? standardPathOf({ pending, index, uuid: resolvedUuid, specNamings }) : []),
			...dataNames,
		],
	})
}

/**
 * The data names a reference written with the path of an LNode (`.PhV.phsA.cVal.mag.f` after it)
 * gets beside the uuid written from that path: the data object and the data attribute, split
 * against the data model of the logical node type of the LNode the path names. An empty name counts
 * as absent. Nothing is written when the data object is already there; a data attribute name there
 * without it is kept, the data object written when the split agrees with it. `undefined` when the
 * registry requires the data object beside the uuid and it can be neither found nor split exactly:
 * the uuid is then not written.
 */
function dataNamesOfPath(params: {
	pending: PendingResolution
	qualifier: string | undefined
	lnType: string | undefined
	dataTypes: DataTypes
}): { name: string; value: string }[] | undefined {
	const { pending, qualifier, lnType, dataTypes } = params
	const { doAttribute, daAttribute, doRequired } = dataCompanionsOf(pending.pair)
	if (!doAttribute) return []
	const held = (name: string | undefined) =>
		pending.referenceAttributes.find((attribute) => attribute.name === name)?.value || undefined
	if (held(doAttribute)) return []

	const daHeld = held(daAttribute)
	const split =
		qualifier && lnType
			? splitDataPath({ qualifier, lnType, types: dataTypes, dataObjectOnly: !daAttribute })
			: undefined
	if (!split || (daHeld !== undefined && split.daName !== daHeld))
		return doRequired ? undefined : []
	return [
		{ name: doAttribute, value: split.doName },
		...(daHeld === undefined && split.daName !== undefined && daAttribute
			? [{ name: daAttribute, value: split.daName }]
			: []),
	]
}

/** A reference whose LNode path cannot be given the data-object name a data reference by uuid carries: left as read. */
function dataPathNotSplitWarning(pending: PendingResolution): ImportWarning {
	return {
		type: 'data-path-not-split',
		recordId: pending.recordId,
		details: {
			elementTag: pending.elementTag,
			pathAttribute: pending.pair.attribute.path,
			pathValue: pending.pathValue,
		},
	}
}

/**
 * A reference the file gives both a path and a uuid. When the path names the element the uuid
 * names, only a former path is written again. When it names another element, or none, the uuid
 * wins: the path is written from the element the uuid names, and the disagreement is reported. A
 * uuid naming no element of the file (an element of another file) is kept as read.
 */
function resolveWithUuid(params: {
	pending: PendingResolution
	uuid: string
	index: ImportPathIndex
	specNamings: ReadonlyMap<string, AnyRawRecord>
	pathNamesIt: boolean
	formerForm: boolean
}): { update?: RecordPatch; warnings: ImportWarning[] } {
	const { pending, uuid, index, specNamings, pathNamesIt, formerForm } = params
	if (pathNamesIt) {
		const standard = formerForm ? standardPathOf({ pending, index, uuid, specNamings }) : []
		return patchOf({ pending, index, uuid, attributes: standard })
	}

	const target = index.targetsByUuid.get(uuid)
	if (!target || !(pending.pair.target as readonly string[]).includes(target.tagName)) {
		return { warnings: [] }
	}
	// a path that cannot be written from the element the uuid names (outside the context a local
	// name is read in) is kept as read
	const standard = standardPathOf({ pending, index, uuid, specNamings })
	if (standard.length === 0) return { warnings: [] }
	const outcome = patchOf({ pending, index, uuid, attributes: standard })
	return { update: outcome.update, warnings: [incoherentReferenceWarning(pending)] }
}

/** A terminal naming the predefined grounded node, which a file need not declare. */
function namesUndeclaredGroundedNode(pending: PendingResolution): boolean {
	const targetsNode = (pending.pair.target as readonly string[]).includes('ConnectivityNode')
	return targetsNode && pending.pathValue.split('/').at(-1) === GROUNDED_CONNECTIVITY_NODE_NAME
}

function incoherentReferenceWarning(pending: PendingResolution): ImportWarning {
	return {
		type: 'incoherent-reference',
		recordId: pending.recordId,
		details: {
			elementTag: pending.elementTag,
			pathAttribute: pending.pair.attribute.path,
			pathValue: pending.pathValue,
			uuidAttribute: pending.pair.attribute.uuid,
			uuidValue: pending.uuidValue,
		},
	}
}

/**
 * The patch of a reference resolved to the element `uuid` names: `attributes`, then the attributes
 * the reference writes from that element's path where they differ from what it holds.
 */
function patchOf(params: {
	pending: PendingResolution
	index: ImportPathIndex
	uuid: string
	attributes: readonly { name: string; value: string }[]
}): { update?: RecordPatch; warnings: ImportWarning[] } {
	const { pending, index, uuid } = params
	const target = index.targetsByUuid.get(uuid)
	const changes = target
		? derivedChangesOf({
				tagName: pending.elementTag,
				pair: pending.pair,
				targetPath: target.path,
				referenceAttributes: pending.referenceAttributes,
			})
		: undefined
	const warnings = changes
		? incoherentPathNamesWarnings({
				recordId: pending.recordId,
				elementTag: pending.elementTag,
				changes,
			})
		: []
	const update = patchFrom({
		recordId: pending.recordId,
		attributes: [...params.attributes, ...(changes?.attributes ?? [])],
		removeAttributes: changes?.removeAttributes ?? [],
	})
	return { update, warnings }
}

/** A patch setting `attributes` and removing `removeAttributes`, or none when both are empty. */
function patchFrom(params: {
	recordId: string
	attributes: readonly { name: string; value: string }[]
	removeAttributes: readonly string[]
}): RecordPatch | undefined {
	const { recordId, attributes, removeAttributes } = params
	if (attributes.length === 0 && removeAttributes.length === 0) return undefined
	return {
		recordId,
		attributes: [...attributes],
		...(removeAttributes.length > 0 ? { removeAttributes } : {}),
	}
}

/**
 * The attributes a reference writes from its target's path (see `DERIVED_REFERENCE_ATTRIBUTES`),
 * where they differ from what it holds: the values to set, and the attributes to remove.
 */
function derivedChangesOf(params: {
	tagName: string
	pair: ReferencePair
	targetPath: ElementPath
	referenceAttributes: readonly { name: string; value: string }[]
}): AttributeChanges {
	const { tagName, pair, targetPath, referenceAttributes } = params
	const derived = derivedAttributesFollowing({ tagName, follows: pair.attribute.path })
	if (!derived) return { attributes: [], removeAttributes: [], incoherent: [] }
	return attributeChangesOf({
		values: composeDerivedAttributes({ derived, sourcePath: targetPath }),
		current: referenceAttributes,
	})
}

/**
 * The values that differ from `current`: those to set, and the attributes to remove. A value the
 * file gave (not empty) that differs is listed as incoherent too.
 */
function attributeChangesOf(params: {
	values: readonly DerivedAttributeValue[]
	current: readonly { name: string; value: string }[]
}): AttributeChanges {
	const { values, current } = params
	const changes: AttributeChanges = { attributes: [], removeAttributes: [], incoherent: [] }
	for (const { name, value } of values) {
		const held = current.find((attribute) => attribute.name === name)?.value
		if (held === value) continue
		if (value === undefined) changes.removeAttributes.push(name)
		else changes.attributes.push({ name, value })
		if (held) changes.incoherent.push({ name, value: held, expected: value })
	}
	return changes
}

/** The warning for attributes written from a path that the file gave other values. */
function incoherentPathNamesWarnings(params: {
	recordId: string
	elementTag: string
	changes: AttributeChanges
}): ImportWarning[] {
	const { recordId, elementTag, changes } = params
	if (changes.incoherent.length === 0) return []
	return [
		{
			type: 'incoherent-path-names',
			recordId,
			details: { elementTag, attributes: changes.incoherent },
		},
	]
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
		referrerContext: referrerContextFromAncestry({
			pair: pending.pair,
			ancestry: pending.ancestry,
		}),
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

/**
 * Where the LNode holding an `ied-address` reference is mapped, as the record hooks read it through
 * a query: the nearest LNode of `ancestry`. `undefined` for any other reference.
 */
function referrerContextFromAncestry(params: {
	pair: ReferencePair
	ancestry: readonly AnyRawRecord[] | undefined
}): ReferrerContext | undefined {
	const { pair, ancestry } = params
	if (pair.resolution !== RESOLUTION_TYPE.iedAddress) return undefined
	const lnode = ancestry?.findLast((ancestor) => ancestor.tagName === 'LNode')
	return lnode ? { mappedLnPath: buildMappedLNodePath(readRawAttributes(lnode)) } : undefined
}

/**
 * The path of the Function a signal role's reference starts below: the Function, or the nearest one
 * above the SubFunction, that its `FunctionRef` names (by uuid, else by path).
 */
function functionBaseOfReferrer(params: {
	ancestry: readonly AnyRawRecord[] | undefined
	index: ImportPathIndex
}): string | undefined {
	const { ancestry, index } = params
	const functionRef = ancestry?.findLast((ancestor) => ancestor.tagName === 'FunctionRef')
	if (!functionRef) return undefined
	const functionPath = readAttribute(functionRef, 'function')
	const uuid =
		readAttribute(functionRef, 'functionUuid') ??
		(functionPath ? index.byPath.get(functionPath) : undefined)
	const target = uuid ? index.targetsByUuid.get(uuid) : undefined
	return target ? (functionBaseOf(target.path) ?? undefined) : undefined
}

function readAttribute(record: AnyRawRecord, name: string): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}
