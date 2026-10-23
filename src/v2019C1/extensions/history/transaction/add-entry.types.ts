import type { Scl } from '@/v2019C1/config'

export type AddEntryParams = {
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
		why: Scl.AttributesValueObjectOf<'Hitem'>['why']
	}
}
