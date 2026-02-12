import { getOrCreateSubstationSectionRequiredStructure } from '@/v2019C1/helpers'

import type { Scl } from '@/v2019C1/config'

export function extractTo(params: Scl.MethodsParams<'Function'>) {
	const { chain, contextPromise } = params

	return async function (params: {
		target: {
			extension: 'FSD' | 'ASD' | 'ISD'
			chain: Scl.Chain<'SCL'>
			level?: 'Substation' | 'Bay' | 'VoltageLevel'
		}
	}): Promise<{
		sourceChain: Scl.Chain<'Function'>
		targetChain: Scl.Chain<'Function'>
	}> {
		const {
			target: { extension, chain: targetRootChain, level = 'Substation' },
		} = params

		const context = await contextPromise
		const sourceChain = chain({
			contextPromise: Promise.resolve(context),
		})

		const excludeFromFSDExtraction = [
			// LNode children
			{ tagName: 'LNodeInputs' as const, scope: 'self' as const },
			{ tagName: 'LNodeOutputs' as const, scope: 'self' as const },
			{ tagName: 'DOS' as const, scope: 'self' as const },
			// Function children
			{ tagName: 'FunctionSclRef' as const, scope: 'self' as const },
			{ tagName: 'Variable' as const, scope: 'self' as const },
			{ tagName: 'GeneralEquipment' as const, scope: 'self' as const },
			{ tagName: 'ConductingEquipment' as const, scope: 'self' as const },
			{ tagName: 'ProcessResources' as const, scope: 'self' as const },
			{ tagName: 'PowerSystemRelations' as const, scope: 'self' as const },
			// Common
			{ tagName: 'Labels' as const, scope: 'self' as const },
			{ tagName: 'BehaviorDescription' as const, scope: 'self' as const },
		]

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
