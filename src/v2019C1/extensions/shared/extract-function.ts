import { getAttributeValueByName, isRecordOf } from '@dialecte/core/helpers'
import { assert } from '@dialecte/core/utils'

import type { Scl } from '@/v2019C1/config'

export async function extractFunction(params: {
	source: {
		chain: Scl.Chain<'Function'> | Scl.Chain<'SubFunction'>
		functionTreeToClone: Scl.TreeRecord<'Function'>
	}
	target: {
		extension: 'FSD' | 'ASD' | 'ISD'
		chain: Scl.Chain<'SCL'>
		level?: 'Substation' | 'Bay' | 'VoltageLevel'
	}
}): Promise<Scl.Chain<'Function'>> {
	const {
		source: { chain: sourceFunctionChain, functionTreeToClone },
		target: { chain: targetRootChain, extension, level = 'Substation' },
	} = params

	//== Init target file
	const { name: functionToCloneName } = await sourceFunctionChain.getAttributesValues()
	assert(functionToCloneName, 'Function must have a name to be extracted')
	const {
		id: sourceHeaderId,
		version: sourceHeaderVersion,
		revision: sourceHeaderRevision,
	} = await sourceFunctionChain.goToElement({ tagName: 'Header' }).getAttributesValues()

	const targetChainWithHistory = targetRootChain.addEntryToHistory({
		filename: functionToCloneName,
		header: {
			fileType: extension,
			tool: 'SCL Dialecte',
			version: 'increment',
		},
		item: {
			who: 'Automated',
			what: `${extension} initialization`,
			why: `Function was extracted from file with header ID ${sourceHeaderId} (version: ${sourceHeaderVersion} revision: ${sourceHeaderRevision})`,
		},
	})

	const { chain: targetRootChainWithProperStructure } =
		await targetChainWithHistory.ensureSubstationRequiredStructure({
			focusLevel: level,
		})

	//== Clone to target

	const targetChainWithFunction = targetRootChainWithProperStructure
		.deepCloneChild({
			record: functionTreeToClone,
			setFocus: true,
		})
		.update({ attributes: { templateUuid: undefined } })

	const { currentFocus: clonedFunction } = await targetChainWithFunction.getContext()

	const targetChainWithFunctionCategories = await cloneFunctionCategories({
		sourceChain: sourceFunctionChain.goToElement({ tagName: 'SCL' }),
		targetChain: targetChainWithFunction.goToParent(level),
		sourceFunctionTree: functionTreeToClone,
		targetFunction: clonedFunction,
	})

	const targetChainWithClonedDataModel = await cloneDataModel({
		sourceChain: sourceFunctionChain,
		targetChain: targetChainWithFunctionCategories.goToElement({ tagName: 'SCL' }),
	})

	//== Cleanup

	const endingTargetChain = await cleanUpLNodeReferences({
		targetChain: targetChainWithClonedDataModel.goToElement({ tagName: 'SCL' }),
	})

	return endingTargetChain.goToElement({ tagName: 'Function', id: clonedFunction.id })
}

