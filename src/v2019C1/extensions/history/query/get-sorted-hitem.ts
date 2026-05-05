import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: returns all Hitem descendants of the History element,
 * sorted by version then revision (ascending).
 */
export async function getSortedHitems(
	query: Core.Query<Config>,
): Promise<Scl.TrackedRecord<'Hitem'>[]> {
	const history = await query.getRecord({ tagName: 'History' })
	if (!history) return []

	const { Hitem: hitems = [] } = await query.findDescendants(history, { collect: 'Hitem' })

	function getNumericAttributeValue(
		record: (typeof hitems)[number],
		name: 'version' | 'revision',
	): number {
		return Number(record.attributes.find((attr) => attr.name === name)?.value || 0)
	}

	const sortedHitems = [...hitems].sort((a, b) => {
		const versionDifference =
			getNumericAttributeValue(a, 'version') - getNumericAttributeValue(b, 'version')
		if (versionDifference !== 0) return versionDifference

		const revisionDifference =
			getNumericAttributeValue(a, 'revision') - getNumericAttributeValue(b, 'revision')
		return revisionDifference
	})

	return sortedHitems
}
