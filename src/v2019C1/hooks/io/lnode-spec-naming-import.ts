import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { specifiedNamingOf } from '@/v2019C1/extensions/data-model/naming/lnode-naming'

import type { DerivedSpecificationNamingWarning } from './io-hooks.types'
import type { SpecNamingImport } from './lnode-spec-naming-import.types'
import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

/**
 * Gives every imported LNode without `LNodeSpecNaming` its own, with the same rule as the record
 * hooks (`specifiedNamingOf`, data-model naming). The import has no store access: the pass collects the LNodes, their
 * `eIEC61850-6-100` Private and the LNodes that have one; the records are made at the end.
 */
export function createSpecNamingImport(): SpecNamingImport {
	const lnodes = new Map<string, AnyRawRecord>()
	const privateByLnode = new Map<string, AnyRawRecord>()
	const namings = new Map<string, AnyRawRecord>()

	function collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void {
		const { record, ancestry } = params
		if (record.tagName === 'LNode') {
			lnodes.set(record.id, record)
			return
		}
		const lnode = ancestry.findLast((ancestor) => ancestor.tagName === 'LNode')
		if (!lnode) return
		if (record.tagName === 'LNodeSpecNaming') {
			if (!namings.has(lnode.id)) namings.set(lnode.id, record)
			return
		}
		if (
			record.tagName === 'Private' &&
			record.parent?.id === lnode.id &&
			readAttribute(record, 'type') === SCL_DIALECTE_CONFIG.namespaces.v2019C1.prefix
		) {
			privateByLnode.set(lnode.id, record)
		}
	}

	function resolve(): ReturnType<SpecNamingImport['resolve']> {
		const creates: AnyRawRecord[] = []
		const updates: RecordPatch[] = []
		const warnings: DerivedSpecificationNamingWarning[] = []

		for (const lnode of lnodes.values()) {
			if (namings.has(lnode.id)) continue
			const { attributes, derived } = specifiedNamingOf(attributesOf(lnode))
			const existingPrivate = privateByLnode.get(lnode.id)
			const holder = existingPrivate ?? newPrivate(lnode)
			const specNaming: AnyRawRecord = {
				id: crypto.randomUUID(),
				tagName: 'LNodeSpecNaming',
				namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
				attributes,
				value: '',
				parent: { id: holder.id, tagName: holder.tagName },
				children: [],
			}
			creates.push(specNaming)
			namings.set(lnode.id, specNaming)
			if (existingPrivate) {
				updates.push({ recordId: existingPrivate.id, children: [childRef(specNaming)] })
			} else {
				creates.push({ ...holder, children: [childRef(specNaming)] })
				updates.push({ recordId: lnode.id, children: [childRef(holder)] })
			}
			if (derived) {
				warnings.push({
					type: 'derived-specification-naming',
					recordId: lnode.id,
					details: { iedName: readAttribute(lnode, 'iedName') ?? '', specifiedNaming: attributes },
				})
			}
		}

		const resolved = new Map(namings)
		lnodes.clear()
		privateByLnode.clear()
		namings.clear()
		return { namings: resolved, creates, updates, warnings }
	}

	return { collect, resolve }
}

function newPrivate(lnode: AnyRawRecord): AnyRawRecord {
	return {
		id: crypto.randomUUID(),
		tagName: 'Private',
		namespace: SCL_DIALECTE_CONFIG.namespaces.default,
		attributes: [{ name: 'type', value: SCL_DIALECTE_CONFIG.namespaces.v2019C1.prefix }],
		value: '',
		parent: { id: lnode.id, tagName: lnode.tagName },
		children: [],
	}
}

function childRef(record: AnyRawRecord): { id: string; tagName: string } {
	return { id: record.id, tagName: record.tagName }
}

function attributesOf(record: AnyRawRecord): Record<string, string> {
	return Object.fromEntries(record.attributes.map((attribute) => [attribute.name, attribute.value]))
}

function readAttribute(record: AnyRawRecord, name: string): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}
