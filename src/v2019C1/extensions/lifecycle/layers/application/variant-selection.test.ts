import { readVariantSelection, readVariantTemplate, sharedSelection } from './variant-selection'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const E = 'eIEC61850-6-100'
const PATH = 'TEMPLATE/TEMPLATE/TEMPLATE'

/** A marker of a variant: `<record id>` = `m-<element>-<variant>`. */
const marker = (element: string, variant: string, update: 'add' | 'remove') =>
	`<${E}:FunctionalVariantRef functionalVariant="${variant}" update="${update}" ${id}="m-${element}-${variant}"/>`

/** A reference of the application composing a subfunction of `Prot`, with markers. */
const composes = (params: { record: string; name: string; markers?: string; inside?: string }) =>
	`<${E}:FunctionRef function="${PATH}/Prot/${params.name}" functionUuid="${params.name}-uuid" ${id}="${params.record}">${params.markers ?? ''}${params.inside ?? ''}</${E}:FunctionRef>`

const subFunction = (name: string, inside = '') =>
	`<SubFunction name="${name}" uuid="${name}-uuid" ${id}="sf-${name}">${inside}</SubFunction>`

/**
 * The template: a function `Prot` (subfunctions A to F and J, E holding E1, B a process resource, D a logical node), a
 * category classifying B and D, an application composing them through one role, its variants in a group `G` (V1
 * baseline, V2, V3; V1 holding the sub-variants S1, S2), a group `H` (W1, W2) and a group `K` of one variant.
 */
const processResource = `<Private type="${E}" ${id}="sf-B-private"><${E}:ProcessResources ${id}="prs-B"><${E}:ProcessResource name="PR" uuid="pr-uuid" ${id}="pr"/></${E}:ProcessResources></Private>`
const tripSource = `<LNode iedName="None" lnClass="PTOC" lnInst="1" uuid="ln-B-uuid" ${id}="ln-B"><Private type="${E}" ${id}="ln-B-private"><${E}:LNodeSpecNaming sLnClass="PTOC" sLnInst="1" ${id}="ln-B-spec"/></Private></LNode>`
const sourceReference = `<Private type="${E}" ${id}="ln-D-private"><${E}:LNodeInputs ${id}="inputs-D"><${E}:SourceRef input="Trip" source="B/PTOC1.Op.general" sourceLNodeUuid="ln-B-uuid" sourceDoName="Op" sourceDaName="general" uuid="sref-uuid" ${id}="sref-D"/></${E}:LNodeInputs></Private>`
const logicalNode = `<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="ln-D-uuid" ${id}="ln-D">${sourceReference}</LNode>`
const subFunctions = [
	subFunction('A'),
	subFunction('B', processResource + tripSource),
	subFunction('C'),
	subFunction('D', logicalNode),
	subFunction('E', subFunction('E1')),
	subFunction('F'),
	subFunction('J'),
	subFunction('L', subFunction('L1')),
	subFunction('M'),
	subFunction('N'),
	subFunction('P'),
].join('')

