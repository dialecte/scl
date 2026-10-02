import { buildMappedDataAttributes } from '../query/build/build-mapped-data-attributes'
import { resolveMappedDataAndDefault } from '../query/resolve/resolve-mapped-data-and-default'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'

import type { SetMappedDataParams, SetMappedDataResult } from './set-mapped-data.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Transaction extension: state which data implements a `DOS` / `SDS` / `DAS`, and get back
 * what was stored.
 *
 * The record carries `mappedDoName` / `mappedDaName` (the path from the logical node) and
 * `mappedLnUuid` only when the implementation differs from its default; otherwise neither.
 * A data path the schema cannot hold on this record is not written and reported as
 * `inexpressible`. Without `implementation` the record follows its default.
 */
export async function setMappedData(
	tx: Core.Transaction<Config>,
	params: SetMappedDataParams,
): Promise<SetMappedDataResult> {
	const { reference, implementation } = params
	const attributeNames = MAPPED_NAME_REFS.get(reference.tagName)
	if (!attributeNames) return { kind: 'inexpressible' }

	const lnUuid = implementation
		? await tx.getAttribute(implementation.ln, { name: 'uuid' })
		: undefined
	if (implementation && !lnUuid) return { kind: 'inexpressible' }

	const { defaultData } = await resolveMappedDataAndDefault(tx, { reference })
	const attributes =
		implementation && lnUuid
			? buildMappedDataAttributes({
					tagName: reference.tagName,
					implementation: { lnId: implementation.ln.id, lnUuid, dataPath: implementation.dataPath },
					defaultData: defaultData && { lnId: defaultData.ln?.id, dataPath: defaultData.dataPath },
				})
			: ({ kind: 'default' } as const)
	if (attributes.kind === 'inexpressible') return { kind: 'inexpressible' }

	const values =
		attributes.kind === 'default'
			? { [attributeNames.path]: undefined, [attributeNames.uuid]: undefined }
			: {
					[attributeNames.path]: attributes.mappedName,
					[attributeNames.uuid]: attributes.mappedLnUuid,
				}
	await tx.update(reference, { attributes: values })
	return { kind: attributes.kind === 'default' ? 'default' : 'stored' }
}
