import {
	canonicalElement,
	findByName,
	findByUuid,
	listAttributeChanges,
	listGroups,
	reportAndApply,
} from '../integration-helpers'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
} from '@/v2019C1/test'
import {
	areCorpusRevisionsSynced,
	readCorpusRevision,
} from '@/v2019C1/test/corpus/corpus-revisions'

import type { ReportedAndApplied } from '../integration-helpers.types'
import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The tags that make a project's frame, not what a fork places in it. */
const FRAME_TAGS = new Set(['Header', 'Substation', 'VoltageLevel', 'Bay'])

const projectWithEmptyBay = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** Every element carrying a uuid, but the frame's: `<tag> <uuid>`, sorted. */
function placedUuids(xml: string): string[] {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	return [...document.querySelectorAll('[uuid]')]
		.filter((element) => !FRAME_TAGS.has(element.localName))
		.map((element) => `${element.localName} ${element.getAttribute('uuid')}`)
		.sort()
}

/** The `name` attributes of that name, and the paths naming it: `<tag>@<attribute>`. */
function namesOrPathsNaming(params: { xml: string; name: string }): string[] {
	const { xml, name } = params
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	return [...document.getElementsByTagName('*')].flatMap((element) =>
		[...element.attributes]
			.filter((attribute) =>
				attribute.localName === 'name'
					? attribute.value === name
					: attribute.value.includes(`/${name}`),
			)
			.map((attribute) => `${element.localName}@${attribute.localName}`),
	)
}

/** How many elements carry an attribute, and how many are of a tag. */
function count(xml: string, selector: { attribute?: string; localName?: string }): number {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	return [...document.getElementsByTagName('*')].filter((element) =>
		selector.attribute
			? element.hasAttribute(selector.attribute)
			: element.localName === selector.localName,
	).length
}

const APPLICATION_RENAMES = {
	first: '3 - ASD files/CB_Light/CB_Lightv1r1.asd',
	second: '3 - ASD files/CB_Light/CB_Lightv1r2.asd',
} as const

describe.skipIf(!areCorpusRevisionsSynced(Object.values(APPLICATION_RENAMES)))(
	'corpus fork: an application file that renames three subfunctions',
	() => {
		it('forked into an empty bay, then its next revision and back, each given the other as base', async () => {
			const firstXml = await readCorpusRevision(APPLICATION_RENAMES.first)
			const secondXml = await readCorpusRevision(APPLICATION_RENAMES.second)
			const { project, source, target } = await createSclTestProject({
				sourceXml: firstXml,
				targetXml: projectWithEmptyBay,
			})
			if (!target) throw new Error('target required')
			const second = await openSclDocument({ project, xml: secondXml, label: 'next revision' })
			const anchor = { tagName: 'Bay', id: 'project-bay' } as Scl.Ref<'Bay'>
			const [application] = await source.document.query.getRecordsByTagName('Application')
			const { uuid: applicationUuid = '' } = await source.document.query.getAttributes(application)
			const [fn] = await source.document.query.getRecordsByTagName('Function')
			const { uuid: functionUuid = '' } = await source.document.query.getAttributes(fn)
			const firstFork = await applicationFork({
				revision: source.document,
				applicationUuid,
				anchor,
			})
			await reportAndApply({ document: target.document, lifecycle: firstFork })
			const placed = (await target.document.query.getSnapshot({ as: 'xml' })) as string

			const secondFork = await applicationFork({
				revision: second,
				base: source.document,
				applicationUuid,
				anchor,
			})
			const { report: renamed } = await reportAndApply({
				document: target.document,
				lifecycle: secondFork,
			})
			expect(
				listAttributeChanges(renamed),
				'the renames and the type change, nothing else',
			).toEqual([
				'name: Conditioner for Boolean Output Signals -> Conditioner for TRIP',
				'name: Logical device LN -> Application Management',
				'name: Physical Digital Output -> TRIP',
				'type: Protection -> HV_Interface',
			])
			const forked = (await target.document.query.getSnapshot({ as: 'xml' })) as string
			for (const former of [
				'Conditioner for Boolean Output Signals',
				'Logical device LN',
				'Physical Digital Output',
			]) {
				expect(namesOrPathsNaming({ xml: forked, name: former }), `left naming ${former}`).toEqual(
					[],
				)
			}
			const uuids = placedUuids(forked)
			expect(new Set(uuids).size, 'each uuid once').toBe(uuids.length)
			expect(uuids, 'the file elements, with their uuids').toEqual(placedUuids(secondXml))
			expect(count(forked, { attribute: 'templateUuid' }), 'the lineage the file holds').toBe(
				count(secondXml, { attribute: 'templateUuid' }),
			)
			expect(count(forked, { localName: 'FunctionSclRef' }), 'the provenance the file holds').toBe(
				count(secondXml, { localName: 'FunctionSclRef' }),
			)
			expect(count(forked, { localName: 'ApplicationSclRef' }), 'none of its own').toBe(0)

			const backFork = await applicationFork({
				revision: source.document,
				base: second,
				applicationUuid,
				anchor,
			})
			await reportAndApply({ document: target.document, lifecycle: backFork })
			const back = (await target.document.query.getSnapshot({ as: 'xml' })) as string
			for (const uuid of [applicationUuid, functionUuid]) {
				expect(canonicalElement({ xml: back, uuid }), 'back as first placed').toBe(
					canonicalElement({ xml: placed, uuid }),
				)
			}
		})
	},
)

