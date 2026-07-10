import { Scl } from '@/v2019C1/config'

export type TemplateStructure = {
	Substation: Scl.RawRecord<'Substation'>
	VoltageLevel: Scl.RawRecord<'VoltageLevel'>
	Bay: Scl.RawRecord<'Bay'>
}

/**
 * A structure resolved from an *existing* target (instantiation direction). Which
 * levels are present depends on the instantiation parent, so every level is
 * optional (unlike the always-complete TEMPLATE {@link TemplateStructure}).
 */
export type TargetStructure = Partial<TemplateStructure>
