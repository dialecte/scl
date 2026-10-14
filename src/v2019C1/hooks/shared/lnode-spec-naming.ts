import { toRawRecord } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { SPECIFIED_NAMING_ATTRIBUTES, UNALLOCATED_IED_NAME } from '@/v2019C1/constants'
import {
	addChildToPrivate,
	handleNewPrivateRecordCase,
} from '@/v2019C1/hooks/after-created/private-wrapper'

import type { SpecifiedNaming } from './lnode-spec-naming.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The `LNodeSpecNaming` of an LNode that has none, from its own naming. While no IED is assigned,
 * its naming is the specified one: copied whole. Once an IED is assigned, the IED and LD names are
 * the implementation's: only the logical node part (prefix, class, instance) is kept, and the
 * naming is `derived`.
 */
export function specifiedNamingOf(
	lnodeAttributes: Readonly<Record<string, string>>,
): SpecifiedNaming {
	const iedName = lnodeAttributes.iedName
	const derived = Boolean(iedName) && iedName !== UNALLOCATED_IED_NAME
	const leftOut = derived ? ['iedName', 'ldInst'] : ['iedName']

	const attributes: SpecifiedNaming['attributes'] = []
	for (const [name, specifiedName] of SPECIFIED_NAMING_ATTRIBUTES) {
		const value = lnodeAttributes[name]
		if (!value || leftOut.includes(name)) continue
		attributes.push({ name: specifiedName, value })
	}
	return { attributes, derived }
}

/**
 * The operations giving an LNode its `LNodeSpecNaming` when it has none, placed in its
 * `eIEC61850-6-100` Private (created when the LNode has none). Empty when it has one.
 */
export async function ensureLNodeSpecNaming(
	query: Core.Query<Config>,
	params: { lnode: Scl.Ref<'LNode'> },
): Promise<Scl.Operation[]> {
	const lnodeRecord = await query.getRecord(params.lnode)
	if (!lnodeRecord) return []
	const existing = await query.getChild(lnodeRecord, 'LNodeSpecNaming')
	if (existing) return []

	const lnodeAttributes = await query.getAttributes(lnodeRecord)
	const { attributes } = specifiedNamingOf(lnodeAttributes)
	const namespace = SCL_DIALECTE_CONFIG.namespaces.v2019C1
	const specNaming = {
		id: crypto.randomUUID(),
		tagName: 'LNodeSpecNaming',
		namespace,
		attributes,
		value: '',
		parent: { id: lnodeRecord.id, tagName: lnodeRecord.tagName },
		children: [],
	} as Scl.RawRecord<'LNodeSpecNaming'>
	const created: Scl.Operation = {
		status: 'created',
		oldRecord: undefined,
		newRecord: specNaming as Scl.RawRecord<Scl.ElementsOf>,
	}

	const privateRecord = await findOwnedPrivate(query, {
		lnode: lnodeRecord,
		type: namespace.prefix,
	})
	if (!privateRecord) {
		const lnode = toRawRecord(lnodeRecord)
		const [privateCreated, ...updates] = handleNewPrivateRecordCase({
			parentRecord: lnode,
			updatedParentRecord: lnode,
			childRecord: specNaming,
		})
		return [privateCreated, created, ...updates] as Scl.Operation[]
	}

	const placed = addChildToPrivate({
		privateRecord: toRawRecord(privateRecord),
		childRecord: specNaming,
	})
	return [
		{ ...created, newRecord: placed.childRecord as Scl.RawRecord<Scl.ElementsOf> },
		{
			status: 'updated',
			oldRecord: toRawRecord(privateRecord),
			newRecord: placed.privateRecord,
		},
	] as Scl.Operation[]
}

/** The LNode's `Private` of the given type, when it has one. */
async function findOwnedPrivate(
	query: Core.Query<Config>,
	params: { lnode: Scl.TrackedRecord<'LNode'>; type: string },
): Promise<Scl.TrackedRecord<'Private'> | undefined> {
	const { lnode, type } = params
	const privates = await query.getChildren(lnode, 'Private')
	for (const privateRecord of privates) {
		const privateType = await query.getAttribute(privateRecord, { name: 'type' })
		if (privateType === type) return privateRecord
	}
	return undefined
}
