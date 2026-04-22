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

	const { Hitem: hitems = [] } = await query.findDescendants(history)

	return [...hitems].sort((a, b) => {
		const vA = Number(a.attributes.find((attr) => attr.name === 'version')?.value || 0)
		const vB = Number(b.attributes.find((attr) => attr.name === 'version')?.value || 0)
		if (vA !== vB) return vA - vB
		const rA = Number(a.attributes.find((attr) => attr.name === 'revision')?.value || 0)
		const rB = Number(b.attributes.find((attr) => attr.name === 'revision')?.value || 0)
		return rA - rB
	})
}
