import { reconcile } from './reconcile'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Function name="Prot" uuid="prot-uuid" ${id}="fn-s">
				<SubFunction name="Kept" uuid="kept-uuid" ${id}="sf-kept"/>
				<SubFunction name="Left" uuid="left-uuid" ${id}="sf-left"/>
			</Function>
		</Substation>
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="sub-t">
			<Function name="Prot" uuid="prot-inst" templateUuid="prot-uuid" ${id}="fn-t"/>
		</Substation>
	</SCL>
`

async function reconciled(notSelected?: ReadonlySet<string>): Promise<string[]> {
	const { source, target } = await createSclTestProject({ sourceXml, targetXml })
	if (!target) throw new Error('target required')
	await target.document.transaction(async (tx) => {
		await reconcile(tx, {
			sourceQuery: source.document.query,
			sourceRootRef: { tagName: 'Function', id: 'fn-s' } as Scl.Ref<'Function'>,
			instanceRootRef: { tagName: 'Function', id: 'fn-t' } as Scl.Ref<'Function'>,
			matchKey: 'templateUuid',
			identityMode: 'stamp-template',
			bumpsCollisions: true,
			removalBase: { kind: 'lineage' },
			namesFollow: 'project',
			notSelected,
		})
	})
	const subFunctions = await target.document.query.getRecordsByTagName('SubFunction')
	return subFunctions
		.map(
			(subFunction) =>
				subFunction.attributes.find((attribute) => attribute.name === 'name')?.value ?? '',
		)
		.sort()
}

describe('reconcile without a report: what the selection of variants leaves out', () => {
	it('is not added', async () => {
		expect(await reconciled(new Set(['sf-left']))).toEqual(['Kept'])
	})

	it('nothing left out: every source child is added', async () => {
		expect(await reconciled()).toEqual(['Kept', 'Left'])
	})
})
