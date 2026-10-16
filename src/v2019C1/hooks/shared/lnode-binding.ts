import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { unassignedNaming } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { ensureLNodeSpecNaming } from '@/v2019C1/hooks/shared/lnode-spec-naming'
import { updatedOperation, upsertAttribute } from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Keep an `LNode`'s implementation identity in agreement with its `lnUuid` as a
 * side effect of update. When `lnUuid` is set, the identity
 * (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`) is stamped from the target `LN`;
 * when it is cleared, `iedName` is forced to the unbound `None` marker and the
 * specification `ldInst`/`prefix`/`lnClass`/`lnInst` are restored from
 * `LNodeSpecNaming` when present (`ldInst` removed when it names none). `lnType` is
 * left untouched — it is the specification type reference, not part of the mapped
 * identity. `templateUuid` is
 * also left untouched — it records the template the LNode was instantiated from (the
 * key used to locate the implementing ICD), which is owned by the instantiate
 * lifecycle, not by binding.
 *
 * Before an identity is stamped, an LNode without `LNodeSpecNaming` gets one from the naming it
 * still has, so the specified naming survives the binding.
 *
 * Runs only when `lnUuid` actually changed, so ordinary edits and coherent imports
 * are untouched. Returns the operations, empty when nothing changes.
 */
export async function reconcileLNodeBinding(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params
	if (newRecord.tagName !== 'LNode') return []

	const oldLnUuid = attributeValue(oldRecord, 'lnUuid')
	const newLnUuid = attributeValue(newRecord, 'lnUuid')
	if (oldLnUuid === newLnUuid) return []

	const desired = newLnUuid
		? await mappedIdentity(query, newLnUuid)
		: await specificationIdentity(query, newRecord)
	if (!desired) return []

	const specNamingOps = newLnUuid
		? await ensureLNodeSpecNaming(query, { lnode: { tagName: 'LNode', id: newRecord.id } })
		: []
	// The identity is stamped on the LNode as the operations above leave it (a new Private child).
	const lnode =
		specNamingOps.findLast((operation) => operation.newRecord?.id === newRecord.id)?.newRecord ??
		newRecord
	const identityOp = applyIdentity(lnode, desired)
	return identityOp ? [...specNamingOps, identityOp] : specNamingOps
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
 * Specification identity restored on unbind: the naming an LNode gets back when no IED is assigned
 * to it anymore (`unassignedNaming`), its logical device, prefix, class and instance from its
 * `LNodeSpecNaming`.
 * `templateUuid` is never touched: it is instantiation provenance, independent of the binding.
 */
async function specificationIdentity(
	query: Core.Query<Config>,
	lnodeRecord: Scl.RawRecord<Scl.ElementsOf>,
): Promise<Record<string, string | undefined>> {
	const specNaming = await query.getChild(
		{ tagName: 'LNode', id: lnodeRecord.id } as Scl.Ref<Scl.ElementsOf>,
		'LNodeSpecNaming',
	)
	const specifiedAttributes = specNaming ? await query.getAttributes(specNaming) : undefined
	return unassignedNaming({
		lnodeAttributes: { lnClass: attributeValue(lnodeRecord, 'lnClass') },
		specifiedAttributes,
	})
}

async function findLnByUuid(
	query: Core.Query<Config>,
	lnUuid: string,
): Promise<Scl.Ref<'LN' | 'LN0'> | null> {
	for (const tagName of ['LN', 'LN0']) {
		if (!isElementOf(tagName, SCL_DIALECTE_CONFIG)) continue
		for (const record of await query.getRecordsByTagName(tagName)) {
			if ((await query.any.getAttribute(record, { name: 'uuid' })) === lnUuid) {
				return { tagName: record.tagName, id: record.id } as Scl.Ref<'LN' | 'LN0'>
			}
		}
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
