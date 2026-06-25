import { Scl } from '@/v2019C1/config'

export type TemplateStructure = {
	Substation: Scl.RawRecord<'Substation'>
	VoltageLevel: Scl.RawRecord<'VoltageLevel'>
	Bay: Scl.RawRecord<'Bay'>
}
