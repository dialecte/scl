import { buildElementPath } from './build-element-path'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import {
	resolveMappedData,
	resolveMappedLNode,
	type MappedDataTarget,
} from '@/v2019C1/extensions/reference/query/resolve'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type ComputeMappedReferenceAttributesParams = {
	record: Scl.RawRecord<Scl.ElementsOf>
	target?: MappedDataTarget
}

export type MappedReferenceAttributes = {
	mappedName?: string
	mappedLnUuid?: string
}

type Query = Core.Query<Config> | Core.Transaction<Config>

/** Compute the all-or-nothing persisted mapping documentation for DOS/SDS/DAS. */
export async function computeMappedReferenceAttributes(
	query: Query,
	params: ComputeMappedReferenceAttributesParams,
): Promise<MappedReferenceAttributes | null> {
	const { record } = params
	if (record.tagName !== 'DOS' && record.tagName !== 'SDS' && record.tagName !== 'DAS') return null
	const spec = MAPPED_NAME_REFS.get(record.tagName)
	if (!spec) return null

	const target = params.target ?? (await resolveExistingTarget(query, record))
	if (!target || target.dataPath.length === 0) return null

	const ln = await query.getRecord(target.ln)
	if (!ln || (ln.tagName !== 'LN' && ln.tagName !== 'LN0')) return null
	const mappedLnUuid = attribute(ln, 'uuid')

	const lnode = await findAncestorLNode(query, record)
	const mappedLnodeLn = lnode ? await resolveMappedLNode(query, lnode) : undefined
	if (!mappedLnodeLn) {
		const lnPath = await buildElementPath(query as Core.Query<Config>, target.ln)
		if (!lnPath) return null
		return {
			mappedName: `${lnPath.path}.${target.dataPath.join('.')}`,
			mappedLnUuid,
		}
	}

	const specifiedName = attribute(record, 'name')
	if (!specifiedName) return null
	const implementedName = await documentationName(query, record, target.dataPath)
	if (implementedName === specifiedName) {
		return { mappedName: undefined, mappedLnUuid: undefined }
	}

	return { mappedName: implementedName, mappedLnUuid }
}

/** @deprecated Use computeMappedReferenceAttributes to reconcile the complete pair. */
export async function buildMappedName<GenericElement extends Scl.ElementsOf>(
	query: Core.Query<Config>,
	record: Scl.RawRecord<GenericElement>,
): Promise<string | undefined> {
	if (record.tagName !== 'DOS' && record.tagName !== 'SDS' && record.tagName !== 'DAS') {
		return undefined
	}
	return (
		await computeMappedReferenceAttributes(query, {
			record: record as unknown as Scl.RawRecord<Scl.ElementsOf>,
		})
	)?.mappedName
}

async function resolveExistingTarget(
	query: Query,
	record: Scl.RawRecord<Scl.ElementsOf>,
): Promise<MappedDataTarget | undefined> {
	const resolved = await resolveMappedData(query, record as Scl.TrackedRecord<Scl.ElementsOf>)
	if (!resolved) return undefined
	return {
		ln: { tagName: resolved.ln.tagName, id: resolved.ln.id },
		dataPath: resolved.dataPath,
	}
}

async function documentationName(
	query: Query,
	record: Scl.RawRecord<Scl.ElementsOf>,
	dataPath: readonly string[],
): Promise<string> {
	if (record.tagName !== 'DAS') return dataPath[dataPath.length - 1]

	const ancestors = await query.findAncestors(record)
	const parent = ancestors.find(
		(ancestor) => ancestor.tagName === 'DOS' || ancestor.tagName === 'SDS',
	)
	if (parent) {
		const resolvedParent = await resolveMappedData(
			query,
			parent as Scl.TrackedRecord<Scl.ElementsOf>,
		)
		if (
			resolvedParent &&
			resolvedParent.dataPath.length === dataPath.length - 1 &&
			resolvedParent.dataPath.every((segment, index) => segment === dataPath[index])
		) {
			return dataPath[dataPath.length - 1]
		}
	}
	return dataPath.join('.')
}

async function findAncestorLNode(
	query: Query,
	record: Scl.RawRecord<Scl.ElementsOf>,
): Promise<Scl.TrackedRecord<'LNode'> | undefined> {
	const ancestors = await query.findAncestors(record)
	return ancestors.find((ancestor) => ancestor.tagName === 'LNode') as
		| Scl.TrackedRecord<'LNode'>
		| undefined
}

function attribute<GenericElement extends Scl.ElementsOf>(
	record: Scl.RawRecord<GenericElement> | Scl.TrackedRecord<GenericElement>,
	name: string,
): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}
