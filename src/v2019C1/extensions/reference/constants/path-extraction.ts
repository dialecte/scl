/**
 * Declarative config for path segment extraction per element.
 *
 * Covers all elements that appear as path segment contributors or as UUID
 * reference targets in UUID_REFERENCE_PAIRS.
 */

export type ExtractionStrategy =
	| { type: 'transparent' }
	| { type: 'name'; separator?: '/' | '.' }
	| { type: 'lnClass' }
	| { type: 'attribute'; attr: string; separator: '/' | '.' }
	| SignalStrategy

/**
 * A signal of an LNode (`SourceRef`, `ControlRef`), named among the signals of that LNode: the plain
 * `name` attribute while it is unique among its siblings; once it is not, `name(instance)`, then
 * `.data` when that attribute is set. Its segment therefore depends on its siblings.
 */
export type SignalStrategy = {
	type: 'signal'
	name: string
	instance: string
	data?: string
}

export const PATH_EXTRACTION_CONFIG: Record<string, ExtractionStrategy> = {
	// Transparent - do not contribute a path segment
	AccessPoint: { type: 'transparent' },
	Server: { type: 'transparent' },
	Private: { type: 'transparent' },
	LNodeInputs: { type: 'transparent' },
	LNodeOutputs: { type: 'transparent' },

	// IED section - structural containers
	LDevice: { type: 'attribute', attr: 'inst', separator: '/' },
	IED: { type: 'name' },

	// IED section - logical nodes (targets of lnode resolution)
	LN: { type: 'lnClass' },
	LN0: { type: 'lnClass' },

	// IED section - data instances (dot-separated)
	DOI: { type: 'name', separator: '.' },
	SDI: { type: 'name', separator: '.' },
	DAI: { type: 'name', separator: '.' },

	// IED section - data references
	ExtRef: { type: 'attribute', attr: 'intAddr', separator: '.' },
	ExtCtrl: { type: 'attribute', attr: 'intAddr', separator: '.' },

	// Process section - named path contributors (targets of lnode / ied-address resolution)
	SourceRef: { type: 'signal', name: 'input', instance: 'inputInst', data: 'pDA' },
	ControlRef: { type: 'signal', name: 'output', instance: 'outputInst' },

	// Process section - data specifications (6-100, dot-separated)
	DOS: { type: 'name', separator: '.' },
	DAS: { type: 'name', separator: '.' },
	SDS: { type: 'name', separator: '.' },

	// Process section - targets of direct UUID resolution
	Substation: { type: 'name' },
	VoltageLevel: { type: 'name' },
	Bay: { type: 'name' },
	Line: { type: 'name' },
	ConductingEquipment: { type: 'name' },
	ConnectivityNode: { type: 'name' },
	PowerTransformer: { type: 'name' },
	TransformerWinding: { type: 'name' },
	TapChanger: { type: 'name' },
	GeneralEquipment: { type: 'name' },
	SubEquipment: { type: 'name' },
	LNode: { type: 'lnClass' },
	Function: { type: 'name' },
	SubFunction: { type: 'name' },
	FunctionTemplate: { type: 'name' },
	SubFunctionTemplate: { type: 'name' },
	EqFunction: { type: 'name' },
	EqSubFunction: { type: 'name' },
	Application: { type: 'name' },
	AllocationRole: { type: 'name' },
	BehaviorDescription: { type: 'name' },
	FunctionCategory: { type: 'name' },
	SubCategory: { type: 'name' },
	FunctionalVariant: { type: 'name' },
	FunctionalSubVariant: { type: 'name' },
	FunctionalVariantGroup: { type: 'name' },
	ProcessResource: { type: 'name' },
	PowerSystemRelation: { type: 'name' },
	Variable: { type: 'name' },
	Process: { type: 'name' },
}

/** The tags whose path segment depends on their siblings (`signal` strategy). */
export const SIGNAL_TAG_NAMES: ReadonlySet<string> = new Set(
	Object.entries(PATH_EXTRACTION_CONFIG)
		.filter(([, strategy]) => strategy.type === 'signal')
		.map(([tagName]) => tagName),
)

const LNCLASS_ATTRIBUTES = ['lnClass', 'prefix', 'inst', 'lnInst'] as const

/**
 * All attribute names that contribute to path segments, derived from
 * PATH_EXTRACTION_CONFIG. Use to detect path-affecting changes on ancestors.
 */
export const PATH_CONTRIBUTING_ATTRIBUTES: ReadonlySet<string> = new Set(
	Object.values(PATH_EXTRACTION_CONFIG).flatMap((strategy): string[] => {
		switch (strategy.type) {
			case 'transparent':
				return []
			case 'name':
				return ['name']
			case 'lnClass':
				return [...LNCLASS_ATTRIBUTES]
			case 'attribute':
				return [strategy.attr]
			case 'signal':
				return [strategy.name, strategy.instance, ...(strategy.data ? [strategy.data] : [])]
		}
	}),
)
