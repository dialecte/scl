import { splitLnodeQualifier } from './parse-path'
import { resolveMappedLNode } from './resolve-mapped-lnode'
import { resolveReferencePath } from './resolve-reference-path'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type MappedDataTarget = {
	ln: Scl.Ref<'LN' | 'LN0'>
	dataPath: readonly string[]
}

export type ResolvedMappedData = {
	ln: Scl.TrackedRecord<'LN' | 'LN0'>
	dataPath: readonly string[]
	source: 'record' | 'ancestor-data' | 'lnode'
}

type MappedDataRecord = Scl.TrackedRecord<Scl.ElementsOf>
type Query = Core.Query<Config> | Core.Transaction<Config>

/** Resolve the effective implementation LN and semantic data path of mapped data. */
export async function resolveMappedData(
	query: Query,
	record: MappedDataRecord,
): Promise<ResolvedMappedData | undefined> {
	const spec = MAPPED_NAME_REFS.get(record.tagName)
	if (!spec) return undefined

	const mappedName = attribute(record, spec.path)
	const mappedLnUuid = attribute(record, spec.uuid)
	if (mappedName) {
		const dataPath = parseMappedDataPath(mappedName)
		if (dataPath.length === 0) return undefined

		const explicit = await resolveReferencePath(query, record, spec.path)
		if (explicit && (explicit.record.tagName === 'LN' || explicit.record.tagName === 'LN0')) {
			return {
				ln: explicit.record as Scl.TrackedRecord<'LN' | 'LN0'>,
				dataPath,
				source: 'record',
			}
		}

		const lnode = await findAncestorLNode(query, record)
		const ln = lnode ? await resolveMappedLNode(query, lnode) : undefined
		if (ln && !mappedName.includes('/')) return { ln, dataPath, source: 'record' }
		return undefined
	}

	// The UUID identifies only the LN; without the mapped name the data path is unknown.
	if (mappedLnUuid) return undefined

	const ancestors = await query.findAncestors(record)
	const parent = ancestors.find(
		(ancestor) => ancestor.tagName === 'DOS' || ancestor.tagName === 'SDS',
	) as MappedDataRecord | undefined
	const specifiedName = attribute(record, 'name')
	if (parent) {
		const inherited = await resolveMappedData(query, parent)
		if (!inherited || !specifiedName) return undefined
		return {
			ln: inherited.ln,
			dataPath: [...inherited.dataPath, specifiedName],
			source: 'ancestor-data',
		}
	}

	if (record.tagName !== 'DOS' || !specifiedName) return undefined
	const lnode = ancestors.find((ancestor) => ancestor.tagName === 'LNode') as
		| Scl.TrackedRecord<'LNode'>
		| undefined
	if (!lnode) return undefined
	const ln = await resolveMappedLNode(query, lnode)
	return ln ? { ln, dataPath: [specifiedName], source: 'lnode' } : undefined
}

export async function resolveMappedDataLn(
	query: Query,
	record: MappedDataRecord,
): Promise<Scl.TrackedRecord<'LN' | 'LN0'> | undefined> {
	return (await resolveMappedData(query, record))?.ln
}

function attribute(record: Scl.TrackedRecord<Scl.ElementsOf>, name: string): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}

function parseMappedDataPath(mappedName: string): readonly string[] {
	const { qualifier } = splitLnodeQualifier(mappedName)
	return (qualifier ?? mappedName)
		.split('.')
		.map((segment) => segment.trim())
		.filter(Boolean)
}

async function findAncestorLNode(
	query: Query,
	record: MappedDataRecord,
): Promise<Scl.TrackedRecord<'LNode'> | undefined> {
	const ancestors = await query.findAncestors(record)
	return ancestors.find((ancestor) => ancestor.tagName === 'LNode') as
		| Scl.TrackedRecord<'LNode'>
		| undefined
}