const dataReference = `<${E}:SignalRole name="Pos" uuid="signal-uuid" ${id}="signal-D"><${E}:LNodeDataRef data="${PATH}/Prot/D/XCBR1.Pos" doName="Pos" lnodeUuid="ln-D-uuid" ${id}="ldr-D">${marker('ldr', 'V2', 'remove')}</${E}:LNodeDataRef><${E}:LNodeInputRef sourceRef="${PATH}/Prot/D/XCBR1.Trip(1).general" sourceRefUuid="sref-uuid" ${id}="lir-D"/></${E}:SignalRole>`
const composedSubFunctions = [
	composes({
		record: 'fr-A',
		name: 'A',
		markers: `<${E}:FunctionalVariantRef functionalVariant="V2" functionalVariantUuid="V2-uuid" update="remove" ${id}="m-A-V2"/>`,
	}),
	composes({ record: 'fr-B', name: 'B', markers: marker('B', 'V3', 'add') }),
	composes({
		record: 'fr-C',
		name: 'C',
		markers: marker('C', 'V2', 'remove') + marker('C', 'V3', 'remove'),
	}),
	composes({ record: 'fr-D', name: 'D', markers: marker('D', 'K1', 'add'), inside: dataReference }),
	composes({ record: 'fr-D-again', name: 'D', markers: marker('D2', 'V2', 'remove') }),
	composes({ record: 'fr-E', name: 'E' }),
	`<${E}:FunctionRef function="${PATH}/Prot/E/E1" functionUuid="E1-uuid" ${id}="fr-E1">${marker('E1', 'V2', 'remove')}</${E}:FunctionRef>`,
	composes({ record: 'fr-F', name: 'F', markers: marker('F', 'W1', 'add') }),
	composes({ record: 'fr-J', name: 'J', markers: marker('J', 'S1', 'add') }),
	composes({ record: 'fr-L', name: 'L', markers: marker('L', 'V2', 'remove') }),
	`<${E}:FunctionRef function="${PATH}/Prot/L/L1" functionUuid="L1-uuid" ${id}="fr-L1"/>`,
	composes({ record: 'fr-M', name: 'M', markers: marker('M', 'X1', 'add') }),
	composes({ record: 'fr-N', name: 'N', markers: marker('N', 'T1', 'add') }),
	composes({
		record: 'fr-P',
		name: 'P',
		markers: marker('P', 'V1', 'add') + marker('P', 'V3', 'add'),
	}),
	`<${E}:ProcessResourceRef processResource="${PATH}/Prot/B/PR" processResourceUuid="pr-uuid" ${id}="prr-B"/>`,
].join('')

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Header id="app" uuid="asd-file" version="1" revision="A" ${id}="asd-header"/>
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="${E}" ${id}="sub-private">
				<${E}:FunctionCategory name="CAT" uuid="cat-uuid" ${id}="cat">
					<${E}:FunctionCatRef function="${PATH}/Prot/B" functionUuid="B-uuid" ${id}="catref-B"/>
					<${E}:FunctionCatRef function="${PATH}/Prot/D" functionUuid="D-uuid" ${id}="catref-D"/>
				</${E}:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="Prot-uuid" ${id}="fn">${subFunctions}</Function>
					<Private type="${E}" ${id}="bay-private">
						<${E}:Application name="App" uuid="app-uuid" ${id}="app">
							<${E}:FunctionRole name="ROOT" uuid="role-root-uuid" ${id}="role-root">
								<${E}:FunctionRoleContent ${id}="content-root">
									<${E}:FunctionRef function="${PATH}/Prot" functionUuid="Prot-uuid" ${id}="fr-Prot"/>
								</${E}:FunctionRoleContent>
							</${E}:FunctionRole>
							<${E}:FunctionRole name="GENERIC" uuid="role-generic-uuid" ${id}="role-generic">
								<${E}:FunctionRoleContent ${id}="content-generic">${composedSubFunctions}</${E}:FunctionRoleContent>
							</${E}:FunctionRole>
							<${E}:FunctionalVariant name="X1" uuid="X1-uuid" ${id}="X1"/>
							<${E}:FunctionalVariant name="X2" uuid="X2-uuid" ${id}="X2"/>
							<${E}:FunctionalVariantGroup name="G" uuid="G-uuid" ${id}="G">
								<${E}:FunctionalVariant name="V1" isBaseline="true" uuid="V1-uuid" ${id}="V1">
									<${E}:FunctionalSubVariant name="S1" uuid="S1-uuid" ${id}="S1"/>
									<${E}:FunctionalSubVariant name="S2" uuid="S2-uuid" ${id}="S2">
										<${E}:FunctionalSubVariant name="T1" uuid="T1-uuid" ${id}="T1"/>
										<${E}:FunctionalSubVariant name="T2" uuid="T2-uuid" ${id}="T2"/>
									</${E}:FunctionalSubVariant>
								</${E}:FunctionalVariant>
								<${E}:FunctionalVariant name="V2" uuid="V2-uuid" ${id}="V2"/>
								<${E}:FunctionalVariant name="V3" uuid="V3-uuid" ${id}="V3"/>
							</${E}:FunctionalVariantGroup>
							<${E}:FunctionalVariantGroup name="H" uuid="H-uuid" ${id}="H">
								<${E}:FunctionalVariant name="W1" uuid="W1-uuid" ${id}="W1"/>
								<${E}:FunctionalVariant name="W2" uuid="W2-uuid" ${id}="W2"/>
							</${E}:FunctionalVariantGroup>
							<${E}:FunctionalVariantGroup name="K" uuid="K-uuid" ${id}="K">
								<${E}:FunctionalVariant name="K1" uuid="K1-uuid" ${id}="K1"/>
							</${E}:FunctionalVariantGroup>
						</${E}:Application>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A variant the instance holds: its lineage, or its name only. */
