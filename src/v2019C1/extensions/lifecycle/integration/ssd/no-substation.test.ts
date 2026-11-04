import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { readDiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { reportSsd } from '@/v2019C1/extensions/lifecycle/report/query'
import { ssd as updateSsd } from '@/v2019C1/extensions/lifecycle/update/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** An SSD holding no process section. */
const emptySsd = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="empty" uuid="empty-file-uuid" version="0" revision="1" ${id}="source-header"/>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`
const projectSubstation = {
	tagName: 'Substation',
	id: 'project-substation',
} as Scl.Ref<'Substation'>

// An SSD with no substation holds nothing to place: the verbs called with no scope say so.
describe('ssd verbs on a file holding no substation, no scope named', () => {
	it('the report lists nothing; the update writes nothing', async function reportAndUpdateNothing() {
		const { source, target } = await createSclTestProject({
			sourceXml: emptySsd,
			targetXml: projectXml,
		})
		if (!target) throw new Error('target required')
		const before = await target.document.query.getSnapshot({ as: 'xml' })
		const reported = await reportSsd(target.document.query, {
			sourceQuery: source.document.query,
			diffPolicy: readDiffPolicy({}),
			targetParent: projectSubstation,
		})
		expect({ instances: reported.instances, templateRoots: reported.templateInstances }).toEqual({
			instances: [],
			templateRoots: [],
		})
		const written = await target.document.transaction(async function updateFromNothing(tx) {
			return updateSsd(tx, { sourceQuery: source.document.query, targetParent: projectSubstation })
		})
		expect(written).toEqual({ applications: [], functions: [] })
		const after = await target.document.query.getSnapshot({ as: 'xml' })
		expect(after).toBe(before)
	})

	it('the instantiate is refused: the template holds nothing to instantiate', async function refuseNothing() {
		const { source, target } = await createSclTestProject({
			sourceXml: emptySsd,
			targetXml: projectXml,
		})
		if (!target) throw new Error('target required')
		const placed = target.document.transaction(async function instantiateNothing(tx) {
			await instantiateSsd(tx, {
				sourceQuery: source.document.query,
				targetParent: projectSubstation,
			})
		})
		const caught = await placed.catch((error: unknown) => error)
		const refusal = toDialecteError(caught)
		expect(refusal?.key).toBe('TEMPLATE_ROOT_NOT_FOUND')
	})
})
