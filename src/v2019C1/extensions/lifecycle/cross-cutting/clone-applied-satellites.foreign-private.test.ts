import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A bay whose SCL Private holds a vendor Private (another namespace), which holds a variable applying to its function. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="sub" name="S1" uuid="sub-uuid">
			<VoltageLevel ${id}="vl" name="V1" uuid="vl-uuid">
				<Bay ${id}="bay" name="B1" uuid="bay-uuid">
					<Private ${id}="private" type="eIEC61850-6-100">
						<v:Private xmlns:v="urn:vendor" ${id}="vendor-private" type="eIEC61850-6-100">
							<eIEC61850-6-100:Variable ${id}="variable" name="VX" value="1" uuid="variable-uuid">
								<eIEC61850-6-100:VariableApplyTo ${id}="apply-to" element="S1/V1/B1/Prot" elementUuid="function-uuid"/>
							</eIEC61850-6-100:Variable>
						</v:Private>
					</Private>
					<Function ${id}="function" name="Prot" uuid="function-uuid"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const targetXml = /* xml */ `<SCL ${ns} ${id}="target-root"/>`

/** The tags above a record, nearest first, every stored level kept. */
async function storedChain(params: {
	query: Core.Query<Config>
	record: Scl.Ref<Scl.ElementsOf>
}): Promise<string[]> {
	const ancestors = await params.query.findAncestors(params.record, { unwrap: [] })
	return ancestors.map(function tagOf(ancestor) {
		return ancestor.tagName
	})
}

describe('extract.ssd - a variable held through a vendor Private', () => {
	it('the bay extracted → the variable placed once, in the SCL Private of the bay', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		await target.document.transaction(async function extract(tx) {
			await tx.lifecycle.extract.ssd({
				sourceQuery: source.document.query,
				scopeRef: { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>,
				tool: 'TEST',
				who: 'test',
			})
		})
		const query = target.document.query as Core.Query<Config>
		const variables = await query.getRecordsByTagName('Variable')

		const chain = await storedChain({ query, record: variables[0] as Scl.Ref<Scl.ElementsOf> })

		expect(variables).toHaveLength(1)
		expect(chain).toEqual(['Private', 'Bay', 'VoltageLevel', 'Substation', 'SCL'])
	})
})
