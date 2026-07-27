import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { updatedOperation, upsertAttribute } from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const UNBOUND_IED_MARKER = 'None'

/**
 * Keep an `LNode`'s implementation identity in agreement with its `lnUuid` as a
 * side effect of update. When `lnUuid` is set, the identity
 * (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`) is stamped from the target `LN`;
 * when it is cleared, `iedName` is forced to the unbound `None` marker (with
 * `ldInst` dropped) and the specification `prefix`/`lnClass`/`lnInst` are restored
 * from `LNodeSpecNaming` when present. `lnType` is left untouched — it is the
 * specification type reference, not part of the mapped identity. `templateUuid` is
 * also left untouched — it records the template the LNode was instantiated from (the
 * key used to locate the implementing ICD), which is owned by the instantiate
 * lifecycle, not by binding.
 *
 * Runs only when `lnUuid` actually changed, so ordinary edits and coherent imports
 * are untouched. Returns an update operation, or `null` when nothing changes.
 */
export async function reconcileLNodeBinding(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	query: Core.Query<Config>
}): Promise<Scl.Operation | null> {
	const { oldRecord, newRecord, query } = params
	if (newRecord.tagName !== 'LNode') return null

	const oldLnUuid = attributeValue(oldRecord, 'lnUuid')
	const newLnUuid = attributeValue(newRecord, 'lnUuid')
	if (oldLnUuid === newLnUuid) return null

	const desired = newLnUuid
		? await mappedIdentity(query, newLnUuid)
		: await specificationIdentity(query, newRecord)
	if (!desired) return null

	return applyIdentity(newRecord, desired)
}

/** Identity attributes derived from the implementing `LN` identified by uuid. */
async function mappedIdentity(
	query: Core.Query<Config>,
	lnUuid: string,
): Promise<Record<string, string | undefined> | null> {
	const lnRef = await findLnByUuid(query, lnUuid)
	if (!lnRef) return null

	const lnAttrs = await query.getAttributes(lnRef as Scl.Ref<'LN'>)
	const ancestors = await query.findAncestors(lnRef)
	const ldevice = ancestors.find((a) => a.tagName === 'LDevice')
	const ied = ancestors.find((a) => a.tagName === 'IED')
	const ldeviceAttrs = ldevice
		? await query.getAttributes({ tagName: 'LDevice', id: ldevice.id })
		: undefined
	const iedAttrs = ied ? await query.getAttributes({ tagName: 'IED', id: ied.id }) : undefined

	return {
		iedName: iedAttrs?.name,
		ldInst: ldeviceAttrs?.inst,
		prefix: lnAttrs.prefix,
		lnClass: lnAttrs.lnClass,
		lnInst: lnAttrs.inst,
	}
}

/**
 * Specification identity restored on unbind. `iedName` is always cleared to the
 * unbound marker (`None`) with `ldInst` dropped; when an `LNodeSpecNaming` snapshot
 * exists, `prefix`/`lnClass`/`lnInst` are additionally restored from it (otherwise
 * they are left as-is — the hook has no specification to restore and must not strip
 * an LNode's required class). `templateUuid` is never touched — it is instantiation
 * provenance, independent of the binding state.
 */
async function specificationIdentity(
	query: Core.Query<Config>,
	lnodeRecord: Scl.RawRecord<Scl.ElementsOf>,
): Promise<Record<string, string | undefined>> {
	const cleared = { iedName: UNBOUND_IED_MARKER, ldInst: undefined }

	const specNaming = await query.getChild(
		{ tagName: 'LNode', id: lnodeRecord.id } as Scl.Ref<Scl.ElementsOf>,
		'LNodeSpecNaming',
	)
	if (!specNaming) return cleared

	const specAttrs = await query.getAttributes(specNaming)
	return {
		...cleared,
		prefix: specAttrs.sPrefix,
		lnClass: specAttrs.sLnClass,
		lnInst: specAttrs.sLnInst,
	}
}

async function findLnByUuid(
	query: Core.Query<Config>,
	lnUuid: string,
): Promise<Scl.Ref<'LN' | 'LN0'> | null> {
	for (const tagName of ['LN', 'LN0']) {
		if (!isElementOf(tagName, SCL_DIALECTE_CONFIG)) continue
		const candidates = await query.getRecordsByTagName(tagName)
		const match = candidates.find(
			(record) => record.attributes.find((a) => a.name === 'uuid')?.value === lnUuid,
		)
		if (match) return { tagName: match.tagName, id: match.id } as Scl.Ref<'LN' | 'LN0'>
	}
	return null
}

function applyIdentity(
	record: Scl.RawRecord<Scl.ElementsOf>,
	desired: Record<string, string | undefined>,
): Scl.Operation | null {
	let attributes: { name: string; value: string }[] = [...record.attributes]
	let changed = false

	for (const [name, value] of Object.entries(desired)) {
		const current = attributes.find((a) => a.name === name)?.value
		if (value === undefined) {
			if (current === undefined) continue
			attributes = attributes.filter((a) => a.name !== name)
			changed = true
			continue
		}
		if (current === value) continue
		attributes = upsertAttribute(attributes, name, value)
		changed = true
	}

	if (!changed) return null
	return updatedOperation(record, attributes)
}

function attributeValue(record: Scl.RawRecord<Scl.ElementsOf>, name: string): string | undefined {
	return record.attributes.find((a) => a.name === name)?.value
}
