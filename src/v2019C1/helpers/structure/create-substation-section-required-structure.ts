import type { Scl } from '@/v2019C1/config'
import type { Chain } from '@dialecte/core'

export async function getOrCreateSubstationSectionRequiredStructure<
	GenericLevel extends 'SCL' | 'Substation' | 'VoltageLevel' | 'Bay',
>(params: {
	chain: Chain<Scl.Config, 'SCL'>
	focusLevel: GenericLevel
	names?: {
		substation?: string
		voltageLevel?: string
		bay?: string
	}
}): Promise<{
	chain: Chain<Scl.Config, GenericLevel>
	substationId: string
	voltageLevelId: string
	bayId: string
}> {
	const { chain, focusLevel, names = {} } = params
	const { substation: substationName, voltageLevel: voltageLevelName, bay: bayName } = names

	const sclChain = chain.goToElement({ tagName: 'SCL' })

	// Find existing Substation
	const { Substation: substations = [] } = await sclChain.findDescendants({
		tagName: 'Substation',
		attributes: { name: substationName || undefined },
	})

	// Create or navigate to Substation
	let substationChain: Chain<Scl.Config, 'Substation'>
	let substationId
	if (!substations?.[0]) {
		substationId = crypto.randomUUID()
		substationChain = sclChain.addChild({
			id: substationId,
			tagName: 'Substation',
			attributes: [{ name: 'name', value: substationName || 'TEMPLATE' }],
			setFocus: true,
		})
	} else {
		substationId = substations[0].id
		substationChain = sclChain.goToElement({ tagName: 'Substation', id: substationId })
	}

	// Find existing VoltageLevel
	const { VoltageLevel: voltageLevels = [] } = await substationChain.findDescendants({
		tagName: 'VoltageLevel',
		attributes: { name: voltageLevelName || undefined },
	})

	// Create or navigate to VoltageLevel
	let voltageLevelChain: Chain<Scl.Config, 'VoltageLevel'>
	let voltageLevelId
	if (!voltageLevels?.[0]) {
		voltageLevelId = crypto.randomUUID()
		voltageLevelChain = substationChain.addChild({
			id: voltageLevelId,
			tagName: 'VoltageLevel',
			attributes: [{ name: 'name', value: voltageLevelName || 'TEMPLATE' }],
			setFocus: true,
		})
	} else {
		voltageLevelId = voltageLevels[0].id
		voltageLevelChain = substationChain.goToElement({
			tagName: 'VoltageLevel',
			id: voltageLevelId,
		})
	}

	// Find existing Bay
	const { Bay: bays = [] } = await voltageLevelChain.findDescendants({
		tagName: 'Bay',
		attributes: { name: bayName || undefined },
	})

	// Create or navigate to Bay
	let bayChain: Chain<Scl.Config, 'Bay'>
	let bayId
	if (!bays?.[0]) {
		bayId = crypto.randomUUID()
		bayChain = voltageLevelChain.addChild({
			id: bayId,
			tagName: 'Bay',
			attributes: [{ name: 'name', value: bayName || 'TEMPLATE' }],
			setFocus: true,
		})
	} else {
		bayId = bays[0].id
		bayChain = voltageLevelChain.goToElement({
			tagName: 'Bay',
			id: bayId,
		})
	}

	let returnedChain: Chain<Scl.Config, GenericLevel> = bayChain as unknown as Chain<
		Scl.Config,
		GenericLevel
	>

	if (focusLevel === 'VoltageLevel') {
		returnedChain = bayChain.goToParent() as unknown as Chain<Scl.Config, GenericLevel>
	}
	if (focusLevel === 'Substation') {
		returnedChain = bayChain.goToParent().goToParent() as unknown as Chain<Scl.Config, GenericLevel>
	}
	if (focusLevel === 'SCL') {
		returnedChain = bayChain.goToParent().goToParent().goToParent() as unknown as Chain<
			Scl.Config,
			GenericLevel
		>
	}

	return {
		chain: returnedChain,
		substationId,
		voltageLevelId,
		bayId,
	}
}
