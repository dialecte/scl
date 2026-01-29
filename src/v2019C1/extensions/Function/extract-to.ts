import { getOrCreateSubstationSectionRequiredStructure } from '@/v2019C1/helpers'

import type { Scl } from '@/v2019C1/config'
import type { Chain } from '@dialecte/core'

export function extractTo(params: Scl.MethodsParams<'Function'>) {
	const { chain, contextPromise } = params

	return async function (params: {
		target: {
			extension: 'FSD' | 'ASD' | 'ISD'
			chain: Chain<Scl.Config, 'SCL'>
			level?: 'Substation' | 'Bay' | 'VoltageLevel'
		}
	}) {
		const {
			target: { extension, chain: targetRootChain, level = 'Substation' },
		} = params

		const context = await contextPromise
		const sourceChain = chain({
			contextPromise: Promise.resolve(context),
		})

		const excludeFromFSDExtraction = [{ tagName: 'LNode' as const, scope: 'children' as const }]

		const functionTreeToClone = await sourceChain.getTree({
			exclude: extension === 'FSD' ? excludeFromFSDExtraction : undefined,
		})

		const { chain: targetRootChainWithProperStructure } =
			await getOrCreateSubstationSectionRequiredStructure({
				chain: targetRootChain,
				focusLevel: level,
			})

		const endingTargetChain = targetRootChainWithProperStructure.deepCloneChild({
			record: functionTreeToClone,
			setFocus: true,
		})

		return {
			sourceChain: sourceChain,
			targetChain: endingTargetChain,
		}
	}
}
