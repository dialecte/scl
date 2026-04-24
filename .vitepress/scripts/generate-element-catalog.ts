/**
 * Generates doc/v2019C1/api/elements.md from the definition source-of-truth.
 *
 * Run:  npx tsx scripts/generate-element-catalog.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ELEMENT_NAMES, CHILDREN, PARENTS, DEFINITION } from '../../src/v2019C1/definition/index'

const GITHUB_BASE = 'https://github.com/dialecte/scl/blob/main/src/v2019C1/definition'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Def = (typeof DEFINITION)[keyof typeof DEFINITION]

function requiredAttrs(def: Def): string[] {
	return Object.entries(def.attributes.details)
		.filter(([, v]) => (v as Record<string, unknown>).required)
		.map(([k]) => k)
}

function optionalAttrs(def: Def): string[] {
	return Object.entries(def.attributes.details)
		.filter(([, v]) => !(v as Record<string, unknown>).required)
		.map(([k]) => k)
}

function documentation(def: Def): string | undefined {
	return (def as Record<string, unknown>).documentation as string | undefined
}

function namespace(def: Def): string {
	if (def.namespace.prefix) return def.namespace.prefix
	return 'scl'
}

// ---------------------------------------------------------------------------
// Domain grouping
// ---------------------------------------------------------------------------

interface DomainGroup {
	title: string
	description: string
	elements: string[]
}

function classifyElement(el: string): string {
	const parents = (PARENTS as Record<string, readonly string[]>)[el] ?? []
	const allAncestors = new Set<string>()
	const stack = [...parents]
	while (stack.length > 0) {
		const p = stack.pop()!
		if (allAncestors.has(p)) continue
		allAncestors.add(p)
		const gp = (PARENTS as Record<string, readonly string[]>)[p] ?? []
		stack.push(...gp)
	}

	if (
		el === 'SCL' ||
		el === 'Header' ||
		el === 'History' ||
		el === 'Hitem' ||
		el === 'Text' ||
		el === 'Private'
	)
		return 'Document'
	if (
		el === 'DataTypeTemplates' ||
		allAncestors.has('DataTypeTemplates') ||
		parents.includes('DataTypeTemplates')
	)
		return 'DataTypeTemplates'
	if (
		el === 'Communication' ||
		allAncestors.has('Communication') ||
		parents.includes('Communication')
	)
		return 'Communication'
	if (el === 'Services' || allAncestors.has('Services') || parents.includes('Services'))
		return 'Services'
	if (
		el === 'Substation' ||
		el === 'VoltageLevel' ||
		el === 'Bay' ||
		el === 'Line' ||
		el === 'Process'
	)
		return 'Substation'
	if (allAncestors.has('Substation') || allAncestors.has('VoltageLevel') || allAncestors.has('Bay'))
		return 'Substation'
	if (el === 'IED' || allAncestors.has('IED') || parents.includes('IED')) return 'IED'
	if (allAncestors.has('Line') || allAncestors.has('Process')) return 'Substation'
	return 'Other'
}

function buildDomainGroups(): DomainGroup[] {
	const groupMap: Record<string, string[]> = {}
	for (const el of ELEMENT_NAMES) {
		const group = classifyElement(el)
		;(groupMap[group] ??= []).push(el)
	}

	const order = [
		'Document',
		'Substation',
		'IED',
		'Communication',
		'DataTypeTemplates',
		'Services',
		'Other',
	]
	const descriptions: Record<string, string> = {
		Document: 'Root document elements, header, history, and common children.',
		Substation:
			'Substation topology: substations, voltage levels, bays, equipment, functions, and process model.',
		IED: 'IED configuration: access points, servers, logical devices, logical nodes, data sets, and control blocks.',
		Communication: 'Communication network: sub-networks, connected access points, addressing.',
		DataTypeTemplates:
			'Data type templates: LNodeType, DOType, DAType, EnumType and their children.',
		Services: 'IED service capabilities and settings.',
		Other: 'Elements that span multiple domains or are not classified above.',
	}

	return order
		.filter((g) => groupMap[g]?.length)
		.map((g) => ({
			title: g,
			description: descriptions[g] ?? '',
			elements: groupMap[g].sort(),
		}))
}

// ---------------------------------------------------------------------------
// Mermaid diagrams - fully data-driven from CHILDREN/PARENTS/DEFINITION
// ---------------------------------------------------------------------------

/** Style definition for a category of nodes in a diagram. */
interface CategoryStyle {
	fill: string
	stroke: string
	color: string
	edgeColor: string
	label: string
}

