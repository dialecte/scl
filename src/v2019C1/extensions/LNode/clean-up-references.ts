// import { assert } from '@dialecte/core/utils'

// import type { Scl } from '@/v2019C1/config'

// export function cleanUpReferences(params: Scl.MethodsParams<'LNode'>) {
// 	const { chain, contextPromise } = params

// 	return function (params: { removeUuidReferences: boolean }) {
// 		const { removeUuidReferences } = params

// 		const newContextPromise = contextPromise.then(async (context) => {
// 			const sourceChain = chain({
// 				contextPromise: Promise.resolve(context),
// 			})

// 			const { LNodeSpecNaming: lnodeSpecNamings } = await sourceChain.findChildren({
// 				LNodeSpecNaming: {},
// 			})

// 			let updatedLNodeChain = sourceChain
// 			if (lnodeSpecNamings.length) {
// 				assert(lnodeSpecNamings?.length === 1, 'There should be only one LNodeSpecNaming')

// 				const lnodeSpecNamingChain = updatedLNodeChain.goToElement({
// 					tagName: 'LNodeSpecNaming',
// 					id: lnodeSpecNamings[0].id,
// 				})
// 				const {
// 					sLnClass: lnClassValue,
// 					sLnInst: lnInstValue,
// 					sPrefix: prefixValue,
// 				} = await lnodeSpecNamingChain.getAttributesValues()

// 				updatedLNodeChain = lnodeSpecNamingChain.cleanUpReferences().goToParent('LNode')

// 				updatedLNodeChain = updatedLNodeChain.update({
// 					attributes: {
// 						iedName: 'None',
// 						ldInst: undefined,
// 						lnUuid: undefined,
// 						lnClass: lnClassValue,
// 						lnInst: lnInstValue,
// 						prefix: prefixValue,
// 						...(removeUuidReferences && { templateUuid: undefined }),
// 					},
// 				})
// 			} else {
// 				updatedLNodeChain = sourceChain.update({
// 					attributes: {
// 						iedName: 'None',
// 						ldInst: undefined,
// 						lnUuid: undefined,
// 						lnClass: undefined,
// 						lnInst: undefined,
// 						prefix: undefined,
// 						...(removeUuidReferences && { templateUuid: undefined }),
// 					},
// 				})
// 			}

// 			return updatedLNodeChain.getContext()
// 		})

// 		return chain({
// 			contextPromise: newContextPromise,
// 		})
// 	}
// }