type Held = { name: string; lineage?: boolean; holds?: Held[]; renamed?: string }

function heldVariants(held: readonly Held[], tag = 'FunctionalVariant'): string {
	return held
		.map(
			({ name, lineage = true, holds = [], renamed }) =>
				`<${E}:${tag} name="${renamed ?? name}" uuid="${name}-inst" ${lineage ? `templateUuid="${name}-uuid"` : ''} ${id}="inst-${name}">${heldVariants(holds, 'FunctionalSubVariant')}</${E}:${tag}>`,
		)
		.join('')
}

/** The instance of the application, holding the variants of each group the case says, and of its own. */
function targetXml(groups: Record<string, readonly Held[]>, direct: readonly Held[] = []): string {
	const held = Object.entries(groups)
		.map(
			([group, variants]) =>
				`<${E}:FunctionalVariantGroup name="${group}" uuid="${group}-inst" templateUuid="${group}-uuid" ${id}="inst-${group}">${heldVariants(variants)}</${E}:FunctionalVariantGroup>`,
		)
		.join('')
	return /* xml */ `
		<SCL ${ns} ${id}="project">
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t">
					<Bay name="B1" ${id}="bay-t">
						<Private type="${E}" ${id}="bay-t-private">
							<${E}:Application name="App" uuid="app-inst" templateUuid="app-uuid" ${id}="instance">${heldVariants(direct)}${held}</${E}:Application>
						</Private>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

const BOTH_SUB_VARIANTS: Held = { name: 'V1', holds: [{ name: 'S1' }, { name: 'S2' }] }
const H_WHOLE: readonly Held[] = [{ name: 'W1' }, { name: 'W2' }]
const ALL_G_MARKERS = [
	'm-A-V2',
	'm-B-V3',
	'm-C-V2',
	'm-C-V3',
	'm-D2-V2',
	'm-E1-V2',
	'm-L-V2',
	'm-P-V1',
	'm-P-V3',
	'm-ldr-V2',
]

type TestCase = {
	held: Record<string, readonly Held[]>
	/** The variants the instance holds of the application's own. */
	direct?: Held[]
	namesFollow?: NamesFollow
	/** The record ids left out, sorted. */
	leftOut: string[]
	/** The record ids of the variants listed as not selected, sorted. */
	variantsNotSelected: string[]
}

const testCases: Record<string, TestCase> = {
	'the baseline selected: the other variants, their markers, the elements only another variant adds, what refers to them and, in turn, to those':
		{
			held: { G: [BOTH_SUB_VARIANTS], H: H_WHOLE, K: [{ name: 'K1' }] },
			leftOut: [
				...ALL_G_MARKERS,
				'V2',
				'V3',
				'catref-B',
				'fr-B',
				'lir-D',
				'prr-B',
				'sf-B',
				'sref-D',
			].sort(),
			variantsNotSelected: ['V2', 'V3'],
		},
	'another variant selected: what its markers remove, the subfunctions only they composed, a data reference; a subfunction composed again, the root and the logical node stay':
		{
			held: { G: [{ name: 'V2' }], H: H_WHOLE, K: [{ name: 'K1' }] },
			leftOut: [
				...ALL_G_MARKERS,
				'V1',
				'V3',
				'catref-B',
				'fr-A',
				'fr-B',
				'fr-C',
				'fr-D-again',
				'fr-E1',
				'fr-J',
				'fr-L',
				'fr-N',
				'fr-P',
				'm-N-T1',
				'sf-N',
				'sf-P',
				'ldr-D',
				'm-J-S1',
				'lir-D',
				'prr-B',
				'sref-D',
				'sf-A',
				'sf-B',
				'sf-C',
				'sf-E1',
				'sf-J',
			].sort(),
			variantsNotSelected: ['V1', 'V3'],
		},
	'a variant adding an element selected: it stays, what that variant removes goes': {
		held: { G: [{ name: 'V3' }], H: H_WHOLE, K: [{ name: 'K1' }] },
		leftOut: [
			...ALL_G_MARKERS,
			'V1',
			'V2',
			'fr-C',
			'fr-J',
			'fr-N',
			'm-J-S1',
			'm-N-T1',
			'sf-C',
			'sf-J',
			'sf-N',
		].sort(),
		variantsNotSelected: ['V1', 'V2'],
	},
	'two groups selected: each leaves out its own': {
		held: { G: [BOTH_SUB_VARIANTS], H: [{ name: 'W2' }], K: [{ name: 'K1' }] },
		leftOut: [
			...ALL_G_MARKERS,
			'V2',
			'V3',
			'W1',
			'catref-B',
			'fr-B',
			'fr-F',
			'm-F-W1',
			'lir-D',
			'prr-B',
			'sref-D',
			'sf-B',
			'sf-F',
		].sort(),
		variantsNotSelected: ['V2', 'V3', 'W1'],
	},
	'a sub-variant selected inside the selected variant: the other sub-variant and what only it adds':
		{
			held: { G: [{ name: 'V1', holds: [{ name: 'S2' }] }], H: H_WHOLE, K: [{ name: 'K1' }] },
			leftOut: [
				...ALL_G_MARKERS,
				'S1',
				'V2',
				'V3',
				'catref-B',
				'fr-B',
				'fr-J',
				'm-J-S1',
				'lir-D',
				'prr-B',
				'sref-D',
				'sf-B',
				'sf-J',
			].sort(),
			variantsNotSelected: ['S1', 'V2', 'V3'],
		},
	'every variant of each group held: nothing selected yet, nothing left out': {
		held: {
			G: [BOTH_SUB_VARIANTS, { name: 'V2' }, { name: 'V3' }],
			H: H_WHOLE,
			K: [{ name: 'K1' }],
		},
		leftOut: [],
		variantsNotSelected: [],
	},
	'no group held: nothing left out': {
		held: {},
		leftOut: [],
		variantsNotSelected: [],
	},
	'a variant held by its name only: matched by its name': {
		held: { G: [{ name: 'V3', lineage: false }], H: H_WHOLE, K: [{ name: 'K1' }] },
		leftOut: [
			...ALL_G_MARKERS,
			'V1',
			'V2',
			'fr-C',
			'fr-J',
			'fr-N',
			'm-J-S1',
			'm-N-T1',
			'sf-C',
			'sf-J',
			'sf-N',
		].sort(),
		variantsNotSelected: ['V1', 'V2'],
	},
	'a variant held under another name: matched by its lineage': {
		held: { G: [{ name: 'V3', renamed: 'Third' }], H: H_WHOLE, K: [{ name: 'K1' }] },
		leftOut: [
			...ALL_G_MARKERS,
			'V1',
			'V2',
			'fr-C',
			'fr-J',
			'fr-N',
			'm-J-S1',
			'm-N-T1',
			'sf-C',
			'sf-J',
			'sf-N',
		].sort(),
		variantsNotSelected: ['V1', 'V2'],
	},
	"the application's own variants selected: the other and what only it adds": {
		held: {
			G: [BOTH_SUB_VARIANTS, { name: 'V2' }, { name: 'V3' }],
			H: H_WHOLE,
			K: [{ name: 'K1' }],
		},
		direct: [{ name: 'X2' }],
		leftOut: ['X1', 'fr-M', 'm-M-X1', 'sf-M'],
		variantsNotSelected: ['X1'],
	},
	'a group not selected yet, the sub-variants of one of its variants selected: what that selection leaves out':
		{
			held: {
				G: [{ name: 'V1', holds: [{ name: 'S2' }] }, { name: 'V2' }, { name: 'V3' }],
				H: H_WHOLE,
				K: [{ name: 'K1' }],
			},
			leftOut: ['S1', 'fr-J', 'm-J-S1', 'sf-J'],
			variantsNotSelected: ['S1'],
		},
	'a revision of the same file (the names follow the source): its variants are content, nothing left out':
		{
			held: { G: [{ name: 'V2' }], H: H_WHOLE, K: [{ name: 'K1' }] },
			namesFollow: 'source',
			leftOut: [],
			variantsNotSelected: [],
		},
}

describe('readVariantSelection: what the variants an instance selected leave out of its template', () => {
	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, async () => {
			const { source, target } = await createSclTestProject({
				sourceXml,
				targetXml: targetXml(testCase.held, testCase.direct),
			})
			if (!target) throw new Error('target required')
			const template = await readVariantTemplate(source.document.query, {
				applicationRef: { tagName: 'Application', id: 'app' } as Scl.Ref<'Application'>,
				namesFollow: testCase.namesFollow ?? 'project',
			})
			const selection = await readVariantSelection(target.document.query, {
				template,
				instance: { tagName: 'Application', id: 'instance' },
				matchKey: 'templateUuid',
			})
			expect([...selection.leftOut].sort()).toEqual(testCase.leftOut)
			expect(selection.variantsNotSelected.map((variant) => variant.id).sort()).toEqual(
				testCase.variantsNotSelected,
			)
		})
	}

	it('an application holding no variant: no template to read, nothing left out', async () => {
		const withoutVariants = /* xml */ `
			<SCL ${ns} ${id}="asd">
				<Substation name="TEMPLATE" ${id}="sub-s">
					<VoltageLevel name="TEMPLATE" ${id}="vl-s">
						<Bay name="TEMPLATE" ${id}="bay-s">
							<Function name="Prot" uuid="Prot-uuid" ${id}="fn"/>
							<Private type="${E}" ${id}="bay-private">
								<${E}:Application name="App" uuid="app-uuid" ${id}="app">
									<${E}:FunctionRole name="ROOT" uuid="role-root-uuid" ${id}="role-root">
										<${E}:FunctionRoleContent ${id}="content-root">
											<${E}:FunctionRef function="${PATH}/Prot" functionUuid="Prot-uuid" ${id}="fr-Prot"/>
										</${E}:FunctionRoleContent>
									</${E}:FunctionRole>
								</${E}:Application>
							</Private>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>
		`
		const { source } = await createSclTestProject({ sourceXml: withoutVariants })
		const template = await readVariantTemplate(source.document.query, {
			applicationRef: { tagName: 'Application', id: 'app' } as Scl.Ref<'Application'>,
			namesFollow: 'project',
		})
		expect(template).toBeUndefined()
	})

	it('several instances composing one function: only what every selection leaves out', () => {
		const shared = sharedSelection([
			{
				variantsNotSelected: [],
				leftOut: new Set(['sf-A', 'sf-B']),
				within: new Set(['sf-A', 'sf-B', 'ln-B']),
			},
			{
				variantsNotSelected: [],
				leftOut: new Set(['sf-B', 'sf-C']),
				within: new Set(['sf-B', 'ln-B', 'sf-C']),
			},
		])
		expect({ leftOut: [...shared.leftOut], within: [...shared.within] }).toEqual({
			leftOut: ['sf-B'],
			within: ['sf-B', 'ln-B'],
		})
		expect(sharedSelection([]).leftOut.size).toBe(0)
	})

	it('what is left out, with every element it holds', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml: targetXml({ G: [BOTH_SUB_VARIANTS], H: H_WHOLE, K: [{ name: 'K1' }] }),
		})
		if (!target) throw new Error('target required')
		const template = await readVariantTemplate(source.document.query, {
			applicationRef: { tagName: 'Application', id: 'app' } as Scl.Ref<'Application'>,
			namesFollow: 'project',
		})
		const selection = await readVariantSelection(target.document.query, {
			template,
			instance: { tagName: 'Application', id: 'instance' },
			matchKey: 'templateUuid',
		})
		const held = ['ln-B', 'ln-B-spec', 'prs-B', 'pr']
		expect([...selection.within].sort()).toEqual([...selection.leftOut, ...held].sort())
	})
})
