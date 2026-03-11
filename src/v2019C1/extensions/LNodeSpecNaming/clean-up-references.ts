// import type { Scl } from '@/v2019C1/config'

// export function cleanUpReferences(params: Scl.MethodsParams<'LNodeSpecNaming'>) {
// 	const { chain, contextPromise } = params

// 	return function () {
// 		const newContextPromise = contextPromise.then(async (context) => {
// 			const sourceChain = chain({
// 				contextPromise: Promise.resolve(context),
// 			})

// 			sourceChain.update({
// 				attributes: {
// 					sIedName: 'None',
// 					sLdInst: undefined,
// 				},
// 			})

// 			return sourceChain.getContext()
// 		})

// 		return chain({
// 			contextPromise: newContextPromise,
// 		})
// 	}
// }
