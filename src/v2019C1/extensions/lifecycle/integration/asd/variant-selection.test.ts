import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'
import { readRevisionTwin, readRevisionTwinInstance } from '@/v2019C1/test/revision-twins'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const E = 'eIEC61850-6-100'
const TEMPLATE = 'TEMPLATE/TEMPLATE/TEMPLATE'

const applicationRef = { tagName: 'Application', id: 'app' } as Scl.Ref<'Application'>

const lnode = (params: { lnClass: string; uuid: string; record: string; lineage?: string }) =>
	`<LNode iedName="None" lnClass="${params.lnClass}" lnInst="1" uuid="${params.uuid}" ${params.lineage ? `templateUuid="${params.lineage}"` : ''} ${id}="${params.record}"/>`

const marker = (params: { variant: string; update: 'add' | 'remove'; record: string }) =>
	`<${E}:FunctionalVariantRef functionalVariant="${params.variant}" update="${params.update}" ${id}="${params.record}"/>`

/** What a case changes in the template, on top of the first revision. */
type TemplateChange = {
	/** The description of subfunction A, B. */
	descA?: string
	descB?: string
	/** What subfunction B gains. */
	gainedInB?: string
	/** Subfunctions the function gains, and references of the application to them. */
	gainedSubFunctions?: string
	gainedReferences?: string
	/** Variants the group gains. */
	gainedVariants?: string
	/** Functions the bay gains beside `Prot`. */
	gainedFunctions?: string
	/** An allocation role the application refers to only with the variant V2. */
	allocationWithV2?: boolean
	/** A variable beside the function, applying only to the logical node of B. */
	variableOnB?: boolean
}

/**
 * The application template: a function `Prot` with subfunctions A (kept by the baseline), B (only the variant V2 adds
 * it) and C; a category classifying A and B; the application composes `Prot`, A (removed by V2) and B (added by V2),
 * its variants a group `G` of V1 (baseline) and V2.
 */
