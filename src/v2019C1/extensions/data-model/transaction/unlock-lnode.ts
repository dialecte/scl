import { releaseLNodeBinding } from './release-lnode-binding'
import {
	DATA_INSTANCE_NAMING_ATTRIBUTES,
	DATA_INSTANCE_TAGS,
	NOTHING_GONE,
	SETTING_GROUP_ATTRIBUTE,
	SPECIFIED_VALUE_TAG,
} from './unlock-lnode.constants'

import { LNODE_TYPE_ATTRIBUTE } from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { isLNodeLocked } from '@/v2019C1/extensions/data-model/query/is-lnode-locked'
import { readValueTypes } from '@/v2019C1/extensions/data-model/query/read-value-types'
import { VALUE_TAGS } from '@/v2019C1/extensions/data-model/query/read-value-types.constants'
import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { resolveMappedData } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-data'
import { readAttribute, readValueImport } from '@/v2019C1/helpers'
import { holdsNothingBut } from '@/v2019C1/helpers/pruned-when-empty'

import type {
	KeptValueReason,
	RemovedData,
	UnlockLNodeParams,
	UnlockLNodeResult,
} from './unlock-lnode.types'
import type { Scl, Config } from '@/v2019C1/config'
import type {
	TypeMember,
	ValueTypes,
} from '@/v2019C1/extensions/data-model/query/read-value-types.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Unlock an LNode bound to an (S-)IED, so its data model can be changed and it can be allocated
 * again. The IED tool owns the data model of the LN implementing it and its values; the unlock removes
 * only the values the system tool owns: for each `DAS` of the LNode, the `Val` of the `DAI` its data
 * path names, when that `DAI`'s effective `valImport` is true (`readValueImport`), it holds exactly one
 * `Val`, with no `sGroup`, and that `Val` (trimmed) equals the `DAS`'s, else the type default of its
 * `DA` / `BDA`. The `DAI` goes with it only when nothing else is left on it (no attribute but its
 * `name` / `ix`, no child), each `SDI` / `DOI` above it the same; everything else stays. Its signals
 * are no longer implemented (its `SourceRef` / `ControlRef` lose the address and uuid naming their
 * ExtRef / ExtCtrl; the ExtRef / ExtCtrl themselves stay), and it goes back to the specification its
 * `LNodeSpecNaming` keeps, which is left as it is: bound to the logical node of the specification IED
 * it is specified on when that IED holds it, no other LNode is bound to it and the LNode is not
 * unlocked from that IED itself; else assigned to no IED (`iedName` `None`, `lnUuid` cleared), its
 * logical device, prefix, class and instance those of its `LNodeSpecNaming`. An LNode assigned to no
 * IED is left as it is.
 *
 * Answers what it removed and, per `DAI` a `DAS` names whose value stays, why (`KeptValueReason`).
 *
 * @intent unbind an LNode from its IED, make the data model of an LNode editable again, deallocate an LNode, remove the values an LNode's specification imported into its IED and unlink its SourceRef/ControlRef from their ExtRef/ExtCtrl
 */
export async function unlockLNode(
	tx: Core.Transaction<Config>,
	params: UnlockLNodeParams,
): Promise<UnlockLNodeResult> {
	const { lnode } = params
	const locked = await isLNodeLocked(tx, lnode)
	if (!locked) return { removed: [], kept: [] }

	// Read while the LNode is still bound: its binding names the LN holding the values.
	const result = await removeOwnedValues(tx, { lnode })
	await unimplementSignals(tx, { lnode })

	await releaseLNodeBinding(tx, { lnode })
	return result
}

/** Drop the implementation of the signals of an LNode: the attributes of their `ied-address` pairs. */
async function unimplementSignals(
	tx: Core.Transaction<Config>,
	params: { lnode: Scl.Ref<'LNode'> },
): Promise<void> {
	const descendants = await tx.findDescendants(params.lnode)
	for (const records of Object.values(descendants) as Scl.TrackedRecord<Scl.ElementsOf>[][]) {
		for (const record of records) {
			const implementation = (PAIRS_BY_REF.get(record.tagName) ?? []).filter(
				(pair) => pair.resolution === RESOLUTION_TYPE.iedAddress,
			)
			if (implementation.length === 0) continue
			const cleared = Object.fromEntries(
				implementation.flatMap((pair) => [
					[pair.pathAttr, ''],
					[pair.uuidAttr, ''],
				]),
			)
			await tx.any.update(record, { attributes: cleared })
		}
	}
}