/** Configuration for a single mermaid diagram. */
interface DiagramConfig {
	title: string
	categories: Record<string, CategoryStyle>
	/** Assign each element to a category. Unlisted elements are excluded. */
	elementCategory: Record<string, string>
	/** Elements excluded from edges (too many parents). Noted textually. */
	sharedChildren?: string[]
	note?: string
	/** Dashed reference edges (source -> target). */
	referenceEdges?: Record<string, string>
}

const DIAGRAMS: DiagramConfig[] = [
	{
		title: 'Substation hierarchy',
		categories: {
			root: {
				fill: '#4a6fa5',
				stroke: '#2d4a7a',
				color: '#fff',
				edgeColor: '#8aadd4',
				label: 'root',
			},
			topo: {
				fill: '#5b9bd5',
				stroke: '#3a7cc0',
				color: '#fff',
				edgeColor: '#9dcaec',
				label: 'topology containers',
			},
			equip: {
				fill: '#70ad47',
				stroke: '#4e8830',
				color: '#fff',
				edgeColor: '#a3cf82',
				label: 'primary equipment',
			},
			func: {
				fill: '#ed7d31',
				stroke: '#c65d1a',
				color: '#fff',
				edgeColor: '#f4aa74',
				label: 'functional model',
			},
		},
		elementCategory: {
			SCL: 'root',
			Substation: 'topo',
			VoltageLevel: 'topo',
			Bay: 'topo',
			Line: 'topo',
			Process: 'topo',
			PowerTransformer: 'equip',
			TransformerWinding: 'equip',
			ConductingEquipment: 'equip',
			GeneralEquipment: 'equip',
			SubEquipment: 'equip',
			TapChanger: 'equip',
			NeutralPoint: 'equip',
			ConnectivityNode: 'equip',
			Terminal: 'equip',
			Function: 'func',
			SubFunction: 'func',
			EqFunction: 'func',
			EqSubFunction: 'func',
		},
		sharedChildren: ['LNode', 'Text', 'Private', 'Labels', 'GeneralEquipment'],
		note: '**Shared children not shown:** `LNode` and `GeneralEquipment` can appear under almost every topology container and equipment element. See the element table below for full parent lists.',
	},
	{
		title: 'IED / Server stack',
		categories: {
			root: {
				fill: '#4a6fa5',
				stroke: '#2d4a7a',
				color: '#fff',
				edgeColor: '#8aadd4',
				label: 'IED root',
			},
			srv: {
				fill: '#5b9bd5',
				stroke: '#3a7cc0',
				color: '#fff',
				edgeColor: '#9dcaec',
				label: 'server path',
			},
			ln: {
				fill: '#70ad47',
				stroke: '#4e8830',
				color: '#fff',
				edgeColor: '#a3cf82',
				label: 'logical nodes',
			},
			ctrl: {
				fill: '#ed7d31',
				stroke: '#c65d1a',
				color: '#fff',
				edgeColor: '#f4aa74',
				label: 'control blocks',
			},
			data: {
				fill: '#ffc000',
				stroke: '#d4a000',
				color: '#333',
				edgeColor: '#ffd966',
				label: 'data model',
			},
			io: {
				fill: '#7f7f7f',
				stroke: '#5a5a5a',
				color: '#fff',
				edgeColor: '#b3b3b3',
				label: 'inputs/outputs',
			},
		},
		elementCategory: {
			IED: 'root',
			AccessPoint: 'srv',
			Server: 'srv',
			ServerAt: 'srv',
			LDevice: 'srv',
			LN0: 'ln',
			LN: 'ln',
			ReportControl: 'ctrl',
			LogControl: 'ctrl',
			GSEControl: 'ctrl',
			SampledValueControl: 'ctrl',
			SettingControl: 'ctrl',
			DataSet: 'data',
			FCDA: 'data',
			DOI: 'data',
			SDI: 'data',
			DAI: 'data',
			Inputs: 'io',
			ExtRef: 'io',
			Outputs: 'io',
			Log: 'io',
		},
		sharedChildren: ['Text', 'Private', 'Labels'],
	},
	{
		title: 'Communication network',
		categories: {
			root: {
				fill: '#4a6fa5',
				stroke: '#2d4a7a',
				color: '#fff',
				edgeColor: '#8aadd4',
				label: 'root',
			},
			net: {
				fill: '#5b9bd5',
				stroke: '#3a7cc0',
				color: '#fff',
				edgeColor: '#9dcaec',
				label: 'network',
			},
			proto: {
				fill: '#70ad47',
				stroke: '#4e8830',
				color: '#fff',
				edgeColor: '#a3cf82',
				label: 'protocol',
			},
			addr: {
				fill: '#ffc000',
				stroke: '#d4a000',
				color: '#333',
				edgeColor: '#ffd966',
				label: 'addressing',
			},
		},
		elementCategory: {
			Communication: 'root',
			SubNetwork: 'net',
			ConnectedAP: 'net',
			BitRate: 'net',
			GSE: 'proto',
			SMV: 'proto',
			PhysConn: 'proto',
			Address: 'addr',
			P: 'addr',
		},
		sharedChildren: ['Text', 'Private'],
	},
	{
		title: 'Data type templates',
		categories: {
			root: {
				fill: '#4a6fa5',
				stroke: '#2d4a7a',
				color: '#fff',
				edgeColor: '#8aadd4',
				label: 'root',
			},
			type: {
				fill: '#5b9bd5',
				stroke: '#3a7cc0',
				color: '#fff',
				edgeColor: '#9dcaec',
				label: 'type definitions',
			},
			member: {
				fill: '#70ad47',
				stroke: '#4e8830',
				color: '#fff',
				edgeColor: '#a3cf82',
				label: 'type members',
			},
			leaf: {
				fill: '#ffc000',
				stroke: '#d4a000',
				color: '#333',
				edgeColor: '#ffd966',
				label: 'leaf values',
			},
		},
		elementCategory: {
			DataTypeTemplates: 'root',
			LNodeType: 'type',
			DOType: 'type',
			DAType: 'type',
			EnumType: 'type',
			DO: 'member',
			SDO: 'member',
			DA: 'member',
			BDA: 'member',
			EnumVal: 'leaf',
			Val: 'leaf',
			ProtNs: 'leaf',
		},
		sharedChildren: ['Text', 'Private', 'Labels'],
		referenceEdges: { DO: 'DOType', SDO: 'DOType', DA: 'DAType', BDA: 'DAType' },
		note: 'dashed = type reference (DO.type attribute points to a DOType.id)',
	},
]

