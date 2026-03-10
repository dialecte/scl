import { extractFunction } from '../shared'

import type { Scl } from '@/v2019C1/config'

export function extractTo(params: Scl.MethodsParams<'SubFunction'>) {
	const { chain, contextPromise } = params

	return async function (params: {
		target: {
			chain: Scl.Chain<'SCL'>
			level?: 'Substation' | 'Bay' | 'VoltageLevel'
		}
	}) {
		const {
			target: { chain: targetRootChain, level = 'Substation' },
		} = params

		const context = await contextPromise
		const sourceChain = chain({
			contextPromise: Promise.resolve(context),
		})

		const subFunctionTreeToClone = await sourceChain.getTree({
			exclude: [
				// LNode children
				{ tagName: 'LNodeInputs', scope: 'self' },
				{ tagName: 'LNodeOutputs', scope: 'self' },
				{ tagName: 'DOS', scope: 'self' },
				// Function children
				{ tagName: 'FunctionSclRef', scope: 'self' },
				{ tagName: 'Variable', scope: 'self' },
				{ tagName: 'GeneralEquipment', scope: 'self' },
				{ tagName: 'ConductingEquipment', scope: 'self' },
				{ tagName: 'ProcessResources', scope: 'self' },
				{ tagName: 'PowerSystemRelations', scope: 'self' },
				// Common
				{ tagName: 'Labels', scope: 'self' },
				{ tagName: 'BehaviorDescription', scope: 'self' },
			],
		})

		const promoteSubFunctionToFunction = {
			...subFunctionTreeToClone,
			tagName: 'Function',
		} as Scl.TreeRecord<'Function'>

		const endingTargetChain = await extractFunction({
			source: {
				chain: sourceChain,
				functionTreeToClone: promoteSubFunctionToFunction,
			},
			target: {
				chain: targetRootChain,
				extension: 'FSD',
				level,
			},
		})

		return {
			sourceChain: sourceChain,
			targetChain: endingTargetChain,
		}
	}
}
