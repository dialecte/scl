import { PLACEHOLDER_LINEAGE_CODES } from './placeholder-lineages.constants'

import { checkTemplateUuids } from '@/v2019C1/extensions/lifecycle/validate'

import type { PlaceholderLineages } from './placeholder-lineages.types'
import type { Config } from '@/v2019C1/config'
import type { ReferencesByName } from '@/v2019C1/extensions/lifecycle/contract.types'
import type * as Core from '@dialecte/core'

/**
 * The lineage values a reference of the project may be paired by name on, read once for a whole report or apply: none
 * unless the consumer asked for it, else the values `checkTemplateUuids` flags as placeholders in the project.
 */
export async function resolvePlaceholderLineages(
	query: Core.Query<Config>,
	params: { referencesByName: ReferencesByName | undefined },
): Promise<PlaceholderLineages> {
	if ((params.referencesByName ?? 'never') === 'never') return new Set()
	const warnings = await checkTemplateUuids(query)
	return new Set(
		warnings
			.filter((warning) => PLACEHOLDER_LINEAGE_CODES.has(warning.code))
			.map((warning) => warning.value),
	)
}
