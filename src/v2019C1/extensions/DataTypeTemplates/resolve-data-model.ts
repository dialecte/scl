import type { Scl } from '@/v2019C1/config'

export function resolveDataModel(params: Scl.MethodsParams<'DataTypeTemplates'>) {
	const { chain, contextPromise } = params

	return async function (params: { lnTypes: string[] }): Promise<{
		LNodeType: Scl.TreeRecord<'LNodeType'>[]
		DOType: Scl.TreeRecord<'DOType'>[]
		DAType: Scl.TreeRecord<'DAType'>[]
		EnumType: Scl.TreeRecord<'EnumType'>[]
	}> {
		const { lnTypes } = params

		const dataModelMap = {
			lnodeTypes: new Map<string, Scl.TreeRecord<'LNodeType'>>(),
			doTypes: new Map<string, Scl.TreeRecord<'DOType'>>(),
			daTypes: new Map<string, Scl.TreeRecord<'DAType'>>(),
			enumTypes: new Map<string, Scl.TreeRecord<'EnumType'>>(),
		}

		const context = await contextPromise
		const dataTypeTemplatesChain = chain({
			contextPromise: Promise.resolve(context),
		})

		const addIfNew = (
			map: Map<string, Scl.TreeRecord<any>>,
			id: string,
			record: Scl.TreeRecord<any>,
		) => {
			if (!map.has(id)) {
				map.set(id, record)
				return true
			}

			return false
		}

		const resolveDataAttributes = async (
			parentRecord: Scl.TreeRecord<'DOType'> | Scl.TreeRecord<'DAType'>,
		): Promise<void> => {
			const childTagName = parentRecord.tagName === 'DOType' ? 'DA' : 'BDA'

			for (const child of parentRecord.tree) {
				if (child.tagName !== childTagName) continue

				const { type: typeId, bType } = await dataTypeTemplatesChain
					.goToElement({ tagName: childTagName, id: child.id })
					.getAttributesValues()

				if (!typeId) continue

				if (bType === 'Enum') {
					const enumTypeTree = await dataTypeTemplatesChain.getTree({
						include: {
							tagName: 'EnumType',
							attributes: { id: typeId },
						},
					})
					const currentEnumType = enumTypeTree.tree[0]
					addIfNew(dataModelMap.enumTypes, typeId, currentEnumType)
				} else {
					const daTypeTree = await dataTypeTemplatesChain.getTree({
						include: {
							tagName: 'DAType',
							attributes: { id: typeId },
						},
					})
					const currentDAType = daTypeTree.tree[0] as Scl.TreeRecord<'DAType'>

					if (addIfNew(dataModelMap.daTypes, typeId, currentDAType)) {
						// Recurse into nested DAType
						await resolveDataAttributes(currentDAType)
					}
				}
			}
		}

		for (const lnType of lnTypes) {
			const dataTypeTemplateTree = await dataTypeTemplatesChain.getTree({
				include: {
					tagName: 'LNodeType',
					attributes: { id: lnType },
					children: [
						{
							tagName: 'DO',
						},
					],
				},
			})

			const currentLNodeType = dataTypeTemplateTree.tree[0] as Scl.TreeRecord<'LNodeType'>

			const isNewLNodeType = addIfNew(dataModelMap.lnodeTypes, lnType, currentLNodeType)
			if (!isNewLNodeType) continue

			for (const doElement of currentLNodeType.tree) {
				const { type: doTypeId } = await dataTypeTemplatesChain
					.goToElement({ tagName: 'DO', id: doElement.id })
					.getAttributesValues()

				if (!doTypeId) continue

				const doTypeTree = await dataTypeTemplatesChain.getTree({
					include: {
						tagName: 'DOType',
						attributes: { id: doTypeId },
					},
				})
				const currentDoType = doTypeTree.tree[0] as Scl.TreeRecord<'DOType'>

				if (addIfNew(dataModelMap.doTypes, doTypeId, currentDoType)) {
					// DOType and nested DAType can reference DAType, so we need to resolve them recursively
					await resolveDataAttributes(currentDoType)
				}
			}
		}

		return {
			LNodeType: Array.from(dataModelMap.lnodeTypes.values()),
			DOType: Array.from(dataModelMap.doTypes.values()),
			DAType: Array.from(dataModelMap.daTypes.values()),
			EnumType: Array.from(dataModelMap.enumTypes.values()),
		}
	}
}
