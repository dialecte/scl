import { extractFunction } from '../shared'

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
			{ tagName: 'LNodeInputs', scope: 'self' } as const,
			{ tagName: 'LNodeOutputs', scope: 'self' } as const,
			{ tagName: 'DOS', scope: 'self' } as const,
			// Function children
			{ tagName: 'FunctionSclRef', scope: 'self' } as const,
			{ tagName: 'Variable', scope: 'self' } as const,
			{ tagName: 'GeneralEquipment', scope: 'self' } as const,
			{ tagName: 'ConductingEquipment', scope: 'self' } as const,
			{ tagName: 'ProcessResources', scope: 'self' } as const,
			{ tagName: 'PowerSystemRelations', scope: 'self' } as const,
			// Common
			{ tagName: 'Labels', scope: 'self' } as const,
			{ tagName: 'BehaviorDescription', scope: 'self' } as const,
		]

		const functionTreeToClone = await sourceChain.getTree({
			exclude: extension === 'FSD' ? excludeFromFSDExtraction : undefined,
		})

		const endingTargetChain = await extractFunction({
			source: {
				chain: sourceChain,
				functionTreeToClone,
			},
			target: {
				chain: targetRootChain,
				extension,
				level,
			},
		})

		return {
			sourceChain: sourceChain,
			targetChain: endingTargetChain,
		}
	}
}
