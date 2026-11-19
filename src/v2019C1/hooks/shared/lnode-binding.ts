import { SPECIFIED_IED_NAME_ATTRIBUTE, SPECIFIED_NAMING_ATTRIBUTES } from '@/v2019C1/constants'
import { unassignedNaming } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { planReleases } from '@/v2019C1/extensions/data-model/naming/release-plan'
import { readSpecificationRelease } from '@/v2019C1/extensions/data-model/query/specification-release'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'
import { LOGICAL_NODE_TAGS } from '@/v2019C1/hooks/shared/lnode-binding.constants'
import { ensureLNodeSpecNaming } from '@/v2019C1/hooks/shared/lnode-spec-naming'
import {
	hasAttributeChange,
	updatedOperation,
	upsertAttribute,
} from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Keep an `LNode`'s implementation identity in agreement with its `lnUuid` as a
 * side effect of update. When `lnUuid` is set, the identity
 * (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`) is stamped from the target `LN`; an `LN` of a
 * specification IED is the LNode's specification: its `LNodeSpecNaming` is set on that IED and
 * logical device at the commit (`beforeCommit`), once for every LNode the transaction binds. When `lnUuid` is cleared, the LNode goes back to the specification its `LNodeSpecNaming`
 * keeps (see `releasedNaming`): the specification IED's logical node it names, else no IED (`None`)
 * with the specified `ldInst`/`prefix`/`lnClass`/`lnInst`; an update writing part of the naming
 * itself (a release, see `releaseLNodeBindings`) keeps what it writes, the rest from no IED's naming. `lnType` is
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

	const oldLnUuid = readAttribute({
		record: oldRecord,
		name: 'lnUuid',
		defaults: 'none',
		fullObject: true,
	})?.value
	const newLnUuid = readAttribute({
		record: newRecord,
		name: 'lnUuid',
		defaults: 'none',
		fullObject: true,
	})?.value
	if (oldLnUuid === newLnUuid) return []

	if (!newLnUuid) {
		const names = [...SPECIFIED_NAMING_ATTRIBUTES.keys()]
		const written = names.filter((name) =>
			hasAttributeChange({ oldRecord, newRecord, names: [name] }),
		)
		if (written.length === 0) return releaseIdentity({ query, oldRecord, newRecord })
		return completeWrittenRelease({ query, newRecord, written })
	}

	const identity = await mappedIdentity(query, newLnUuid)
	if (!identity) return []
	// bound to a specification IED: its LNodeSpecNaming is set on that IED at the commit (`beforeCommit`)
	const lnodeRef: Scl.Ref<'LNode'> = { tagName: 'LNode', id: newRecord.id }
	const specNamingOps = await ensureLNodeSpecNaming(query, { lnode: lnodeRef })
	// The identity is stamped on the LNode as the operations above leave it (a new Private child).
	const lnode =
		specNamingOps.findLast((operation) => operation.newRecord?.id === newRecord.id)?.newRecord ??
		newRecord
	const identityOp = applyIdentity(lnode, identity)
	return identityOp ? [...specNamingOps, identityOp] : specNamingOps
}

/**
 * The operation releasing an LNode whose `lnUuid` was cleared: its naming back to its specification
 * (`releasedNaming`, read with the naming it had before the update); its `LNodeSpecNaming` is left
 * as it is.
 */
async function releaseIdentity(params: {
	query: Core.Query<Config>
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
}): Promise<Scl.Operation[]> {
	const { query, oldRecord, newRecord } = params
	const specifiedAttributes = await readSpecifiedAttributes(query, { lnode: newRecord })
	const lnodeAttributes = readAttributes({ record: oldRecord, defaults: 'none' })
	const specifiedIedName = specifiedAttributes?.[SPECIFIED_IED_NAME_ATTRIBUTE]
	const release = await readSpecificationRelease(query, {
		iedNames: new Set(specifiedIedName ? [specifiedIedName] : []),
	})
	const plan = planReleases({
		lnodes: [{ id: newRecord.id, lnodeAttributes, specifiedAttributes }],
		release,
	})
	const released = plan.get(newRecord.id) ?? {}
	const identityOp = applyIdentity(newRecord, released)
	return identityOp ? [identityOp] : []
}

/**
 * A caller clearing `lnUuid` and writing part of the naming (a release, `releaseLNodeBindings`; an unbinding writing
 * `iedName` `None`) has decided what it writes: the naming attributes it left as they were are those of no IED
 * (`unassignedNaming`, from its `LNodeSpecNaming`), the specification IED is not looked up.
 */
async function completeWrittenRelease(params: {
	query: Core.Query<Config>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	written: readonly string[]
}): Promise<Scl.Operation[]> {
	const { query, newRecord, written } = params
	const specifiedAttributes = await readSpecifiedAttributes(query, { lnode: newRecord })
	const unassigned = unassignedNaming({
		lnodeAttributes: readAttributes({ record: newRecord, defaults: 'none' }),
		specifiedAttributes,
	})
	const desired = Object.fromEntries(
		Object.entries(unassigned).filter(([name]) => !written.includes(name)),
	)
	const identityOp = applyIdentity(newRecord, desired)
	return identityOp ? [identityOp] : []
}

/** The attributes of an LNode's `LNodeSpecNaming`, as the transaction holds it; `undefined` when it has none. */
async function readSpecifiedAttributes(
	query: Core.Query<Config>,
	params: { lnode: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Readonly<Record<string, string | undefined>> | undefined> {
	const lnodeRef = { tagName: 'LNode', id: params.lnode.id } as Scl.Ref<Scl.ElementsOf>
	const naming = await query.getChild(lnodeRef, 'LNodeSpecNaming')
	return naming ? readAttributes({ record: naming, defaults: 'none' }) : undefined
}

/**
 * Identity attributes derived from the implementing `LN` identified by uuid: the logical node found, its logical device
 * and IED read from its ancestors, no record read again.
 */
async function mappedIdentity(
	query: Core.Query<Config>,
	lnUuid: string,
): Promise<Record<string, string | undefined> | null> {
	const ln = await findLnByUuid(query, lnUuid)
	if (!ln) return null

	const lnAttributes = await query.any.getAttributes(ln)
	const ancestors = await query.any.findAncestors(ln)
	const ldevice = ancestors.find((ancestor) => ancestor.tagName === 'LDevice')
	const ied = ancestors.find((ancestor) => ancestor.tagName === 'IED')
	const lDeviceAttributes = ldevice ? await query.any.getAttributes(ldevice) : undefined
	const iedAttributes = ied ? await query.any.getAttributes(ied) : undefined

	return {
		iedName: iedAttributes?.name,
		ldInst: lDeviceAttributes?.inst,
		prefix: lnAttributes.prefix,
		lnClass: lnAttributes.lnClass,
		lnInst: lnAttributes.inst,
	}
}

/**
 * The `LN`, else the `LN0`, carrying `lnUuid`: one lookup by value per tag, the first match the tag answers. Not
 * `findNativeLnByUuid`: that one keeps the logical nodes of an IED's own content only, first in document order, where
 * a binding takes any LN carrying the uuid, an LN before an LN0.
 */
async function findLnByUuid(
	query: Core.Query<Config>,
	lnUuid: string,
): Promise<Core.AnyTrackedRecord | null> {
	for (const tagName of LOGICAL_NODE_TAGS) {
		// dialecte-allow query-in-loop: one lookup per logical node tag (LN, then LN0), stopping at the first found
		const [match] = await query.any.findByAttributes({ tagName, attributes: { uuid: lnUuid } })
		if (match) return match
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
