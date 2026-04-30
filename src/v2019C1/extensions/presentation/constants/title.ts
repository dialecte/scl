// ── Title field overrides ────────────────────────────────────────────────
// Elements whose display title differs from `identityFields` order or content.
// Each entry defines the ordered attribute names to concatenate.

export const TITLE_FIELDS_OVERRIDE: Partial<Record<string, string[]>> = {
	LNode: ['prefix', 'lnClass', 'lnInst'],
	LN: ['prefix', 'lnClass', 'inst'],
	LN0: ['prefix', 'lnClass', 'inst'],
	LDevice: ['inst'],
	ConnectedAP: ['iedName', 'apName'],
	GSE: ['ldInst', 'cbName'],
	SMV: ['ldInst', 'cbName'],
	Private: ['type'],
	EnumVal: ['ord'],
	Association: ['associationID'],
	ConnectivityNode: ['pathName'],
	ControlRef: ['output', 'outputInst'],
	SourceRef: ['input', 'inputInst'],
	FunctionRoleContent: ['roleInst'],
	Resource: ['resInst'],
	Hitem: ['version', 'revision'],
	History: ['version', 'revision'],
}

export const TITLE_SEPARATORS: Partial<Record<string, string>> = {
	ConnectedAP: ' / ',
	GSE: '/',
	SMV: '/',
	Hitem: '.',
	History: '.',
	ControlRef: '/',
	SourceRef: '/',
}