function templateXml(change: TemplateChange = {}): string {
	const descA = change.descA ? `desc="${change.descA}"` : ''
	const descB = change.descB ? `desc="${change.descB}"` : ''
	const allocationRole = change.allocationWithV2
		? `<${E}:AllocationRole name="PIU" uuid="piu-uuid" ${id}="s-piu"><${E}:FunctionRef function="${TEMPLATE}/Prot" functionUuid="Prot-uuid" ${id}="s-piu-fr"/></${E}:AllocationRole>`
		: ''
	const allocationRoleRef = change.allocationWithV2
		? `<${E}:AllocationRoleRef allocationRole="TEMPLATE/PIU" allocationRoleUuid="piu-uuid" ${id}="s-piu-ref">${marker({ variant: 'V2', update: 'add', record: 's-m-piu' })}</${E}:AllocationRoleRef>`
		: ''
	const variable = change.variableOnB
		? `<${E}:Variable name="Reach" value="1" uuid="variable-uuid" ${id}="s-variable"><${E}:VariableApplyTo element="TEMPLATE/Prot/B/PSCH1" elementUuid="ln-B-uuid" ${id}="s-variable-apply"/></${E}:Variable>`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="asd">
			<Header id="App" uuid="asd-file" version="1" revision="A" ${id}="asd-header"/>
			<Substation name="TEMPLATE" ${id}="s-substation">
				<Private type="${E}" ${id}="s-substation-private">
					<${E}:FunctionCategory name="CAT" uuid="cat-uuid" ${id}="s-cat">
						<${E}:FunctionCatRef function="${TEMPLATE}/Prot/A" functionUuid="A-uuid" ${id}="s-catref-A"/>
						<${E}:FunctionCatRef function="${TEMPLATE}/Prot/B" functionUuid="B-uuid" ${id}="s-catref-B"/>
					</${E}:FunctionCategory>
					${variable}
					${allocationRole}
				</Private>
				<VoltageLevel name="TEMPLATE" ${id}="s-vl">
					<Bay name="TEMPLATE" ${id}="s-bay">
						<Function name="Prot" uuid="Prot-uuid" ${id}="s-prot">
							<SubFunction name="A" ${descA} uuid="A-uuid" ${id}="s-A">${lnode({ lnClass: 'PDIS', uuid: 'ln-A-uuid', record: 's-ln-A' })}</SubFunction>
							<SubFunction name="B" ${descB} uuid="B-uuid" ${id}="s-B">${lnode({ lnClass: 'PSCH', uuid: 'ln-B-uuid', record: 's-ln-B' })}${change.gainedInB ?? ''}</SubFunction>
							<SubFunction name="C" uuid="C-uuid" ${id}="s-C"/>
							${change.gainedSubFunctions ?? ''}
						</Function>
						${change.gainedFunctions ?? ''}
						<Private type="${E}" ${id}="s-bay-private">
							<${E}:Application name="App" uuid="app-uuid" ${id}="app">
								<${E}:FunctionRole name="ROOT" uuid="root-uuid" ${id}="s-role-root">
									<${E}:FunctionRoleContent ${id}="s-content-root">
										<${E}:FunctionRef function="${TEMPLATE}/Prot" functionUuid="Prot-uuid" ${id}="s-fr-Prot"/>
									</${E}:FunctionRoleContent>
								</${E}:FunctionRole>
								<${E}:FunctionRole name="GENERIC" uuid="generic-uuid" ${id}="s-role-generic">
									<${E}:FunctionRoleContent ${id}="s-content-generic">
										<${E}:FunctionRef function="${TEMPLATE}/Prot/A" functionUuid="A-uuid" ${id}="s-fr-A">${marker({ variant: 'V2', update: 'remove', record: 's-m-A' })}</${E}:FunctionRef>
										<${E}:FunctionRef function="${TEMPLATE}/Prot/B" functionUuid="B-uuid" ${id}="s-fr-B">${marker({ variant: 'V2', update: 'add', record: 's-m-B' })}</${E}:FunctionRef>
										${change.gainedReferences ?? ''}
									</${E}:FunctionRoleContent>
								</${E}:FunctionRole>
								<${E}:FunctionalVariantGroup name="G" uuid="G-uuid" ${id}="s-G">
									<${E}:FunctionalVariant name="V1" isBaseline="true" uuid="V1-uuid" ${id}="s-V1"/>
									<${E}:FunctionalVariant name="V2" uuid="V2-uuid" ${id}="s-V2"/>
									${change.gainedVariants ?? ''}
								</${E}:FunctionalVariantGroup>
								${allocationRoleRef}
							</${E}:Application>
						</Private>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

/** What a bay's instance selected: one variant, or both (nothing selected yet); V1 and B kept by the project. */
type Selected = 'V1' | 'V2' | 'both' | 'V1 keeping B'

/** The subfunctions an instance holds for what it selected: A unless V2 removed it, B with V2. */
function heldSubFunctions(selected: Selected): ('A' | 'B')[] {
	if (selected === 'V1') return ['A']
	if (selected === 'V2') return ['B']
	if (selected === 'V1 keeping B') return ['A', 'B']
	return ['A', 'B']
}

/** One bay of the project holding an instance of the application, as a wizard resolved it for its selection. */
function bayXml(params: { bay: string; selected: Selected; free?: string }): string {
	const { bay, selected, free = '' } = params
	const held = heldSubFunctions(selected)
	const path = `S1/V1/${bay}/Prot`
	const lnClass = { A: 'PDIS', B: 'PSCH' }
	const subFunctions = held
		.map(
			(name) =>
				`<SubFunction name="${name}" uuid="${bay}-${name}" templateUuid="${name}-uuid" ${id}="${bay}-${name}">${lnode({ lnClass: lnClass[name], uuid: `${bay}-ln-${name}`, lineage: `ln-${name}-uuid`, record: `${bay}-ln-${name}` })}</SubFunction>`,
		)
		.join('')
	const markers = (name: 'A' | 'B') =>
		selected === 'both'
			? marker({
					variant: 'V2',
					update: name === 'A' ? 'remove' : 'add',
					record: `${bay}-m-${name}`,
				})
			: ''
	const references = held
		.map(
			(name) =>
				`<${E}:FunctionRef function="${path}/${name}" functionUuid="${bay}-${name}" ${id}="${bay}-fr-${name}">${markers(name)}</${E}:FunctionRef>`,
		)
		.join('')
	const variants = (
		selected === 'both' ? ['V1', 'V2'] : selected === 'V1 keeping B' ? ['V1'] : [selected]
	)
		.map(
			(name) =>
				`<${E}:FunctionalVariant name="${name}" ${name === 'V1' ? 'isBaseline="true"' : ''} uuid="${bay}-${name}" templateUuid="${name}-uuid" ${id}="${bay}-${name}-variant"/>`,
		)
		.join('')
	return /* xml */ `
		<Bay name="${bay}" ${id}="${bay}">
			<Function name="Prot" uuid="${bay}-prot" templateUuid="Prot-uuid" ${id}="${bay}-prot">
				${subFunctions}
				<SubFunction name="C" uuid="${bay}-C" templateUuid="C-uuid" ${id}="${bay}-C"/>
			</Function>
			${free}
			<Private type="${E}" ${id}="${bay}-private">
				<${E}:Application name="App" uuid="${bay}-app" templateUuid="app-uuid" ${id}="${bay}-app">
					<${E}:FunctionRole name="ROOT" uuid="${bay}-root" templateUuid="root-uuid" ${id}="${bay}-role-root">
						<${E}:FunctionRoleContent ${id}="${bay}-content-root">
							<${E}:FunctionRef function="${path}" functionUuid="${bay}-prot" ${id}="${bay}-fr-Prot"/>
						</${E}:FunctionRoleContent>
					</${E}:FunctionRole>
					<${E}:FunctionRole name="GENERIC" uuid="${bay}-generic" templateUuid="generic-uuid" ${id}="${bay}-role-generic">
						<${E}:FunctionRoleContent ${id}="${bay}-content-generic">${references}</${E}:FunctionRoleContent>
					</${E}:FunctionRole>
					<${E}:FunctionalVariantGroup name="G" uuid="${bay}-G" templateUuid="G-uuid" ${id}="${bay}-G">${variants}</${E}:FunctionalVariantGroup>
				</${E}:Application>
			</Private>
		</Bay>
	`
}

/** The project: one bay per instance, and the category classifying what each holds. */
function projectXml(bays: { bay: string; selected: Selected; free?: string }[]): string {
	const categoryReferences = bays
		.flatMap(({ bay, selected }) =>
			heldSubFunctions(selected).map(
				(name) =>
					`<${E}:FunctionCatRef function="S1/V1/${bay}/Prot/${name}" functionUuid="${bay}-${name}" ${id}="${bay}-catref-${name}"/>`,
			),
		)
		.join('')
	const bayContent = bays.map(bayXml).join('')
	return /* xml */ `
		<SCL ${ns} ${id}="project">
			<Substation name="S1" ${id}="t-substation">
				<Private type="${E}" ${id}="t-substation-private">
					<${E}:FunctionCategory name="CAT" uuid="t-cat" templateUuid="cat-uuid" ${id}="t-cat">${categoryReferences}</${E}:FunctionCategory>
				</Private>
				<VoltageLevel name="V1" ${id}="t-vl">${bayContent}</VoltageLevel>
			</Substation>
		</SCL>
	`
}

async function updated(params: {
	change?: TemplateChange
	bays: { bay: string; selected: Selected; free?: string }[]
	targetInstance?: string
}) {
	const { source, target } = await createSclTestProject({
		sourceXml: templateXml(params.change),
		targetXml: projectXml(params.bays),
	})
	if (!target) throw new Error('target required')
	const { report } = await reportAndApply({
		document: target.document,
		lifecycle: {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: { tagName: 'VoltageLevel', id: 't-vl' },
			...(params.targetInstance
				? { targetInstance: { tagName: 'Bay', id: params.targetInstance } }
				: {}),
		},
	})
	const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
	return { report, xml }
}

/** The elements of a tag in a document, `<parent name>/<name or record id>`, sorted. */
function elementsOf(params: { xml: string; localName: string }): string[] {
	const document = new DOMParser().parseFromString(params.xml, 'application/xml')
	return [...document.getElementsByTagName('*')]
		.filter((element) => element.localName === params.localName)
		.map((element) => {
			const parent = element.parentElement
			const label = (node: Element | null) =>
				node?.getAttribute('name') ?? node?.getAttribute('function') ?? node?.localName ?? ''
			return `${label(parent)}/${label(element)}`
		})
		.sort()
}

describe('update: an instance whose variants were selected is compared with the template as its selection reads it', () => {
	it('the template unchanged: nothing to add, the variant not selected listed', async () => {
		const { report, xml } = await updated({ bays: [{ bay: 'B1', selected: 'V1' }] })

		expect(listGroups(report), 'nothing the selection left out comes back').toEqual([])
		expect(report.summary.added).toBe(0)
		const [application] = report.instances
		expect(application.variantsNotSelected?.map((variant) => variant.id)).toEqual(['s-V2'])
		expect(elementsOf({ xml, localName: 'FunctionalVariantRef' })).toEqual([])
		expect(elementsOf({ xml, localName: 'SubFunction' })).toEqual(['Prot/A', 'Prot/C'])
		expect(elementsOf({ xml, localName: 'FunctionCatRef' })).toEqual(['CAT/S1/V1/B1/Prot/A'])
	})

	it('a change inside what the selection kept reaches the instance', async () => {
		const { report, xml } = await updated({
			change: { descA: 'revised' },
			bays: [{ bay: 'B1', selected: 'V1' }],
		})

		expect(listGroups(report)).toEqual(['modified SubFunction'])
		expect(xml).toContain('desc="revised"')
	})

	it('an element the selection leaves out that the project kept is compared as any: what it gains reaches it', async () => {
		const { report, xml } = await updated({
			change: { gainedInB: `<SubFunction name="B2" uuid="B2-uuid" ${id}="s-B2"/>` },
			bays: [{ bay: 'B1', selected: 'V1 keeping B' }],
		})

		expect(listGroups(report)).toEqual(['added SubFunction'])
		expect(elementsOf({ xml, localName: 'SubFunction' })).toEqual([
			'B/B2',
			'Prot/A',
			'Prot/B',
			'Prot/C',
		])
	})

	it('a change inside what only the variant not selected brings does not', async () => {
		const { report, xml } = await updated({
			change: { descB: 'revised' },
			bays: [{ bay: 'B1', selected: 'V1' }],
		})

		expect(listGroups(report)).toEqual([])
		expect(xml).not.toContain('desc="revised"')
		expect(elementsOf({ xml, localName: 'SubFunction' })).toEqual(['Prot/A', 'Prot/C'])
	})

	it('an element the template gains that the selection keeps is added without the markers the selection consumed', async () => {
		const { report, xml } = await updated({
			change: {
				gainedSubFunctions: `<SubFunction name="D" uuid="D-uuid" ${id}="s-D"/>`,
				gainedReferences: `<${E}:FunctionRef function="${TEMPLATE}/Prot/D" functionUuid="D-uuid" ${id}="s-fr-D">${marker({ variant: 'V2', update: 'remove', record: 's-m-D' })}<${E}:SignalRole name="Trip" uuid="signal-D-uuid" ${id}="s-signal-D"/></${E}:FunctionRef>`,
			},
			bays: [{ bay: 'B1', selected: 'V1' }],
		})

		expect(listGroups(report)).toEqual(['added FunctionRef', 'added SubFunction'])
		expect(elementsOf({ xml, localName: 'SubFunction' })).toEqual(['Prot/A', 'Prot/C', 'Prot/D'])
		expect(elementsOf({ xml, localName: 'FunctionalVariantRef' })).toEqual([])
		expect(elementsOf({ xml, localName: 'SignalRole' }), 'what it holds besides').toEqual([
			'S1/V1/B1/Prot/D/Trip',
		])
	})

	it('a subfunction the template gains that the selection keeps is added without the one inside it the selection leaves out', async () => {
		const { report, xml } = await updated({
			change: {
				gainedSubFunctions: `<SubFunction name="Outer" uuid="outer-uuid" ${id}="s-outer"><SubFunction name="Inner" uuid="inner-uuid" ${id}="s-inner"/></SubFunction>`,
				gainedReferences: `<${E}:FunctionRef function="${TEMPLATE}/Prot/Outer" functionUuid="outer-uuid" ${id}="s-fr-outer"/><${E}:FunctionRef function="${TEMPLATE}/Prot/Outer/Inner" functionUuid="inner-uuid" ${id}="s-fr-inner">${marker({ variant: 'V2', update: 'add', record: 's-m-inner' })}</${E}:FunctionRef>`,
			},
			bays: [{ bay: 'B1', selected: 'V1' }],
		})

		expect(listGroups(report)).toEqual(['added FunctionRef', 'added SubFunction'])
		expect(elementsOf({ xml, localName: 'SubFunction' })).toEqual([
			'Prot/A',
			'Prot/C',
			'Prot/Outer',
		])
	})

	it('a function the template gains, taken where the project holds one: what it gains comes without what the selection leaves out', async () => {
		const { report, xml } = await updated({
			change: {
				gainedFunctions: `<Function name="Ctrl" uuid="Ctrl-uuid" ${id}="s-ctrl"><SubFunction name="CQ" uuid="CQ-uuid" ${id}="s-CQ"><SubFunction name="CQ1" uuid="CQ1-uuid" ${id}="s-CQ1"/></SubFunction></Function>`,
				gainedReferences: `<${E}:FunctionRef function="${TEMPLATE}/Ctrl" functionUuid="Ctrl-uuid" ${id}="s-fr-ctrl"/><${E}:FunctionRef function="${TEMPLATE}/Ctrl/CQ" functionUuid="CQ-uuid" ${id}="s-fr-CQ"/><${E}:FunctionRef function="${TEMPLATE}/Ctrl/CQ/CQ1" functionUuid="CQ1-uuid" ${id}="s-fr-CQ1">${marker({ variant: 'V2', update: 'add', record: 's-m-CQ1' })}</${E}:FunctionRef>`,
			},
			bays: [
				{
					bay: 'B1',
					selected: 'V1',
					free: `<Function name="Ctrl" uuid="B1-ctrl" templateUuid="Ctrl-uuid" ${id}="B1-ctrl"/>`,
				},
			],
		})

		expect(listGroups(report)).toContain('added SubFunction')
		expect(elementsOf({ xml, localName: 'Function' }), 'the one the project held, taken').toEqual([
			'B1/Ctrl',
			'B1/Prot',
		])
		expect(elementsOf({ xml, localName: 'SubFunction' })).toEqual(['Ctrl/CQ', 'Prot/A', 'Prot/C'])
	})

	it('a function the template gains that only a variant not selected composes is not placed', async () => {
		const { report, xml } = await updated({
			change: {
				gainedFunctions: `<Function name="Extra" uuid="Extra-uuid" ${id}="s-extra"/>`,
				gainedReferences: `<${E}:FunctionRef function="${TEMPLATE}/Extra" functionUuid="Extra-uuid" ${id}="s-fr-extra">${marker({ variant: 'V2', update: 'add', record: 's-m-extra' })}</${E}:FunctionRef>`,
			},
			bays: [{ bay: 'B1', selected: 'V1' }],
		})

		expect(listGroups(report)).toEqual([])
		expect(elementsOf({ xml, localName: 'Function' })).toEqual(['B1/Prot'])
	})

	it('an allocation role the application refers to only with a variant not selected is not placed', async () => {
		const { report, xml } = await updated({
			change: { allocationWithV2: true },
			bays: [{ bay: 'B1', selected: 'V1' }],
		})

		expect(listGroups(report)).toEqual([])
		expect(elementsOf({ xml, localName: 'AllocationRole' })).toEqual([])
	})

	it('a variable applying only to what the selection left out is not placed', async () => {
		const { report, xml } = await updated({
			change: { variableOnB: true },
			bays: [{ bay: 'B1', selected: 'V1' }],
		})

		expect(listGroups(report)).toEqual([])
		expect(elementsOf({ xml, localName: 'Variable' })).toEqual([])
	})

	it('a variant the template gains is not added: listed with the others not selected', async () => {
		const { report, xml } = await updated({
			change: {
				gainedVariants: `<${E}:FunctionalVariant name="V3" uuid="V3-uuid" ${id}="s-V3"/>`,
			},
			bays: [{ bay: 'B1', selected: 'V1' }],
		})

		expect(listGroups(report)).toEqual([])
		const [application] = report.instances
		expect(application.variantsNotSelected?.map((variant) => variant.id)).toEqual(['s-V2', 's-V3'])
		expect(elementsOf({ xml, localName: 'FunctionalVariant' })).toEqual(['G/V1'])
	})

	it('an instance holding every variant has selected nothing yet: a change of any variant reaches it', async () => {
		const { report, xml } = await updated({
			change: { descB: 'revised' },
			bays: [{ bay: 'B1', selected: 'both' }],
		})

		expect(listGroups(report)).toEqual(['modified SubFunction'])
		expect(report.instances[0].variantsNotSelected).toBeUndefined()
		expect(xml).toContain('desc="revised"')
	})

	it('two instances, two selections: each compared with the template as its own selection reads it', async () => {
		const { report, xml } = await updated({
			bays: [
				{ bay: 'B1', selected: 'V1' },
				{ bay: 'B2', selected: 'V2' },
			],
		})

		expect(listGroups(report)).toEqual([])
		expect(elementsOf({ xml, localName: 'FunctionalVariantRef' })).toEqual([])
		expect(elementsOf({ xml, localName: 'SubFunction' })).toEqual([
			'Prot/A',
			'Prot/B',
			'Prot/C',
			'Prot/C',
		])
	})
})

describe('update of the variant twin: an instance with one variant of each group selected', () => {
	async function updatedFrom(revision: 1 | 2) {
		const { source, target } = await createSclTestProject({
			sourceXml: readRevisionTwin({ twin: 'variantApplication', revision }),
			targetXml: readRevisionTwinInstance({ twin: 'variantApplication' }),
		})
		if (!target) throw new Error('target required')
		const [application] = await source.document.query.getRecordsByTagName('Application')
		const [bay] = await target.document.query.any.findByAttributes({
			tagName: 'Bay',
			attributes: { name: 'B1' },
		})
		const { report } = await reportAndApply({
			document: target.document,
			lifecycle: {
				verb: 'asd',
				sourceQuery: source.document.query,
				ref: { tagName: 'Application', id: application.id } as Scl.Ref<'Application'>,
				anchor: { tagName: 'Bay', id: bay.id },
			},
		})
		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		const notSelected = await Promise.all(
			(report.instances[0].variantsNotSelected ?? []).map(
				async (variant) => (await source.document.query.any.getAttributes(variant)).name,
			),
		)
		return { report, xml, notSelected }
	}

	it('the revision it was made from: only what the project lacks, the tool element inside its wrapper', async () => {
		const { report, xml, notSelected } = await updatedFrom(1)

		expect(listGroups(report)).toEqual(['added LabelInfo'])
		expect(notSelected.sort()).toEqual(['Subtype 01', 'Subtype 03', 'Three pole'])
		expect(elementsOf({ xml, localName: 'LabelInfo' }), 'in the tool wrapper').toEqual([
			'Private/Object_1',
		])
		expect(elementsOf({ xml, localName: 'SubFunction' })).toEqual([
			'Protection_Fn/Distance zone 1',
			'Protection_Fn/Trip conditioning',
		])
		expect(elementsOf({ xml, localName: 'FunctionalVariantRef' })).toEqual([])
	})

	it('the next revision: the change inside the selection, not the one outside it nor the variant it gains; the behaviour file kept', async () => {
		const { report, xml, notSelected } = await updatedFrom(2)

		expect(listGroups(report)).toEqual(['added LabelInfo', 'modified SubFunction'])
		expect(notSelected.sort()).toEqual(['Subtype 01', 'Subtype 03', 'Subtype 04', 'Three pole'])
		expect(xml).toContain('desc="Reach revised"')
		expect(xml).not.toContain('desc="Channel revised"')
		expect(report.summary.kept, 'the instance keeps its behaviour file').toBe(1)
		expect(xml).toContain('fileReference="00000000-0000-4000-8000-000000000490"')
		expect(elementsOf({ xml, localName: 'FunctionalVariant' })).toEqual([
			'Breaker subtype/Single pole',
			'Protection subtype/Subtype 02',
		])
	})
})
