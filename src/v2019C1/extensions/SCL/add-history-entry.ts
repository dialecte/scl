import { getAttributesValuesByName } from '@dialecte/core'

import type { Scl } from '@/v2019C1/config'
import type { ExtensionsMethodParams, Chain } from '@dialecte/core'

export function addEntryToHistory(params: ExtensionsMethodParams<Scl.Config, 'SCL'>) {
	const { chain, contextPromise, dialecteConfig } = params

	return function (params: {
		filename: string
		header: {
			id?: string
			fileType: Scl.AttributesValueObjectOf<'Header'>['fileType']
			nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
			version: 'keep' | 'increment'
			tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		}
		item: {
			who: Scl.AttributesValueObjectOf<'Hitem'>['who']
			what: Scl.AttributesValueObjectOf<'Hitem'>['what']
		}
	}) {
		const { filename, header, item } = params
		const { id, fileType, nameStructure, version, tool } = header
		const { who, what } = item

		const newContextPromise = contextPromise.then(async (context) => {
			const initialChain = chain({
				contextPromise: Promise.resolve(context),
			})

			const { Header: headers } = await initialChain.findDescendants({
				tagName: 'Header',
			})

			let headerChain: Chain<Scl.Config, 'Header'>
			if (!headers.length) {
				headerChain = initialChain.addChild({
					tagName: 'Header',
					attributes: {
						id:
							id ??
							filename
								.replace(/\.[^.]+$/, '')
								.toLowerCase()
								.replace(/\s+/g, '_'),
						toolID: tool,
						nameStructure:
							nameStructure ??
							(dialecteConfig.definition['Header'].attributes.details['nameStructure'].default ||
								''),
						fileType,
						version: '0',
						revision: '1',
						uuid: crypto.randomUUID(),
					},
					setFocus: true,
				})
			} else headerChain = initialChain.goToElement({ tagName: 'Header' })

			const { History: histories } = await headerChain.findDescendants({
				tagName: 'History',
			})

			const historyId = (histories[0]?.id ||
				crypto.randomUUID()) as `${string}-${string}-${string}-${string}-${string}`

			let historyChain: Chain<Scl.Config, 'History'>
			if (!histories.length) {
				historyChain = headerChain.addChild({
					id: historyId,
					tagName: 'History',
					attributes: {},
					setFocus: true,
				})
			} else historyChain = headerChain.goToElement({ tagName: 'History', id: histories[0].id })

			console.log('historyChain:', historyChain)
			console.log('sclChain:', initialChain)
			const lastHitem = await historyChain.getLatestHitem()
			const { version: lastHitemVersion, revision: lastHitemRevision } = lastHitem
				? getAttributesValuesByName({ attributes: lastHitem.attributes })
				: {}

			const computedVersion = {
				keep: lastHitemVersion ?? '0',
				increment: lastHitemVersion ? String(Number(lastHitemVersion) + 1) : '0',
			}[version]

			const computedRevision = lastHitemRevision ? String(Number(lastHitemRevision) + 1) : '1'

			const date = new Date()
			const parts = date.toString().split(' ')
			const timezone = date.toLocaleString('en', { timeZoneName: 'short' }).split(' ').pop()
			const formattedWhen = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[4]} ${timezone} ${parts[3]}`

			const endingChain = historyChain
				.goToElement({ tagName: 'History', id: historyId })
				.update({ attributes: { version: computedVersion, revision: computedRevision } })
				.addChild({
					tagName: 'Hitem',
					attributes: {
						when: formattedWhen,
						who,
						what,
						version: computedVersion,
						revision: computedRevision,
					},
				})
				.goToElement({ tagName: 'SCL' })

			return await endingChain.getContext()
		})

		return chain({ contextPromise: newContextPromise })
	}
}