/**
 * Remove the values the system tool owns from the `DAI` each `DAS` of the LNode names, and the `DAI` / `SDI` / `DOI`
 * they leave with nothing else on them; list the `DAI` whose value stays, with why. The types are read once.
 */
async function removeOwnedValues(
	tx: Core.Transaction<Config>,
	params: { lnode: Scl.Ref<'LNode'> },
): Promise<UnlockLNodeResult> {
	const descendants = (await tx.findDescendants(params.lnode)) as Record<
		string,
		Scl.TrackedRecord<Scl.ElementsOf>[]
	>
	const specifications = descendants[SPECIFIED_VALUE_TAG] ?? []
	const result: UnlockLNodeResult = { removed: [], kept: [] }
	if (specifications.length === 0) return result

	const types = await readValueTypes(tx)
	for (const specification of specifications) {
		const reference = { tagName: SPECIFIED_VALUE_TAG, id: specification.id } as Scl.Ref<'DAS'>
		const mapped = await resolveMappedData(tx, { reference })
		if (!mapped) continue
		const found = await findDataInstance(tx, { ln: mapped.ln, dataPath: mapped.dataPath, types })
		if (!found || found.instance.tagName !== VALUE_TAGS.attribute) continue

		const dai = found.instance
		const ownership = await readOwnership(tx, {
			dai,
			specification,
			dataAttribute: found.member?.record,
		})
		if ('reason' in ownership) {
			result.kept.push({
				dai: { tagName: VALUE_TAGS.attribute, id: dai.id },
				specification: reference,
				reason: ownership.reason,
			})
			continue
		}
		const removed = await removeValue(tx, { value: ownership.value })
		result.removed.push(...removed)
	}
	return result
}

/**
 * The `Val` of a `DAI` the system tool owns, or why it does not: see `unlockLNode`. Checked in this order:
 * `not-imported`, `not-one-value`, `setting-group`, `no-specified-value`, `value-changed`.
 */
async function readOwnership(
	tx: Core.Transaction<Config>,
	params: {
		dai: AnyRawRecord
		specification: AnyRawRecord
		dataAttribute: AnyRawRecord | undefined
	},
): Promise<{ value: AnyRawRecord } | { reason: KeptValueReason }> {
	const { dai, specification, dataAttribute } = params
	if (!readValueImport({ instance: dai, dataAttribute })) return { reason: 'not-imported' }

	const values = await readValues(tx, { record: dai })
	if (values.length !== 1) return { reason: 'not-one-value' }
	const [value] = values
	if (isSettingGroupValue({ value })) return { reason: 'setting-group' }

	const specified = await readSpecifiedValue(tx, { specification, dataAttribute })
	if (specified === undefined) return { reason: 'no-specified-value' }
	if (value.value.trim() !== specified) return { reason: 'value-changed' }
	return { value }
}

/**
 * The value a `DAS` specifies: its one `Val`, else (it holds none) the type default of the data attribute it is given
 * for; none when the one holding `Val` holds no single plain one (`singleValueText`).
 */
async function readSpecifiedValue(
	tx: Core.Transaction<Config>,
	params: { specification: AnyRawRecord; dataAttribute: AnyRawRecord | undefined },
): Promise<string | undefined> {
	const { specification, dataAttribute } = params
	const specifiedValues = await readValues(tx, { record: specification })
	if (specifiedValues.length > 0) return singleValueText(specifiedValues)
	if (!dataAttribute) return undefined
	const typeValues = await readValues(tx, { record: dataAttribute })
	return singleValueText(typeValues)
}

