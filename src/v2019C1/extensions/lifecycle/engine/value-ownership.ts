import { readLostDataInstances } from './lost-data-instances'
import { textChangeOf } from './text-change'
import { ENUMERATED_BASIC_TYPE, SETTABLE_VALUE_KIND } from './value-ownership.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { LNODE_TYPE_ATTRIBUTE } from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { readValueTypes } from '@/v2019C1/extensions/data-model/query/read-value-types'
import { VALUE_TAGS } from '@/v2019C1/extensions/data-model/query/read-value-types.constants'
import { readAttribute, readValueImport } from '@/v2019C1/helpers'

import type { DiffNode, ReportInstance } from './diff.types'
import type {
	SettableValue,
	TakenOver,
	TextComparison,
	TypeContext,
	ValueOwnership,
} from './value-ownership.types'
import type { Config } from '@/v2019C1/config'
import type {
	TypeMember,
	ValueDefinition,
	ValueTypes,
} from '@/v2019C1/extensions/data-model/query/read-value-types.types'
import type { TakeOvers } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { MatchKey, NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * What the project keeps of a template's values, and what of its data the template's types no longer name, for one
 * report or apply (the diff and the reconcile read it alike, so the report lists what the apply writes): the values the
 * project may set (see `settableValuesUnder`), the take-overs the consumer names, and the data instances the type of
 * their logical node no longer holds (`readLostDataInstances`). The template's types are read once, only when either
 * tree holds data.
 */
export async function readValueOwnership(
	query: Core.Query<Config>,
	params: {
		sourceTree: AnyTreeRecord
		instanceTree: AnyTreeRecord
		matchKey: MatchKey
		takeOver: TakeOvers | undefined
		/** Whose names and values: `'source'` (a fork) keeps none of the project's values. */
		namesFollow: NamesFollow
	},
): Promise<ValueOwnership> {
	const { sourceTree, instanceTree, matchKey } = params
	const takeOver = resolveTakeOvers({ takeOver: params.takeOver, tree: instanceTree })
	if (!holdsValue(sourceTree) && !holdsDataInstance(instanceTree)) {
		return { settableValues: new Map(), lostData: new Set(), takeOver }
	}
	const types = await readValueTypes(query)
	// a fork follows the other version's values: none is the project's to keep
	const keepsValues = params.namesFollow === 'project'
	return {
		settableValues: keepsValues
			? new Map(settableValuesUnder({ node: sourceTree, context: undefined, types }))
			: new Map(),
		lostData: readLostDataInstances({ sourceTree, instanceTree, matchKey, types }),
		takeOver,
	}
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

/** Whether a subtree holds a data instance. */
function holdsDataInstance(node: AnyTreeRecord): boolean {
	return node.tagName === VALUE_TAGS.object || node.tree.some(holdsDataInstance)
}

/** Whether a subtree holds a value. */
function holdsValue(node: AnyTreeRecord): boolean {
	return node.tagName === VALUE_TAGS.value || node.tree.some(holdsValue)
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
 * What a `DAI`'s values are held to: its own kind, else its data attribute's, and whether its value is imported
 * (`readValueImport`) — only its own when its data attribute is not found in the template's types.
 */
function valueDefinitionOf(params: {
	node: AnyTreeRecord
	context: TypeContext | undefined
	types: ValueTypes
}): ValueDefinition {
	const { node, context, types } = params
	const member = context ? memberNamed({ node, context, types }) : undefined
	const valKind = readAttribute({ record: node, name: 'valKind', defaults: 'none' })
	return {
		...member?.definition,
		...(valKind ? { valKind } : {}),
		imported: readValueImport({ instance: node, dataAttribute: member?.record }),
	}
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
	const settable = definition.valKind === SETTABLE_VALUE_KIND || definition.imported === true
	if (!settable) return undefined
	const allowed =
		definition.bType === ENUMERATED_BASIC_TYPE && definition.type
			? types.enumerationsById.get(definition.type)
			: undefined
	return allowed ? { allowed } : {}
}