const APPLICATION_GAINS = {
	first: '3 - ASD files/P51_Light/P51_Appv0r1.asd',
	second: '3 - ASD files/P51_Light/P51_Appv0r2.asd',
} as const

describe.skipIf(!areCorpusRevisionsSynced(Object.values(APPLICATION_GAINS)))(
	'corpus fork: an application file that gains a role and a behaviour',
	() => {
		it('forked to its next revision and back, each given the other as base: the two gained listed, then as it was', async () => {
			const firstXml = await readCorpusRevision(APPLICATION_GAINS.first)
			const secondXml = await readCorpusRevision(APPLICATION_GAINS.second)
			const { project, source, target } = await createSclTestProject({
				sourceXml: secondXml,
				targetXml: firstXml,
			})
			if (!target) throw new Error('target required')
			const first = await openSclDocument({ project, xml: firstXml, label: 'previous revision' })
			const [application] = await source.document.query.getRecordsByTagName('Application')
			const { uuid: applicationUuid = '' } = await source.document.query.getAttributes(application)
			const [fn] = await source.document.query.getRecordsByTagName('Function')
			const { uuid: functionUuid = '' } = await source.document.query.getAttributes(fn)
			const [bay] = await target.document.query.getRecordsByTagName('Bay')
			const before = (await target.document.query.getSnapshot({ as: 'xml' })) as string
			const anchor = { tagName: 'Bay', id: bay.id } as Scl.Ref<'Bay'>

			const gainedFork = await applicationFork({
				revision: source.document,
				base: first,
				applicationUuid,
				anchor,
			})
			const { report: gained } = await reportAndApply({
				document: target.document,
				lifecycle: gainedFork,
			})
			expect(listGroups(gained), 'the two elements the revision gained, nothing else').toEqual([
				'added BehaviorDescription',
				'added FunctionRole',
			])

			const backFork = await applicationFork({
				revision: first,
				base: source.document,
				applicationUuid,
				anchor,
			})
			await reportAndApply({ document: target.document, lifecycle: backFork })
			const after = (await target.document.query.getSnapshot({ as: 'xml' })) as string
			for (const uuid of [applicationUuid, functionUuid]) {
				expect(canonicalElement({ xml: after, uuid }), 'as it was').toBe(
					canonicalElement({ xml: before, uuid }),
				)
			}
		})
	},
)

/** A fork of the application of a revision, given the previous one as its base when there is one. */
async function applicationFork(params: {
	revision: Scl.Document
	base?: Scl.Document
	applicationUuid: string
	anchor: Scl.Ref<Scl.ElementsOf>
}): Promise<LifecycleTarget> {
	const { revision, base, applicationUuid, anchor } = params
	const ref = await findByUuid(revision.query, { tagName: 'Application', uuid: applicationUuid })
	return {
		verb: 'asd',
		sourceQuery: revision.query,
		ref,
		anchor,
		scenario: 'fork',
		...(base ? { baseQuery: base.query } : {}),
	}
}

