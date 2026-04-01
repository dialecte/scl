import type { Scl } from '@/v2019C1/config'

export async function ensureSubstationTemplateStructure(tx: Scl.Transaction): Promise<{
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
