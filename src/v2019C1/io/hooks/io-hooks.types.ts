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
