import { textChangeOf } from './text-change'
import {
	ENUMERATED_BASIC_TYPE,
	ENUMERATION_TAGS,
	SETTABLE_VALUE_KIND,
	VALUE_IMPORTED,
	VALUE_TAGS,
} from './value-ownership.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import {
	DATA_TYPE_MODEL,
	DATA_TYPES_SELECT,
	LNODE_TYPE_ATTRIBUTE,
} from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { readAttribute } from '@/v2019C1/helpers'

import type { DiffNode, ReportInstance } from './diff.types'
import type {
	SettableValue,
	SettableValues,
	TakenOver,
	TextComparison,
	TypeContext,
	TypeMember,
	ValueDefinition,
	ValueOwnership,
	ValueTypes,
} from './value-ownership.types'
import type { Config } from '@/v2019C1/config'
import type { TakeOvers } from '@/v2019C1/extensions/lifecycle/contract.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The values of a template subtree the project may set, by `Val` record id, each with the values its enumeration allows:
 * a value whose data attribute (its `DAI`, else the data attribute of its type) is of kind `Set`, or that the IED
 * imports (`valImport`). The template's types are read once, and only when the subtree holds a value.
 */
export async function readSettableValues(
	query: Core.Query<Config>,
	params: { tree: AnyTreeRecord },
): Promise<SettableValues> {
	if (!holdsValue(params.tree)) return new Map()
	const types = await readValueTypes(query)
	return new Map(settableValuesUnder({ node: params.tree, context: undefined, types }))
}

/**
 * Compare a matched element's text as the report lists it and the apply writes it: a value the project may set keeps
 * the project's text (`keptTextChange`) unless the consumer takes the template's over (`takenOver`); a kept text its
 * enumeration no longer allows waits for a decision (`requiresDecision`); any other text the template changed is a
 * change (`textChange`).
 */
export function compareText(params: {
	sourceNode: AnyTreeRecord
	instanceNode: AnyTreeRecord
	ownership: ValueOwnership
}): TextComparison {
	const { sourceNode, instanceNode, ownership } = params
	const textChange = textChangeOf({ sourceNode, instanceNode })
	if (!textChange) return {}
	const settable = ownership.settableValues.get(sourceNode.id)
	if (!settable) return { textChange }
	if (ownership.takeOver.all || ownership.takeOver.ids.has(instanceNode.id))
		return { textChange, takenOver: true }
	if (settable.allowed && !settable.allowed.has(textChange.before))
		return { textChange, requiresDecision: 'value-outside-enumeration' }
	return { keptTextChange: { ...textChange, reason: 'settable-value' } }
}

/**
 * The values a consumer takes over in a subtree of the project: every one for `'all'`, else every element of the
 * subtrees the take-overs name (a `Val`, or an element holding values, an IED: all of them below it), by id.
 */
export function resolveTakeOvers(params: {
	takeOver: TakeOvers | undefined
	tree: AnyTreeRecord
}): TakenOver {
	const { takeOver, tree } = params
	if (takeOver === 'all') return { all: true, ids: new Set() }
	const named = new Set((takeOver ?? []).map((entry) => elementKey(entry.element)))
	return { all: false, ids: new Set(takenOverUnder({ node: tree, named, within: false })) }
}

/** The ids of the elements of a subtree inside one a take-over names (the named elements included). */
function takenOverUnder(params: {
	node: AnyTreeRecord
	named: ReadonlySet<string>
	within: boolean
}): string[] {
	const { node, named } = params
	const within = params.within || named.has(elementKey(node))
	const own = within ? [node.id] : []
	return [...own, ...node.tree.flatMap((child) => takenOverUnder({ node: child, named, within }))]
}

/** An element as `<tag>:<id>`: how a take-over and the report name it. */
function elementKey(element: { tagName: string; id?: string }): string {
	return `${element.tagName}:${element.id ?? ''}`
}

/**
 * Refuse a take-over the report does not list as taken: one naming an element that keeps no value the project may set
 * (`TAKE_OVER_NOT_OFFERED`, the first one).
 */
export function assertTakeOversOffered(params: {
	instances: readonly ReportInstance[]
	takeOver: TakeOvers | undefined
}): void {
	const { instances, takeOver } = params
	if (!takeOver || takeOver === 'all' || takeOver.length === 0) return
	const taken = new Set(
		instances.flatMap((instance) => takenOverKeys({ node: instance.tree, above: [] })),
	)
	const refused = takeOver.find(
		(entry) => !entry.element.id || !taken.has(elementKey(entry.element)),
	)
	if (!refused) return
	throwDialecteError(SCL_ERRORS.TAKE_OVER_NOT_OFFERED, {
		meta: { element: { tagName: refused.element.tagName, id: refused.element.id } },
		detail: `a take-over names ${refused.element.tagName} "${String(refused.element.id)}", which keeps no value the project may set`,
	})
}

