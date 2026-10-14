import { CLEARED_ON_UNLOCK, DATA_INSTANCE_TAGS, MAPPED_DATA_TAGS } from './unlock-lnode.constants'

import { SPECIFIED_NAMING_ATTRIBUTES, UNALLOCATED_IED_NAME } from '@/v2019C1/constants'
import { isLNodeLocked } from '@/v2019C1/extensions/data-model/query/is-lnode-locked'
import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { resolveMappedData } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-data'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Unlock an LNode bound to an (S-)IED, so its data model can be changed and it can be allocated
 * again: the data its `DOS` / `SDS` / `DAS` specify is no longer instantiated in the LN that
 * implements it (those `DOI` / `SDI` / `DAI` are removed), its signals are no longer implemented
 * (the ExtRef / ExtCtrl they name is dropped), and it is assigned to no IED (`iedName` `None`, `ldInst` and `lnUuid` cleared), its prefix, class and
 * instance those of its `LNodeSpecNaming`, which is left as it is. An LNode assigned to no IED is
 * left as it is.
 */
export async function unlockLNode(
	tx: Core.Transaction<Config>,
	params: { lnode: Scl.Ref<'LNode'> },
): Promise<void> {
	const { lnode } = params
	const locked = await isLNodeLocked(tx, lnode)
	if (!locked) return

	// Read while the LNode is still bound: its binding names the LN holding the instances.
	await removeInstantiatedData(tx, { lnode })
	await unimplementSignals(tx, { lnode })

	const attributes = await tx.getAttributes(lnode)
	const naming = await tx.getChild(lnode, 'LNodeSpecNaming')
	const specified = naming ? await tx.getAttributes(naming) : undefined

	const reset: Record<string, string> = { iedName: UNALLOCATED_IED_NAME, ldInst: '', lnUuid: '' }
	for (const [name, specifiedName] of SPECIFIED_NAMING_ATTRIBUTES) {
		if (CLEARED_ON_UNLOCK.has(name) || !specified) continue
		const value = (specified as Record<string, string | undefined>)[specifiedName]
		// The class is required: kept from the LNode when the naming has none.
		reset[name] = value ?? (name === 'lnClass' ? (attributes.lnClass ?? '') : '')
	}
	await tx.update(lnode, { attributes: reset })
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
 * Remove the `DOI` / `SDI` / `DAI` instantiating the data the LNode's `DOS` / `SDS` / `DAS` specify:
 * each found in the LN implementing it, by its data path; one below another removed is gone with it.
 */
async function removeInstantiatedData(
	tx: Core.Transaction<Config>,
	params: { lnode: Scl.Ref<'LNode'> },
): Promise<void> {
	const descendants = await tx.findDescendants(params.lnode)
	const instances: { key: string; record: Scl.TrackedRecord<Scl.ElementsOf> }[] = []
	for (const tagName of MAPPED_DATA_TAGS) {
		const records =
			(descendants as Record<string, Scl.TrackedRecord<Scl.ElementsOf>[]>)[tagName] ?? []
		for (const record of records) {
			const reference = { tagName, id: record.id } as Scl.Ref<'DOS' | 'SDS' | 'DAS'>
			const mapped = await resolveMappedData(tx, { reference })
			if (!mapped) continue
			const instance = await findDataInstance(tx, { ln: mapped.ln, dataPath: mapped.dataPath })
			if (instance)
				instances.push({ key: `${mapped.ln.id}/${mapped.dataPath.join('.')}`, record: instance })
		}
	}

	const removed: string[] = []
	for (const { key, record } of instances.sort(
		(first, second) => first.key.length - second.key.length,
	)) {
		if (removed.some((above) => key === above || key.startsWith(`${above}.`))) continue
		removed.push(key)
		await tx.any.delete(record)
	}
}

/** The `DOI` / `SDI` / `DAI` at a data path of an LN (`Pos`, `ctlModel`, `name(n)` for an array element). */
async function findDataInstance(
	tx: Core.Transaction<Config>,
	params: { ln: Scl.Ref<'LN' | 'LN0'>; dataPath: readonly string[] },
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	let current: Scl.TrackedRecord<Scl.ElementsOf> | undefined = await tx.getRecord(
		params.ln as Scl.Ref<Scl.ElementsOf>,
	)
	for (const segment of params.dataPath) {
		if (!current) return undefined
		const { name, ix } = splitArrayIndex(segment)
		const children = await tx.getRecords(
			current.children.filter((child) =>
				DATA_INSTANCE_TAGS.has(child.tagName),
			) as Scl.Ref<Scl.ElementsOf>[],
		)
		current = children.find(
			(child) =>
				child !== undefined &&
				readAttribute(child, 'name') === name &&
				readAttribute(child, 'ix') === ix,
		)
	}
	return current
}

/** `name(n)` -> `{ name, ix: 'n' }`; a plain name has no index. */
function splitArrayIndex(segment: string): { name: string; ix: string | undefined } {
	const match = /^(.*)\((\d+)\)$/.exec(segment)
	return match ? { name: match[1], ix: match[2] } : { name: segment, ix: undefined }
}

function readAttribute(
	record: Scl.TrackedRecord<Scl.ElementsOf>,
	name: string,
): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}