async function cloneDataModel(params: {
	sourceChain: Scl.Chain<'Function'> | Scl.Chain<'SubFunction'>
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

async function cloneFunctionCategories(params: {
	sourceChain: Scl.Chain<'SCL'>
	targetChain: Scl.Chain<'Substation' | 'Bay' | 'VoltageLevel'>
	sourceFunctionTree: Scl.TreeRecord<'Function'>
	targetFunction: Scl.ChainRecord<'Function'>
}): Promise<Scl.Chain<'Substation' | 'Bay' | 'VoltageLevel'>> {
	const { sourceChain, targetChain, sourceFunctionTree, targetFunction } = params

	const sourceFunctionUuid = getAttributeValueByName({
		attributes: sourceFunctionTree.attributes,
		name: 'uuid',
	})
	assert(sourceFunctionUuid, 'Source Function must have a uuid attribute')
	const targetFunctionUuid = getAttributeValueByName({
		attributes: targetFunction.attributes,
		name: 'uuid',
	})
	assert(targetFunctionUuid, 'Target Function must have a uuid attribute')

	//== Build source name->uuid map from in-memory tree, match against target SubFunctions from DB

	const uuidMap = new Map<string, string>([[sourceFunctionUuid, targetFunctionUuid]])

	const { cloneMappings } = await targetChain.getContext()

	for (const { source, target } of cloneMappings) {
		if (source.tagName !== 'SubFunction' || target.tagName !== 'SubFunction') continue
		const { uuid: sourceUuid } = await sourceChain
			.goToElement({ tagName: source.tagName, id: source.id })
			.getAttributesValues()

		const { uuid: targetUuid } = await targetChain
			.goToElement({ tagName: target.tagName, id: target.id })
			.getAttributesValues()

		if (sourceUuid && targetUuid) {
			uuidMap.set(sourceUuid, targetUuid)
		}
	}

	const allSourceUuids = [...uuidMap.keys()]

	//== Clone FunctionCategory trees (single query with all source uuids)

	const { currentFocus: targetChainCurrentFocus } = await targetChain.getContext()

	const functionCategoriesTree = await sourceChain.findDescendantsAsTree({
		tagName: 'FunctionCategory',
		descendant: {
			tagName: 'SubCategory',
			descendant: {
				tagName: 'FunctionCatRef',
				attributes: { functionUuid: allSourceUuids },
			},
		},
	})

	let targetChainWithClonedCategories = targetChain

	for (const functionCategoryTree of functionCategoriesTree) {
		const cleanedRecord = stripAttributesDeep({
			record: functionCategoryTree,
			attributeNames: ['function', 'templateUuid', 'originUuid'],
		})

		targetChainWithClonedCategories = targetChainWithClonedCategories.deepCloneChild({
			record: cleanedRecord,
			setFocus: false,
		})
	}

	//== Update all cloned FunctionCatRefs using the uuid map

	let targetChainWithUpdatedRefs = targetChainWithClonedCategories

	for (const [sourceUuid, targetUuid] of uuidMap) {
		const { FunctionCatRef: functionCatRefs } = await targetChainWithUpdatedRefs.findDescendants({
			tagName: 'FunctionCatRef',
			attributes: { functionUuid: sourceUuid },
		})

		for (const functionCatRef of functionCatRefs) {
			targetChainWithUpdatedRefs = targetChainWithUpdatedRefs
				.goToElement({ tagName: 'FunctionCatRef', id: functionCatRef.id })
				.update({ attributes: { functionUuid: targetUuid } })
				.goToElement({ tagName: targetChainCurrentFocus.tagName, id: targetChainCurrentFocus.id })
		}
	}

	return targetChainWithUpdatedRefs
}

async function cleanUpLNodeReferences(params: {
	targetChain: Scl.Chain<'SCL'>
}): Promise<Scl.Chain<'SCL'>> {
	const { targetChain } = params

	const { LNode: lnodes } = await targetChain.findDescendants({
		tagName: 'LNode',
	})

	let targetChainWithCleanedReferences = targetChain
	for (const lnode of lnodes) {
		targetChainWithCleanedReferences = targetChainWithCleanedReferences
			.goToElement({ tagName: 'LNode', id: lnode.id })
			.cleanUpReferences({ removeUuidReferences: true })
			.goToElement({ tagName: 'SCL' })
	}

	return targetChainWithCleanedReferences
}

function collectSubFunctionsByName(
	tree: Scl.TreeRecord<'Function'> | Scl.TreeRecord<'SubFunction'>,
	result: Map<string, string> = new Map(),
): Map<string, string> {
	for (const child of tree.tree) {
		const isSubFunction = isRecordOf(child, 'SubFunction')
		if (!isSubFunction) continue
		const uuid = getAttributeValueByName({ attributes: child.attributes, name: 'uuid' })
		const name = getAttributeValueByName({ attributes: child.attributes, name: 'name' })
		if (uuid && name) {
			result.set(name, uuid)
		}
		collectSubFunctionsByName(child, result)
	}
	return result
}

function stripAttributesDeep<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.TreeRecord<GenericElement>
	attributeNames: string[]
}): Scl.TreeRecord<GenericElement> {
	const { record, attributeNames } = params

	return {
		...record,
		attributes: record.attributes.filter((attribute) => !attributeNames.includes(attribute.name)),
		tree: record.tree.map((child) =>
			stripAttributesDeep({ record: child, attributeNames }),
		) as Scl.TreeRecord<GenericElement>['tree'],
	}
}