/**
 * The project elements, as `<tag>:<id>`, a take-over may name in a tree: each node the report lists as taken over, and
 * every element above it.
 */
function takenOverKeys(params: { node: DiffNode; above: readonly string[] }): string[] {
	const { node, above } = params
	const ref = node.instanceRef
	const path = ref ? [...above, elementKey(ref)] : above
	const own = node.takenOver ? path : []
	return [...own, ...node.children.flatMap((child) => takenOverKeys({ node: child, above: path }))]
}

/** Whether a subtree holds a value. */
function holdsValue(node: AnyTreeRecord): boolean {
	return node.tagName === VALUE_TAGS.value || node.tree.some(holdsValue)
}

/**
 * The members of every type of the template's data model, with what their values are held to, and the values of each
 * enumeration: one read of the `DataTypeTemplates`.
 */
async function readValueTypes(query: Core.Query<Config>): Promise<ValueTypes> {
	const collected = await collectWithAncestry(query, { select: DATA_TYPES_SELECT })
	const placed = collected.records.flatMap(function withParent(record) {
		const parent = collected.ancestryOf(record.id).at(-1)
		return parent ? [{ record, parent }] : []
	})
	return {
		membersById: groupMembers(placed.flatMap((entry) => optional(typeMemberOf(entry)))),
		enumerationsById: groupEnumerations(
			placed.flatMap((entry) => optional(enumerationValueOf(entry))),
		),
	}
}

/** A value as a list of one, nothing as an empty list. */
function optional<T>(value: T | undefined): T[] {
	return value === undefined ? [] : [value]
}

/** The members, by the id of the type holding them, then by name. */
function groupMembers(
	members: readonly { typeId: string; name: string; member: TypeMember }[],
): ReadonlyMap<string, ReadonlyMap<string, TypeMember>> {
	const membersById = new Map<string, Map<string, TypeMember>>()
	for (const { typeId, name, member } of members) {
		const ofType = membersById.get(typeId) ?? new Map<string, TypeMember>()
		ofType.set(name, member)
		membersById.set(typeId, ofType)
	}
	return membersById
}

/** The values, by the id of the enumeration holding them. */
function groupEnumerations(
	values: readonly { enumerationId: string; value: string }[],
): ReadonlyMap<string, ReadonlySet<string>> {
	const enumerationsById = new Map<string, Set<string>>()
	for (const { enumerationId, value } of values) {
		const ofEnumeration = enumerationsById.get(enumerationId) ?? new Set<string>()
		ofEnumeration.add(value)
		enumerationsById.set(enumerationId, ofEnumeration)
	}
	return enumerationsById
}

/** A record as a value of the enumeration holding it, when it is one. */
function enumerationValueOf(params: {
	record: AnyRawRecord
	parent: AnyRawRecord
}): { enumerationId: string; value: string } | undefined {
	const { record, parent } = params
	if (record.tagName !== ENUMERATION_TAGS.value || parent.tagName !== ENUMERATION_TAGS.type)
		return undefined
	const enumerationId = readAttribute({ record: parent, name: 'id', defaults: 'none' })
	return enumerationId ? { enumerationId, value: record.value.trim() } : undefined
}

/** A record as a member of the type holding it, when it is one: its type's id, its name and what it is. */
function typeMemberOf(params: {
	record: AnyRawRecord
	parent: AnyRawRecord
}): { typeId: string; name: string; member: TypeMember } | undefined {
	const { record, parent } = params
	const parentType = DATA_TYPE_MODEL.types.get(parent.tagName)
	const modelMember = parentType?.members.get(record.tagName)
	if (!parentType || !modelMember) return undefined
	const typeId = readAttribute({ record: parent, name: parentType.idAttribute, defaults: 'none' })
	const name = readAttribute({ record, name: modelMember.nameAttribute, defaults: 'none' })
	if (!typeId || !name) return undefined
	const type = readAttribute({ record, name: modelMember.typeAttribute, defaults: 'none' })
	return {
		typeId,
		name,
		member: {
			continuesObject: modelMember.continuesObject,
			...(type ? { type } : {}),
			definition: readDefinition({ record, defaults: 'optional' }),
		},
	}
}