// ---- Generic diagram builder -----------------------------------------------

interface Edge {
	from: string
	to: string
	isDashed: boolean
	label?: string
	category: string
}

function buildDiagramEdges(config: DiagramConfig): Edge[] {
	const elements = new Set(Object.keys(config.elementCategory))
	const shared = new Set(config.sharedChildren ?? [])
	const edges: Edge[] = []

	for (const el of Object.keys(config.elementCategory)) {
		if (shared.has(el)) continue
		const children = (CHILDREN as Record<string, readonly string[]>)[el] ?? []
		for (const child of children) {
			if (!elements.has(child) || shared.has(child)) continue
			edges.push({
				from: el,
				to: child,
				isDashed: el === child,
				category: config.elementCategory[el],
			})
		}
	}

	if (config.referenceEdges) {
		for (const [from, to] of Object.entries(config.referenceEdges)) {
			if (elements.has(from) && elements.has(to)) {
				edges.push({
					from,
					to,
					isDashed: true,
					label: 'ref',
					category: config.elementCategory[from],
				})
			}
		}
	}

	return edges
}

function buildMermaidDiagram(config: DiagramConfig): string {
	const edges = buildDiagramEdges(config)
	const lines: string[] = []

	lines.push(
		`%%{ init: { "flowchart": { "curve": "linear", "rankSpacing": 40, "nodeSpacing": 25 } } }%%`,
	)
	lines.push(`flowchart TD`)

	for (const [cat, style] of Object.entries(config.categories)) {
		lines.push(
			`  classDef ${cat} fill:${style.fill},stroke:${style.stroke},color:${style.color},rx:8`,
		)
	}
	lines.push('')

	const shared = new Set(config.sharedChildren ?? [])
	for (const [el, cat] of Object.entries(config.elementCategory)) {
		if (shared.has(el)) continue
		lines.push(`  ${el}:::${cat}`)
	}
	lines.push('')

	// Group edges by (source, isDashed, label) to use & fan-out syntax
	const groupKey = (e: Edge) => `${e.from}|${e.isDashed}|${e.label ?? ''}`
	const edgeGroups = new Map<string, Edge[]>()
	for (const edge of edges) {
		const key = groupKey(edge)
		const group = edgeGroups.get(key)
		if (group) group.push(edge)
		else edgeGroups.set(key, [edge])
	}

	// Emit edges, track indices for linkStyle
	const edgeIndices: { index: number; category: string }[] = []
	let idx = 0

	for (const group of edgeGroups.values()) {
		const first = group[0]
		const targets = group.map((e) => e.to)
		const arrow = first.isDashed ? (first.label ? `-. "${first.label}" .->` : '-.->') : '-->'

		lines.push(`  ${first.from} ${arrow} ${targets.join(' & ')}`)
		for (const _ of targets) {
			edgeIndices.push({ index: idx++, category: first.category })
		}
	}

	// linkStyle grouped by edge color
	const byColor = new Map<string, number[]>()
	for (const { index, category } of edgeIndices) {
		const color = config.categories[category]?.edgeColor ?? '#999'
		const arr = byColor.get(color)
		if (arr) arr.push(index)
		else byColor.set(color, [index])
	}

	lines.push('')
	for (const [color, indices] of byColor) {
		lines.push(`  linkStyle ${indices.join(',')} stroke:${color},stroke-width:2px`)
	}

	// Legend
	const legendParts = Object.values(config.categories).map(
		(s) => `<span style="color:${s.fill}">**${s.label}**</span>`,
	)
	legendParts.push('dashed = recursive/reference')
	legendParts.push('edge color matches parent category')

	let block = `### ${config.title}\n\n\`\`\`mermaid\n${lines.join('\n')}\n\`\`\`\n\n> ${legendParts.join(' - ')}`

	if (config.note) block += `\n>\n> ${config.note}`

	return block
}

