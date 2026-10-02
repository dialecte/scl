import { resolveMappedDataAndDefault } from './resolve-mapped-data-and-default'

import type { MappedData, ResolveMappedDataParams } from './resolve-mapped-data.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: the data that implements a `DOS` / `SDS` / `DAS`.
 *
 * A record that names its implementation (`mappedLnUuid`, `mappedDoName` / `mappedDaName`)
 * is implemented there; a `mappedLnUuid` alone keeps the default data path in that logical
 * node. Otherwise the record follows its default: its parent data, or for a `DOS` the
 * logical node its `LNode` is mapped to, extended by its own name.
 * Returns `undefined` when nothing implements it.
 */
export async function resolveMappedData(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: ResolveMappedDataParams,
): Promise<MappedData | undefined> {
	const { mappedData } = await resolveMappedDataAndDefault(query, params)
	return mappedData
}
