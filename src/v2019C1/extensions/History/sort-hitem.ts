import { getAttributesValuesByName } from '@dialecte/core'

import type { Scl } from '@/v2019C1/config'
import type { ExtensionsMethodParams } from '@dialecte/core'

export function getSortedHitems(params: ExtensionsMethodParams<Scl.Config, 'History'>) {
	const { chain, contextPromise } = params

	return async function () {
		const sourceChain = chain({
			contextPromise,
		})

		const { Hitem: hitems } = await sourceChain.findDescendants()

		const sortedHitems = [...hitems].sort((a, b) => {
			const { version: versionA, revision: revisionA } = getAttributesValuesByName({
				attributes: a.attributes,
			})
			const { version: versionB, revision: revisionB } = getAttributesValuesByName({
				attributes: b.attributes,
			})
			const versionANumber = Number(versionA || 0)
			const versionBNumber = Number(versionB || 0)
			if (versionANumber !== versionBNumber) {
				return versionANumber - versionBNumber
			}
			const revisionANumber = Number(revisionA || 0)
			const revisionBNumber = Number(revisionB || 0)
			return revisionANumber - revisionBNumber
		})

		return sortedHitems
	}
}
