import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function ensureSubstationTemplateStructure(tx: Core.Transaction<Config>): Promise<{
	Substation: Scl.RawRecord<'Substation'>
	VoltageLevel: Scl.RawRecord<'VoltageLevel'>
	Bay: Scl.RawRecord<'Bay'>
}> {
	const root = await tx.getRoot()

	const substation = await tx.ensureChild(root, {
		tagName: 'Substation',
		attributes: { name: 'TEMPLATE' },
	})

	const voltageLevel = await tx.ensureChild(substation, {
		tagName: 'VoltageLevel',
		attributes: { name: 'TEMPLATE' },
	})

	const bay = await tx.ensureChild(voltageLevel, {
		tagName: 'Bay',
		attributes: { name: 'TEMPLATE' },
	})

	return {
		Substation: substation,
		VoltageLevel: voltageLevel,
		Bay: bay,
	}
}
