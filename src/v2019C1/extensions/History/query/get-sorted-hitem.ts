import type { Scl } from '@/v2019C1/config'

/**
 * Query extension: returns all Hitem descendants of the History element,
 * sorted by version then revision (ascending).
 */
export async function getSortedHitems(query: Scl.Query): Promise<Scl.TrackedRecord<'Hitem'>[]> {
	const history = (await query.getRecordsByTagName('History'))[0]
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
