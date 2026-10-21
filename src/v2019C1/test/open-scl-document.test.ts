import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
} from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Substation name="S1" ${id}="source-substation"/>
	</SCL>
`

describe('openSclDocument', () => {
	it('imports a third document into the project, its records under the ids its XML names', async () => {
		const { project, source } = await createSclTestProject({ sourceXml })
		const third = await openSclDocument({
			project,
			label: 'previous revision',
			xml: /* xml */ `
				<SCL ${ns} ${id}="third">
					<Substation name="S2" ${id}="third-substation"/>
				</SCL>
			`,
		})

		expect(third.documentId).not.toBe(source.document.documentId)
		const substation = await third.query.getRecord({
			tagName: 'Substation',
			id: 'third-substation',
		})
		expect(substation?.attributes).toContainEqual(
			expect.objectContaining({ name: 'name', value: 'S2' }),
		)
		expect(await project.getDocuments()).toHaveLength(2)
	})

	it('refuses a document a fixture could not be: an attribute its element does not have', async () => {
		const { project } = await createSclTestProject({ sourceXml })

		await expect(
			openSclDocument({
				project,
				label: 'previous revision',
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1" colour="blue"/>
					</SCL>
				`,
			}),
		).rejects.toThrow(/previous revision/)
	})

	it('refuses a reference whose path and uuid disagree, unless the case needs it', async () => {
		const { project } = await createSclTestProject({ sourceXml })
		const xml = /* xml */ `
			<SCL ${ns}>
				<Substation name="S1" uuid="substation-uuid">
					<VoltageLevel name="V1">
						<Bay name="B1">
							<Function name="F1" uuid="function-uuid"/>
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:AllocationRole name="R1" uuid="role-uuid">
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Other" functionUuid="function-uuid"/>
								</eIEC61850-6-100:AllocationRole>
							</Private>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>
		`

		await expect(openSclDocument({ project, label: 'incoherent', xml })).rejects.toThrow(
			/incoherent/,
		)
		const opened = await openSclDocument({
			project,
			label: 'incoherent on purpose',
			xml,
			allowIncoherentReferences: 'the path names a function the file does not hold',
		})
		expect(opened.documentId).toBeDefined()
	})
})