/** The `Val` children of a record. */
async function readValues(
	tx: Core.Transaction<Config>,
	params: { record: AnyRawRecord },
): Promise<AnyRawRecord[]> {
	const refs = params.record.children.filter((child) => child.tagName === VALUE_TAGS.value)
	if (refs.length === 0) return []
	const records = await tx.getRecords(refs as Scl.Ref<Scl.ElementsOf>[])
	return records.filter(
		(record): record is Scl.TrackedRecord<Scl.ElementsOf> => record !== undefined,
	)
}

/** Whether a `Val` belongs to a setting group: it writes an `sGroup`. */
function isSettingGroupValue(params: { value: AnyRawRecord }): boolean {
	return Boolean(
		readAttribute({
			record: params.value,
			name: SETTING_GROUP_ATTRIBUTE,
			defaults: 'none',
			fullObject: true,
		}),
	)
}

/** The trimmed text of the only `Val`, when there is exactly one, with no `sGroup` and not blank. */
function singleValueText(values: readonly AnyRawRecord[]): string | undefined {
	if (values.length !== 1) return undefined
	const [value] = values
	if (isSettingGroupValue({ value })) return undefined
	return value.value.trim() || undefined
}

/**
 * Remove a `Val`, then each `DAI` / `SDI` / `DOI` above it left with nothing of its own (no child, no attribute but
 * its name and index), walking up; the refs removed, in that order.
 */
async function removeValue(
	tx: Core.Transaction<Config>,
	params: { value: AnyRawRecord },
): Promise<RemovedData[]> {
	const removed: RemovedData[] = [{ tagName: VALUE_TAGS.value, id: params.value.id }]
	let parent = await tx.any.delete(params.value)
	while (DATA_INSTANCE_TAGS.has(parent.tagName) && holdsNothingElse(parent)) {
		removed.push({ tagName: parent.tagName, id: parent.id } as RemovedData)
		parent = await tx.any.delete(parent)
	}
	return removed
}

/** Whether a data instance holds nothing of its own: no child, no text (`holdsNothingBut`), no attribute but its name and index. */
function holdsNothingElse(record: AnyRawRecord): boolean {
	return (
		holdsNothingBut({ record: record as Scl.RawRecord<Scl.ElementsOf>, gone: NOTHING_GONE }) &&
		record.attributes.every((attribute) => DATA_INSTANCE_NAMING_ATTRIBUTES.has(attribute.name))
	)
}

/**
 * The `DOI` / `SDI` / `DAI` at a data path of an LN (`Pos`, `ctlModel`, `name(n)` for an array element), and the
 * type member (`DO` / `SDO` / `DA` / `BDA`) it instantiates, walked down from the LN's type.
 */
async function findDataInstance(
	tx: Core.Transaction<Config>,
	params: { ln: Scl.Ref<'LN' | 'LN0'>; dataPath: readonly string[]; types: ValueTypes },
): Promise<{ instance: AnyRawRecord; member: TypeMember | undefined } | undefined> {
	const ln = await tx.getRecord(params.ln as Scl.Ref<Scl.ElementsOf>)
	if (!ln) return undefined
	let current: AnyRawRecord = ln
	let typeId: string | undefined = readAttribute({
		record: ln,
		name: LNODE_TYPE_ATTRIBUTE,
		defaults: 'none',
	})
	let member: TypeMember | undefined
	for (const segment of params.dataPath) {
		const { name, ix } = splitArrayIndex(segment)
		const children = await tx.getRecords(
			current.children.filter((child) =>
				DATA_INSTANCE_TAGS.has(child.tagName),
			) as Scl.Ref<Scl.ElementsOf>[],
		)
		const next = children.find(
			(child) =>
				child !== undefined &&
				readAttribute({ record: child, name: 'name' }) === name &&
				readAttribute({ record: child, name: 'ix', defaults: 'none', fullObject: true })?.value ===
					ix,
		)
		if (!next) return undefined
		current = next
		member = typeId ? params.types.membersById.get(typeId)?.get(name) : undefined
		typeId = member?.type
	}
	return { instance: current, member }
}

/** `name(n)` -> `{ name, ix: 'n' }`; a plain name has no index. */
function splitArrayIndex(segment: string): { name: string; ix: string | undefined } {
	const match = /^(.*)\((\d+)\)$/.exec(segment)
	return match ? { name: match[1], ix: match[2] } : { name: segment, ix: undefined }
}
