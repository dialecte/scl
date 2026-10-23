import { reportAndApply } from '../integration-helpers'

import { describe, expect, it } from 'vitest'

import {
	readVariantSelection,
	readVariantTemplate,
} from '@/v2019C1/extensions/lifecycle/layers/application'
import { createSclTestProject } from '@/v2019C1/test'
import {
	areCorpusRevisionsSynced,
	readCorpusRevision,
} from '@/v2019C1/test/corpus/corpus-revisions'

import type { Scl } from '@/v2019C1/config'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const FILES = {
	application: '3 - ASD files/Protections_P21_App/P21_App.asd',
	project: '5 - SSD system files/SSD3/SUBSTATION_v1rA.ssd',
} as const

/** Every node of a report, its trees and its groups' companions. */
function allNodes(report: DiffReport): DiffNode[] {
	const out: DiffNode[] = []
	const visit = (node: DiffNode): void => {
		out.push(node)
		for (const child of node.children) visit(child)
	}
	for (const instance of report.instances) {
		visit(instance.tree)
		for (const group of instance.groups)
			for (const node of [group.primary, ...group.companions]) visit(node)
	}
	return out
}

/** How many elements of a tag a bay of the document holds, by the bay's name. */
function countInBay(params: { xml: string; bay: string; localName: string }): number {
	const document = new DOMParser().parseFromString(params.xml, 'application/xml')
	const [bay] = [...document.getElementsByTagName('*')].filter(
		(element) => element.localName === 'Bay' && element.getAttribute('name') === params.bay,
	)
	return [...bay.getElementsByTagName('*')].filter(
		(element) => element.localName === params.localName,
	).length
}

function attributesOf(params: {
	xml: string
	bay: string
	localName: string
	name: string
}): string[] {
	const document = new DOMParser().parseFromString(params.xml, 'application/xml')
	const [bay] = [...document.getElementsByTagName('*')].filter(
		(element) => element.localName === 'Bay' && element.getAttribute('name') === params.bay,
	)
	return [...bay.getElementsByTagName('*')]
		.filter((element) => element.localName === params.localName)
		.map((element) => element.getAttribute(params.name) ?? '')
		.sort()
}

describe.skipIf(!areCorpusRevisionsSynced(Object.values(FILES)))(
	'corpus: an application instance whose variant was selected, updated from its unchanged application file',
	() => {
		it('SSD3 BAY1 P21_App from P21_App.asd: nothing the selection left out comes back, the file stays valid', async () => {
			const { source, target } = await createSclTestProject({
				sourceXml: await readCorpusRevision(FILES.application),
				targetXml: await readCorpusRevision(FILES.project),
			})
			if (!target) throw new Error('target required')
			const [application] = await source.document.query.getRecordsByTagName('Application')
			const [bay] = await target.document.query.any.findByAttributes({
				tagName: 'Bay',
				attributes: { name: 'BAY1' },
			})
			const bayRef = { tagName: 'Bay', id: bay.id } as Scl.Ref<'Bay'>
			const before = (await target.document.query.getSnapshot({ as: 'xml' })) as string
			const applicationRef = {
				tagName: 'Application',
				id: application.id,
			} as Scl.Ref<'Application'>

			const { report } = await reportAndApply({
				document: target.document,
				lifecycle: {
					verb: 'asd',
					sourceQuery: source.document.query,
					ref: applicationRef,
					anchor: bayRef,
					targetInstance: bayRef,
				},
			})

			const [instance] = report.templateInstances
			const template = await readVariantTemplate(source.document.query, {
				applicationRef,
				namesFollow: 'project',
			})
			const selection = await readVariantSelection(target.document.query, {
				template,
				instance,
				matchKey: 'templateUuid',
			})
			expect(
				selection.variantsNotSelected,
				'the 21 variants the instance did not select',
			).toHaveLength(21)
			const comeBack = allNodes(report).filter(
				(node) =>
					node.change === 'added' && node.sourceRef?.id && selection.leftOut.has(node.sourceRef.id),
			)
			expect(
				comeBack.map((node) => node.tagName),
				'listed although the selection left it out',
			).toEqual([])
			const added = new Set(
				allNodes(report)
					.filter((node) => node.change === 'added')
					.map((node) => node.tagName),
			)
			for (const tagName of [
				'FunctionalVariant',
				'FunctionalVariantRef',
				'SubFunction',
				'FunctionCatRef',
			])
				expect(added.has(tagName), `an added ${tagName}`).toBe(false)

			const after = (await target.document.query.getSnapshot({ as: 'xml' })) as string
			for (const localName of [
				'SubFunction',
				'FunctionRef',
				'ProcessResourceRef',
				'FunctionalVariant',
			]) {
				expect(countInBay({ xml: after, bay: 'BAY1', localName }), localName).toBe(
					countInBay({ xml: before, bay: 'BAY1', localName }),
				)
			}
			expect(countInBay({ xml: after, bay: 'BAY1', localName: 'FunctionalVariantRef' })).toBe(0)
			expect(
				attributesOf({
					xml: after,
					bay: 'BAY1',
					localName: 'BehaviorDescription',
					name: 'fileReference',
				}),
				"the instance's behaviour file",
			).toEqual(
				attributesOf({
					xml: before,
					bay: 'BAY1',
					localName: 'BehaviorDescription',
					name: 'fileReference',
				}),
			)
		}, 600_000)
	},
)
