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

		const targetChainWithFunction = targetRootChainWithProperStructure.deepCloneChild({
			record: functionTreeToClone,
			setFocus: true,
		})

		const { currentFocus: clonedFunction } = await targetChainWithFunction.getContext()

		const endingTargetChain = await cloneDataModel({
			sourceChain,
			targetChain: targetChainWithFunction.goToElement({ tagName: 'SCL' }),
		})

		return {
			sourceChain: sourceChain,
			targetChain: endingTargetChain.goToElement({ tagName: 'Function', id: clonedFunction.id }),
		}
	}
}

async function cloneDataModel(params: {
	sourceChain: Scl.Chain<'Function'>
	targetChain: Scl.Chain<'SCL'>
}): Promise<Scl.Chain<'DataTypeTemplates'>> {
	const { sourceChain, targetChain } = params
	const { LNode: lnodes } = await sourceChain.findDescendants({
		tagName: 'LNode',
	})

	let lnTypes = []

	for (const lnode of lnodes) {
		const { lnType } = await sourceChain
			.goToElement({ tagName: 'LNode', id: lnode.id })
			.getAttributesValues()

		if (!lnType) continue

		lnTypes.push(lnType)
	}
	const {
		LNodeType: lnodeTypes,
		DOType: doTypes,
		DAType: daTypes,
		EnumType: enumTypes,
	} = await sourceChain.goToElement({ tagName: 'DataTypeTemplates' }).resolveDataModel({ lnTypes })

	const { DataTypeTemplates: targetDataTypeTemplates } = await targetChain.findDescendants({
		tagName: 'DataTypeTemplates',
	})

	let targetChainWithClonedDataModel: Scl.Chain<'DataTypeTemplates'>
	if (targetDataTypeTemplates.length) {
		targetChainWithClonedDataModel = targetChain.goToElement({ tagName: 'DataTypeTemplates' })
	} else {
		targetChainWithClonedDataModel = targetChain.addChild({
			tagName: 'DataTypeTemplates',
			attributes: {},
			setFocus: true,
		})
	}

	for (const lnodeType of lnodeTypes) {
		targetChainWithClonedDataModel = targetChainWithClonedDataModel.deepCloneChild({
			record: lnodeType,
			setFocus: false,
		})
	}

	for (const doType of doTypes) {
		targetChainWithClonedDataModel = targetChainWithClonedDataModel.deepCloneChild({
			record: doType,
			setFocus: false,
		})
	}

	for (const daType of daTypes) {
		targetChainWithClonedDataModel = targetChainWithClonedDataModel.deepCloneChild({
			record: daType,
			setFocus: false,
		})
	}

	for (const enumType of enumTypes) {
		targetChainWithClonedDataModel = targetChainWithClonedDataModel.deepCloneChild({
			record: enumType,
			setFocus: false,
		})
	}

	return targetChainWithClonedDataModel
}
