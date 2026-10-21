import { findByUuid, reportAndApply } from '../integration-helpers'

import { describe, expect, it } from 'vitest'

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

import type { Scl } from '@/v2019C1/config'

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
		it('forked into an empty bay, then its next revision: the file uuids once each, its own lineage and provenance', async () => {
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
			const applicationUuid = (await source.document.query.getAttributes(application)).uuid ?? ''

			for (const revision of [source.document, second]) {
				await reportAndApply({
					document: target.document,
					lifecycle: {
						verb: 'asd',
						sourceQuery: revision.query,
						ref: await findByUuid(revision.query, {
							tagName: 'Application',
							uuid: applicationUuid,
						}),
						anchor,
						scenario: 'fork',
					},
				})
			}

			const forked = (await target.document.query.getSnapshot({ as: 'xml' })) as string
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
		})
	},
)