/** A level of an SSD placed or updated on the project's substation, reported then applied. */
async function placeUnit(params: {
	document: Scl.Document
	sourceQuery: Scl.Query
	ref: Scl.Ref<'VoltageLevel'>
	scenario: LifecycleScenario
}): Promise<ReportedAndApplied> {
	const { document, sourceQuery, ref, scenario } = params
	const lifecycle: LifecycleTarget = {
		verb: 'ssd',
		sourceQuery,
		ref,
		anchor: { tagName: 'Substation', id: 'project-substation' },
		scenario,
	}
	return reportAndApply({ document, lifecycle })
}

/** Two files of one name that are not revisions of one another: every uuid, the Header's included, differs. */
const NOT_REVISIONS = [
	{
		name: 'a function file regenerated with a version',
		project: '2 - FSD files/2 - FSD In Use (Extended)/GAPC_v2_r1.fsd',
		revision: '2 - FSD files/2 - FSD In Use (Extended)/GAPC_v3_r1.fsd',
	},
	{
		name: 'an application file saved again as a new file',
		project: '3 - ASD files/CB_Light/CB_Light.asd',
		revision: '3 - ASD files/CB_Light/CB_Lightv1r1.asd',
	},
] as const

for (const pair of NOT_REVISIONS) {
	describe.skipIf(!areCorpusRevisionsSynced([pair.project, pair.revision]))(
		`corpus fork: ${pair.name}`,
		() => {
			it('given as the previous revision of the other, it is refused', async () => {
				const projectXml = await readCorpusRevision(pair.project)
				const { project, source, target } = await createSclTestProject({
					sourceXml: await readCorpusRevision(pair.revision),
					targetXml: projectXml,
				})
				if (!target) throw new Error('target required')
				const base = await openSclDocument({ project, xml: projectXml, label: 'previous revision' })
				const [bay] = await target.document.query.getRecordsByTagName('Bay')
				const [fn] = await source.document.query.getRecordsByTagName('Function')

				const refused = report(target.document.query, {
					verb: 'fsd',
					sourceQuery: source.document.query,
					ref: { tagName: 'Function', id: fn.id },
					anchor: { tagName: 'Bay', id: bay.id },
					scenario: 'fork',
					baseQuery: base.query,
				})
				await expect(refused).rejects.toThrow()
				const refusal = toDialecteError(await refused.catch((error: unknown) => error))
				expect(refusal?.key).toBe('REVISION_BASE_OTHER_FILE')
			})
		},
	)
}

const TOPOLOGY_ONLY = '4 - SSD template files/SLD_TFO_Bay v0r1.xml'

const projectSubstation = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`

describe.skipIf(!areCorpusRevisionsSynced([TOPOLOGY_ONLY]))(
	'corpus: a bay template of levels and equipment only',
	() => {
		it('its two linked levels placed together, updated with itself writes nothing; forked twice, each uuid stays once', async () => {
			const xml = await readCorpusRevision(TOPOLOGY_ONLY)
			const { project, source, target } = await createSclTestProject({
				sourceXml: xml,
				targetXml: projectSubstation,
			})
			if (!target) throw new Error('target required')
			const forkedProject = await openSclDocument({
				project,
				xml: projectSubstation,
				label: 'forked project',
			})
			// the template's two voltage levels are linked (a terminal of one on a node of the other): naming one places both
			const ref = await findByName(source.document.query, {
				tagName: 'VoltageLevel',
				name: 'TEMPLATE_HV',
			})
			const sourceQuery = source.document.query

			await placeUnit({ document: target.document, sourceQuery, ref, scenario: 'instantiate' })
			const placed = (await target.document.query.getSnapshot({ as: 'xml' })) as string
			expect(count(placed, { localName: 'VoltageLevel' }), 'both levels placed').toBe(2)
			const { report: update } = await placeUnit({
				document: target.document,
				sourceQuery,
				ref,
				scenario: 'template',
			})
			expect(listGroups(update), 'nothing to write').toEqual([])
			expect(await target.document.query.getSnapshot({ as: 'xml' }), 'nothing written').toBe(placed)

			await placeUnit({ document: forkedProject, sourceQuery, ref, scenario: 'fork' })
			await placeUnit({ document: forkedProject, sourceQuery, ref, scenario: 'fork' })
			const forked = (await forkedProject.query.getSnapshot({ as: 'xml' })) as string
			const uuids = [
				...new DOMParser().parseFromString(forked, 'application/xml').querySelectorAll('[uuid]'),
			].map((element) => element.getAttribute('uuid'))
			expect(new Set(uuids).size, 'each uuid once, the levels included').toBe(uuids.length)
		})
	},
)
