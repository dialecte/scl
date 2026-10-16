import { invariant } from '@dialecte/core/utils'

import { CHILDREN } from '@/v2019C1/definition'
import { getIdentityFields } from '@/v2019C1/extensions/lifecycle/constraints/identity-fields'
import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference/constants/type-id-pairs'

import type {
	DataTypeCondition,
	DataTypeModel,
	DataTypeModelMember,
	DataTypeModelType,
	TypeIdPairsByReferrer,
} from './data-types.types'
import type { TypeIdReferencePair } from '@/v2019C1/extensions/reference/constants/types'

/**
 * The data model read from the definition and the type-id references: the types are the data type
 * templates whose children reference a type, those children are their members, a member points at
 * the type its reference names, the identities are the definition's identity fields. The logical
 * node type is the type an LNode names; the type its members point at is the data object type; the
 * type the other members point at is the data attribute type.
 */
export function createDataTypeModel(): DataTypeModel {
	const pairsByReferrer: TypeIdPairsByReferrer = new Map<string, readonly TypeIdReferencePair[]>(
		Object.entries(TYPE_ID_REFERENCE_PAIRS),
	)
	const typeTags = CHILDREN.DataTypeTemplates.filter(
		(typeTag) => memberTagsOf({ typeTag, pairsByReferrer }).length > 0,
	)
	const rootType = TYPE_ID_REFERENCE_PAIRS.LNode[0].target
	const objectType = theOnly({
		values: memberTagsOf({ typeTag: rootType, pairsByReferrer }).map(
			(memberTag) => nextReferenceOf({ memberTag, typeTags, pairsByReferrer }).target,
		),
		detail: 'the members of the logical node type point at one type',
	})
	const idAttribute = sharedIdentityField({ tags: typeTags })
	const nameAttribute = sharedIdentityField({
		tags: typeTags.flatMap((typeTag) => memberTagsOf({ typeTag, pairsByReferrer })),
	})
	const types = new Map<string, DataTypeModelType>(
		typeTags.map((typeTag) => [
			typeTag,
			modelTypeOf({ typeTag, typeTags, pairsByReferrer, objectType, idAttribute, nameAttribute }),
		]),
	)
	const attributeMembers = [...types.values()]
		.flatMap((type) => [...type.members.values()])
		.filter((member) => !member.continuesObject)
	const attributeType = theOnly({
		values: attributeMembers.map((member) => member.nextType),
		detail: 'the members of the data attribute point at one type',
	})
	const { equals } = sharedCondition({ conditions: attributeMembers.map((member) => member.when) })
	return { rootType, objectType, attributeType, attributeTypeCondition: { equals }, types }
}

/** The children of a data type template that reference a type: its members. */
function memberTagsOf(params: {
	typeTag: (typeof CHILDREN.DataTypeTemplates)[number]
	pairsByReferrer: TypeIdPairsByReferrer
}): string[] {
	const { typeTag, pairsByReferrer } = params
	const children: readonly string[] = CHILDREN[typeTag]
	return children.filter((child) => pairsByReferrer.has(child))
}

/** The reference of a member that names a type of the data model; asserted to exist. */
function nextReferenceOf(params: {
	memberTag: string
	typeTags: readonly string[]
	pairsByReferrer: TypeIdPairsByReferrer
}): TypeIdReferencePair {
	const { memberTag, typeTags, pairsByReferrer } = params
	const reference = pairsByReferrer.get(memberTag)?.find((pair) => typeTags.includes(pair.target))
	invariant(reference, {
		key: 'ASSERTION_FAILED',
		detail: 'a member of the data model references a type of the data model',
		meta: { memberTag },
	})
	return reference
}

/** A type of the data model: the attribute identifying it and each of its members by tag. */
function modelTypeOf(params: {
	typeTag: (typeof CHILDREN.DataTypeTemplates)[number]
	typeTags: readonly string[]
	pairsByReferrer: TypeIdPairsByReferrer
	objectType: string
	idAttribute: string
	nameAttribute: string
}): DataTypeModelType {
	const { typeTag, typeTags, pairsByReferrer, objectType, idAttribute, nameAttribute } = params
	const members = new Map<string, DataTypeModelMember>(
		memberTagsOf({ typeTag, pairsByReferrer }).map((memberTag) => [
			memberTag,
			modelMemberOf({ memberTag, typeTags, pairsByReferrer, objectType, nameAttribute }),
		]),
	)
	return { idAttribute, members }
}

/** A member of the data model: read from its reference, continuing the data object when it points at the data object type. */
function modelMemberOf(params: {
	memberTag: string
	typeTags: readonly string[]
	pairsByReferrer: TypeIdPairsByReferrer
	objectType: string
	nameAttribute: string
}): DataTypeModelMember {
	const { memberTag, typeTags, pairsByReferrer, objectType, nameAttribute } = params
	const reference = nextReferenceOf({ memberTag, typeTags, pairsByReferrer })
	return {
		nameAttribute,
		typeAttribute: reference.attribute,
		nextType: reference.target,
		...(reference.when ? { when: reference.when } : {}),
		continuesObject: reference.target === objectType,
	}
}

/**
 * The one identity field every tag of `tags` has. The intersection stands in for the attribute the
 * type references resolve against (the schema keys of these types all name `id`), which is why the
 * logical node type's `lnClass` drops out.
 */
function sharedIdentityField(params: { tags: readonly string[] }): string {
	const { tags } = params
	const [first, ...rest] = tags.map(getIdentityFields)
	const shared = [...(first ?? [])].filter((field) => rest.every((fields) => fields.has(field)))
	return theOnly({ values: shared, detail: 'the tags of the data model share one identity field' })
}

/** The one condition all of `conditions` are: same attribute, same value; asserted. */
function sharedCondition(params: {
	conditions: readonly (DataTypeCondition | undefined)[]
}): DataTypeCondition {
	const { conditions } = params
	const [first] = conditions
	invariant(
		first &&
			conditions.every(
				(condition) =>
					condition?.attribute === first.attribute && condition.equals === first.equals,
			),
		{
			key: 'ASSERTION_FAILED',
			detail: 'the members of the data attribute point at their type on one condition',
		},
	)
	return first
}

/** The one distinct value of `values`; asserted, `detail` saying what was expected. */
function theOnly(params: { values: readonly string[]; detail: string }): string {
	const { values, detail } = params
	const [only, ...others] = new Set(values)
	invariant(only !== undefined && others.length === 0, { key: 'ASSERTION_FAILED', detail })
	return only
}
