import { FOLLOWED_TYPE_REFERENCES } from './type-change.constants'

import { elementSignature } from '@/v2019C1/extensions/signature/query'
import { readAttribute } from '@/v2019C1/helpers'

import type { AttributeChange } from './diff.types'
import type { TypeComparison, TypeSignaturesOfSide } from './type-change.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** A fresh comparison run: nothing read yet on either side. */
export function createTypeComparison(): TypeComparison {
	return {
		source: { signatures: new Map(), byId: new Map() },
		target: { signatures: new Map(), byId: new Map() },
	}
}

/**
 * The type references of a matched element whose type the template gives other content than the project's: each type
 * is read in its own document and compared by what it holds (its signature, ids left out, the types it names folded
 * in), so an equal type under another id is no change and another type under the same id is one. `before` is the id
 * the instance names, `after` the id the template names. A template naming no type clears the instance's; a template
 * naming a type its own document lacks brings nothing.
 */
export async function typeChangesOf(
	sourceQuery: Core.Query<Config>,
	params: {
		targetQuery: Core.Query<Config>
		sourceNode: AnyTreeRecord
		instanceNode: AnyTreeRecord
		comparison: TypeComparison
	},
): Promise<AttributeChange[]> {
	const { targetQuery, sourceNode, instanceNode, comparison } = params
	const changes: AttributeChange[] = []
	for (const { attribute, target } of FOLLOWED_TYPE_REFERENCES.get(instanceNode.tagName) ?? []) {
		const after =
			readAttribute({ record: sourceNode, name: attribute, defaults: 'none' }) || undefined
		const before =
			readAttribute({ record: instanceNode, name: attribute, defaults: 'none' }) || undefined
		if (!after) {
			if (before) changes.push({ name: attribute, before, after })
			continue
		}
		const templateType = await signatureOf(sourceQuery, {
			side: comparison.source,
			tagName: target,
			id: after,
		})
		if (templateType === undefined) continue
		const instanceType = before
			? await signatureOf(targetQuery, { side: comparison.target, tagName: target, id: before })
			: undefined
		if (instanceType !== templateType) changes.push({ name: attribute, before, after })
	}
	return changes
}

/** The signature of the type of `tagName` under `id` in a document, `undefined` when it holds none. */
async function signatureOf(
	query: Core.Query<Config>,
	params: { side: TypeSignaturesOfSide; tagName: string; id: string },
): Promise<string | undefined> {
	const { side, tagName, id } = params
	const key = `${tagName}#${id}`
	if (side.byId.has(key)) return side.byId.get(key)
	const [record] = await query.any.findByAttributes({ tagName, attributes: { id } })
	const signature = record
		? await elementSignature(query, {
				ref: { tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>,
				resolveReferences: true,
				signatureCache: side.signatures,
			})
		: undefined
	side.byId.set(key, signature)
	return signature
}
