// ── Title-field overrides ────────────────────────────────────────────────
// Elements whose display title differs from `identityFields` order or content.
//
// Spec model:
//   - `compact`: required, used by default.
//   - `full`:    optional, used when caller requests mode='full'.
//   - For both:
//       - `string[]`  -> list of attributes joined by `separator`, empty
//                        values dropped.
//       - `string`    -> template with `{attr}` placeholders. Empty attrs
//                        produce empty substitutions; the renderer collapses
//                        repeated `/` and trims edges so optional attributes
//                        (e.g. ExtRef.srcCBName) render cleanly when absent.
//   - `separator`     -> default '' (concatenation), used with string[].
//   - `fullSeparator` -> defaults to `separator`.
//
// Separator conventions:
//   - `/` path segments inside the same identifier system (IEC reference paths).
//   - `.` data-object/attribute chain (Pos.stVal, pDO.pDA).
//   - `[ix]` array index or instance number used as path qualifier.
//   - (none) concatenation of attributes that form one identifier (PXCBR1).
// We do not use `//` or other ad-hoc group separators; consistent `/` paths
// match IEC 61850 reference syntax.
//
// Elements whose title lives in the XML text body (BayType, IEDName, Val)
// need no override: the resolver falls through to `record.value` when the
// override and identityFields strategies yield nothing.

import type { TitleSpec } from './title.types'

export const TITLE_FIELDS_OVERRIDE: Partial<Record<string, TitleSpec>> = {
	// ── Core SCL ──────────────────────────────────────────────────────
	LNode: {
		compact: ['prefix', 'lnClass', 'lnInst'],
		full: '{iedName}/{ldInst}/{prefix}{lnClass}{lnInst}',
	},
	LN: { compact: ['prefix', 'lnClass', 'inst'] },
	LN0: { compact: ['prefix', 'lnClass', 'inst'] },
	LDevice: { compact: ['inst'] },
	ConnectedAP: { compact: ['iedName', 'apName'], separator: '/' },
	// Full mode (with parent iedName) deferred: would need parent-attribute
	// lookup, which renderTemplate currently does not perform.
	GSE: { compact: ['ldInst', 'cbName'], separator: '/' },
	SMV: { compact: ['ldInst', 'cbName'], separator: '/' },
	Private: { compact: ['type'] },
	EnumVal: { compact: ['ord'] },
	Association: { compact: ['associationID'] },
	ConnectivityNode: { compact: ['pathName'] },
	FunctionRoleContent: { compact: ['roleInst'] },
	Resource: { compact: ['resInst'] },
	Hitem: { compact: ['version', 'revision'], separator: '.' },
	History: { compact: ['version', 'revision'], separator: '.' },

	// ── Composite data-flow (extension namespace) ─────────────────────
	// Brackets denote instance index; slashes denote path segments.
	// Compact prefers the concrete binding (controlled/source), falling back to
	// the pLN.pDO[.pDA] specification hint when the ref is still "open". Full
	// mode shows both hint and binding. `output`/`input` are the mandatory
	// identifiers.
	ControlRef: {
		compact: [
			{ whenPresent: 'controlled', template: '{output}[{outputInst}]/{controlled}' },
			{ template: '{output}[{outputInst}]/{pLN}.{pDO}' },
		],
		full: '{output}[{outputInst}]/{pLN}.{pDO}/{controlled}',
	},
	SourceRef: {
		compact: [
			{ whenPresent: 'source', template: '{service}/{input}[{inputInst}]/{source}' },
			{ template: '{service}/{input}[{inputInst}]/{pLN}.{pDO}.{pDA}' },
		],
		full: '{service}/{input}[{inputInst}]/{pLN}.{pDO}.{pDA}/{source}',
	},

	// ── simple *Ref (single attribute) ──────────────────────────
	FunctionCatRef: { compact: ['function'] },
	FunctionRef: { compact: ['function'] },
	AllocationRoleRef: { compact: ['allocationRole'] },
	PowerSystemRelationRef: { compact: ['powerSystemRelation'] },
	BehaviorDescriptionRef: { compact: ['behaviorDescription'] },
	ProcessResourceRef: { compact: ['processResource'] },
	LNodeDataRef: { compact: ['data'] },
	FunctionCategoryRef: { compact: ['functionCategory'] },
	LNodeInputRef: { compact: ['sourceRef'] },
	LNodeOutputRef: { compact: ['controlRef'] },

	// ── composite *Ref ──────────────────────────────────────────
	// fileUuid is hostile to read; reserve it for full mode (or tooltips).
	// Attributes live on the child SclFileReference, not the element itself.
	ApplicationSclRef: {
		compact: '{fileType} v{version}.{revision}',
		full: '{fileUuid}/{fileType} v{version}.{revision}',
		attributesFrom: 'SclFileReference',
	},

	// ── 90-30 LNode-family extensions ─────────────────────────────────
	LNodeSpecNaming: {
		compact: '{sIedName}/{sLdInst}/{sPrefix}{sLnClass}{sLnInst}',
	},
	// pLN alone is ambiguous (many subscribers may share an LN class); the
	// (service) suffix qualifies it.
	SubscriberLNode: {
		compact: '{pLN}({service})',
		full: '{resourceName}/{inputName}/{pLN}({service})',
	},
	ControllingLNode: {
		compact: ['pLN'],
		full: '{resourceName}/{pLN}',
	},

	// ── 90-30 data-flow variables ─────────────────────────────────────
	// Colon separator keeps the string trivially splittable for tooling.
	InputVar: { compact: '{varName}:{inputName}' },
	OutputVar: { compact: '{varName}:{outputName}' },

	// ── Core SCL gaps ─────────────────────────────────────────────────
	// ExtRef: srcCBName (subscribed GOOSE/SMV) appended when present;
	// renderer collapses the trailing `/` when absent.
	// FCDA: [fc] is critical disambiguation between identical paths in
	// different functional constraints (e.g. Pos.stVal under ST vs MX) and
	// stays in compact mode. `ix` (array index) appended in full.
	ExtRef: {
		compact: '{iedName}/{ldInst}/{prefix}{lnClass}{lnInst}.{doName}.{daName}/{srcCBName}',
		full: '{pServT}/{intAddr}/{pLN}.{pDO}.{pDA}/{iedName}/{ldInst}/{prefix}{lnClass}{lnInst}.{doName}.{daName}/{srcCBName}',
	},
	FCDA: {
		compact: '{ldInst}/{prefix}{lnClass}{lnInst}.{doName}.{daName}[{fc}]',
		full: '{ldInst}/{prefix}{lnClass}{lnInst}.{doName}.{daName}[{fc}][{ix}]',
	},
}