// ---------------------------------------------------------------------------
// Catalog JSON data (consumed by ElementCatalog.vue)
// ---------------------------------------------------------------------------

function buildCatalogData() {
	const groups = buildDomainGroups()
	const elementsData: Record<string, unknown> = {}

	for (const el of ELEMENT_NAMES) {
		const def = (DEFINITION as Record<string, Def>)[el]
		if (!def) continue
		const parents = (PARENTS as Record<string, readonly string[]>)[el] ?? []
		const children = (CHILDREN as Record<string, readonly string[]>)[el] ?? []
		const attrs = def.attributes.details as Record<string, Record<string, unknown>>

		const attrDetails: Record<string, unknown> = {}
		for (const [attrName, detail] of Object.entries(attrs)) {
			attrDetails[attrName] = {
				required: !!detail.required,
				default: detail.default != null ? String(detail.default) : null,
				facets: detail.facets || null,
			}
		}

		elementsData[el] = {
			ns: namespace(def),
			parents: [...parents],
			children: [...children],
			requiredAttrs: requiredAttrs(def),
			optionalAttrs: optionalAttrs(def),
			documentation: documentation(def) || null,
			attributes: attrDetails,
		}
	}

	return {
		totalElements: ELEMENT_NAMES.length,
		githubBase: GITHUB_BASE,
		groups: groups.map((g) => ({
			title: g.title,
			description: g.description,
			elements: g.elements,
		})),
		elements: elementsData,
	}
}

// ---------------------------------------------------------------------------
// Markdown generation
// ---------------------------------------------------------------------------

function generateMarkdown(): string {
	const totalElements = ELEMENT_NAMES.length
	const parts: string[] = []

	// Front matter
	parts.push(`---
description: Element catalog for @dialecte/scl v2019C1 - all ${totalElements} SCL elements with parents, children, and attributes.
---

# Element Catalog

<!-- Auto-generated by scripts/generate-element-catalog.ts - do not edit -->

This page lists every SCL element recognized by \`@dialecte/scl/v2019C1\` (**${totalElements} elements**).

Source of truth: [\`definition.generated.ts\`](${GITHUB_BASE}/definition.generated.ts) | [\`constants.generated.ts\`](${GITHUB_BASE}/constants.generated.ts) | [\`types.generated.ts\`](${GITHUB_BASE}/types.generated.ts)

Regenerate: \`npx tsx scripts/generate-element-catalog.ts\`
`)

	// Schema overview - mermaid diagrams
	parts.push(`## Schema overview\n`)
	for (const diagram of DIAGRAMS) {
		parts.push(buildMermaidDiagram(diagram))
		parts.push('')
	}

	// Interactive element reference + attribute details (Vue component)
	parts.push(`<ElementCatalog />\n`)

	return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Write JSON data for the Vue component
const catalogData = buildCatalogData()
const dataDir = resolve(import.meta.dirname!, '../data')
mkdirSync(dataDir, { recursive: true })
const jsonPath = resolve(dataDir, 'elements-catalog.json')
writeFileSync(jsonPath, JSON.stringify(catalogData), 'utf-8')
console.log(`Wrote ${jsonPath}`)

// Write markdown page
const output = generateMarkdown()
const outPath = resolve(import.meta.dirname!, '../../doc/v2019C1/api/elements.md')
writeFileSync(outPath, output, 'utf-8')
console.log(`Wrote ${outPath} (${output.split('\n').length} lines)`)
