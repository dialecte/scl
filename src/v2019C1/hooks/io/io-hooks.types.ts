import type { ImportWarning } from '@dialecte/core'

export type PendingResolution = {
	recordId: string
	elementTag: string
	uuidAttributeName: string
	pathValue: string
	lookupKey: string
	fallbackLookupKey?: string
}

export type UnresolvedReferenceWarning = ImportWarning & {
	type: 'unresolved-reference'
	details: {
		elementTag: string
		uuidAttribute: string
		pathValue: string
		triedKeys: string[]
	}
}

export type UnsupportedXPathWarning = ImportWarning & {
	type: 'unsupported-xpath-reference'
	details: {
		elementTag: string
		pathAttribute: string
		uuidAttribute: string
		pathValue: string
	}
}

export type IncoherentReferenceWarning = ImportWarning & {
	type: 'incoherent-reference'
	details: {
		elementTag: string
		pathAttribute: string
		pathValue: string | undefined
		uuidAttribute: string
		uuidValue: string | undefined
	}
}

/** Every warning the import of an SCL file reports: its `type` is a key of `SCL_IMPORT_WARNINGS`. */
export type SclImportWarning =
	| UnresolvedReferenceWarning
	| UnsupportedXPathWarning
	| IncoherentReferenceWarning