/**
 * What a data attribute or a `DAI` says of its values. A data attribute's kind and import flag take their schema
 * defaults when absent (of kind `Set`, not imported); a `DAI`'s only what it writes, overriding its type's.
 */
function readDefinition(params: {
	record: AnyRawRecord
	defaults: 'optional' | 'none'
}): ValueDefinition {
	const { record, defaults } = params
	const valKind = readAttribute({ record, name: 'valKind', defaults })
	const valImport = readAttribute({ record, name: 'valImport', defaults })
	const bType = readAttribute({ record, name: 'bType', defaults: 'none' })
	const type = readAttribute({ record, name: 'type', defaults: 'none' })
	return {
		...(valKind ? { valKind } : {}),
		...(valImport ? { valImport } : {}),
		...(bType ? { bType } : {}),
		...(type ? { type } : {}),
	}
}

/**
 * The settable values below a node, walking its data down the types: a logical node opens its type, a `DOI` / `SDI`
 * the member it names, a `DAI` the data attribute its values are given for.
 */
function settableValuesUnder(params: {
	node: AnyTreeRecord
	context: TypeContext | undefined
	types: ValueTypes
	definition?: ValueDefinition
}): [string, SettableValue][] {
	const { node, types } = params
	if (node.tagName === VALUE_TAGS.value) {
		const settable = params.definition && settableValueOf({ definition: params.definition, types })
		return settable ? [[node.id, settable]] : []
	}
	const lnType = readAttribute({ record: node, name: LNODE_TYPE_ATTRIBUTE, defaults: 'none' })
	const context: TypeContext | undefined = lnType
		? { kind: 'logical-node', id: lnType }
		: params.context && childContextOf({ node, context: params.context, types })
	const definition =
		node.tagName === VALUE_TAGS.attribute
			? valueDefinitionOf({ node, context: params.context, types })
			: params.definition
	return node.tree.flatMap((child) =>
		settableValuesUnder({ node: child, context, types, definition }),
	)
}

/** Where a `DOI` or an `SDI` leads in the types: the type of the member it names. */
function childContextOf(params: {
	node: AnyTreeRecord
	context: TypeContext
	types: ValueTypes
}): TypeContext | undefined {
	const { node, context, types } = params
	if (node.tagName !== VALUE_TAGS.object && node.tagName !== VALUE_TAGS.subInstance)
		return undefined
	const member = memberNamed({ node, context, types })
	if (!member?.type) return undefined
	return { kind: member.continuesObject ? 'object' : 'attribute', id: member.type }
}

/**
 * What a `DAI`'s values are held to: its own kind and import flag, else its data attribute's — its own count when its
 * data attribute is not found in the template's types.
 */
function valueDefinitionOf(params: {
	node: AnyTreeRecord
	context: TypeContext | undefined
	types: ValueTypes
}): ValueDefinition | undefined {
	const { node, context, types } = params
	const member = context ? memberNamed({ node, context, types }) : undefined
	const overrides = pickOverrides(readDefinition({ record: node, defaults: 'none' }))
	if (!member && Object.keys(overrides).length === 0) return undefined
	return { ...member?.definition, ...overrides }
}

/** The kind and import flag a `DAI` writes, which override its data attribute's. */
function pickOverrides(definition: ValueDefinition): ValueDefinition {
	const { valKind, valImport } = definition
	return { ...(valKind ? { valKind } : {}), ...(valImport ? { valImport } : {}) }
}

/** The member of the current type a `DOI`, `SDI` or `DAI` names. */
function memberNamed(params: {
	node: AnyTreeRecord
	context: TypeContext
	types: ValueTypes
}): TypeMember | undefined {
	const { node, context, types } = params
	const name = readAttribute({ record: node, name: 'name', defaults: 'none' })
	return name ? types.membersById.get(context.id)?.get(name) : undefined
}

/** A value the project may set, with the values its enumeration allows; none when it may not set it. */
function settableValueOf(params: {
	definition: ValueDefinition
	types: ValueTypes
}): SettableValue | undefined {
	const { definition, types } = params
	const settable =
		definition.valKind === SETTABLE_VALUE_KIND ||
		(definition.valImport !== undefined && VALUE_IMPORTED.has(definition.valImport))
	if (!settable) return undefined
	const allowed =
		definition.bType === ENUMERATED_BASIC_TYPE && definition.type
			? types.enumerationsById.get(definition.type)
			: undefined
	return allowed ? { allowed } : {}
}
