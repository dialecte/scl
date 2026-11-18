import { toRawRecord } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import {
	SPECIFIED_IED_NAME_ATTRIBUTE,
	SPECIFIED_LD_INST_ATTRIBUTE,
	SPECIFIED_NAMING_ATTRIBUTES,
} from '@/v2019C1/constants'
import {
	isAssignedToIed,
	newSpecifiedNaming,
	onSpecificationIed,
	specifiedNamingOf,
} from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'
import {
	addChildToPrivate,
	handleNewPrivateRecordCase,
} from '@/v2019C1/hooks/after-created/private-wrapper'
import { followAncestry } from '@/v2019C1/hooks/shared/follow-ancestry'
import { hasAttributeChange, updatedOperation } from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type { SpecificationIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming.types'
import type * as Core from '@dialecte/core'

/**
 * The operations giving an LNode its `LNodeSpecNaming` when it has none, placed in its
 * `eIEC61850-6-100` Private (created when the LNode has none). Empty when it has one. With a
 * `specificationIed` (the LNode is bound to a specification IED, which is its specification), the
 * naming names that IED and logical device: the one it has is updated, a new one gets them. A new one is built from
 * `namingAttributes` when given (the names of the logical node the LNode's `lnUuid` names), else from the LNode's own.
 */
export async function ensureLNodeSpecNaming(
	query: Core.Query<Config>,
	params: {
		lnode: Scl.Ref<'LNode'>
		specificationIed?: SpecificationIed
		namingAttributes?: Readonly<Record<string, string | undefined>>
	},
): Promise<Scl.Operation[]> {
	const { specificationIed } = params
	const lnodeRecord = await query.getRecord(params.lnode)
	if (!lnodeRecord) return []
	const existing = await query.getChild(lnodeRecord, 'LNodeSpecNaming')
	if (existing) {
		if (!specificationIed) return []
		const naming = toRawRecord(existing) as Scl.RawRecord<Scl.ElementsOf>
		return specifiedOnIed({ naming, specificationIed })
	}

	const lnodeAttributes = params.namingAttributes ?? (await query.getAttributes(lnodeRecord))
	const { attributes } = newSpecifiedNaming({ lnodeAttributes, specificationIed })
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

/** The update of an `LNodeSpecNaming` naming the specification IED and logical device given; none when it does. */
function specifiedOnIed(params: {
	naming: Scl.RawRecord<Scl.ElementsOf>
	specificationIed: SpecificationIed
}): Scl.Operation[] {
	const { naming, specificationIed } = params
	const attributes = onSpecificationIed({ attributes: naming.attributes, specificationIed })
	const updated = updatedOperation(naming, attributes)
	const newRecord = updated.newRecord as Scl.RawRecord<Scl.ElementsOf>
	const names = [SPECIFIED_IED_NAME_ATTRIBUTE, SPECIFIED_LD_INST_ATTRIBUTE]
	return hasAttributeChange({ oldRecord: naming, newRecord, names }) ? [updated] : []
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

/** Whether an update of an `LNodeSpecNaming` changes the name it gives its LNode in paths. */
export function specifiedNamingChanged(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
}): boolean {
	const { oldRecord, newRecord } = params
	if (newRecord.tagName !== 'LNodeSpecNaming') return false
	return hasAttributeChange({
		oldRecord,
		newRecord,
		names: [...SPECIFIED_NAMING_ATTRIBUTES.values()],
	})
}

/**
 * The LNode is named in paths by its `LNodeSpecNaming`: when one is created, changed or removed,
 * the paths of the references to the LNode and to everything below it are rebuilt. `holder` is the
 * record the naming sits in when it is no longer readable (removed): its Private, or the LNode.
 */
export async function rebuildPathsOfNamedLNode(
	query: Core.Query<Config>,
	params: { specNaming: Scl.RawRecord<Scl.ElementsOf>; holder?: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { specNaming } = params
	if (specNaming.tagName !== 'LNodeSpecNaming') return []
	const lnode = await owningLNode(query, params)
	if (!lnode) return []
	return followAncestry(query, {
		roots: [{ root: lnode, references: true, ownPath: false, below: true }],
	})
}

/** The LNode an `LNodeSpecNaming` belongs to: its parent, or the parent of its Private. */
async function owningLNode(
	query: Core.Query<Config>,
	params: { specNaming: Scl.RawRecord<Scl.ElementsOf>; holder?: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const holder = params.holder ?? params.specNaming.parent
	if (!holder) return undefined
	if (holder.tagName === 'LNode') return { tagName: 'LNode', id: holder.id }
	const holderRecord =
		'parent' in holder ? holder : await query.getRecord(holder as Scl.Ref<Scl.ElementsOf>)
	const parent = holderRecord?.parent
	return parent?.tagName === 'LNode' ? { tagName: 'LNode', id: parent.id } : undefined
}

/**
 * While no IED is assigned to an LNode, its naming is the naming it is specified with: an edit of
 * it (prefix, class, instance, LD) is written to its `LNodeSpecNaming` too, so an unbinding later
 * restores what was specified. Only for an LNode assigned to no IED before and after the edit, and
 * not for a binding change (`lnUuid`, see `reconcileLNodeBinding`).
 */
export async function mirrorSpecifiedNaming(
	query: Core.Query<Config>,
	params: { oldRecord: Scl.RawRecord<Scl.ElementsOf>; newRecord: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord } = params
	if (newRecord.tagName !== 'LNode') return []
	if (hasAttributeChange({ oldRecord, newRecord, names: ['lnUuid'] })) return []
	if (isAssigned(oldRecord) || isAssigned(newRecord)) return []
	const names = [...SPECIFIED_NAMING_ATTRIBUTES.keys()]
	if (!hasAttributeChange({ oldRecord, newRecord, names })) return []

	const naming = await query.getChild({ tagName: 'LNode', id: newRecord.id }, 'LNodeSpecNaming')
	if (!naming) return []
	const lnodeAttributes = readAttributes({ record: newRecord, defaults: 'none' })
	const specified = specifiedNamingOf(lnodeAttributes).attributes
	const namingRecord = toRawRecord(naming) as Scl.RawRecord<Scl.ElementsOf>
	// the specification IED is not the LNode's naming while no IED is assigned to it: kept as it is
	const specifiedNames = new Set(
		[...SPECIFIED_NAMING_ATTRIBUTES.values()].filter(
			(name) => name !== SPECIFIED_IED_NAME_ATTRIBUTE,
		),
	)
	const attributes = [
		...namingRecord.attributes.filter((attribute) => !specifiedNames.has(attribute.name)),
		...specified,
	]
	return [updatedOperation(namingRecord, attributes)]
}

function isAssigned(record: Scl.RawRecord<Scl.ElementsOf>): boolean {
	const iedName = readAttribute({
		record,
		name: 'iedName',
		defaults: 'none',
		fullObject: true,
	})?.value
	return isAssignedToIed({ iedName })
}
