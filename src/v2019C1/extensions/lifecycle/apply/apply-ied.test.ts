import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase

// An IED is reported, not yet written: its apply is refused on either track, nothing staged, the project unchanged.
describe('tx.lifecycle.apply - an IED', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the first placement of the IED with its source files reported on the fast track → refused, the project still without it':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="isd-root">
					<IED name="P1" uuid="20000000-0000-4000-8000-000000000001" ${id}="isd-ied">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="project-root">
					<Substation name="S1" ${id}="project-substation"/>
					<!-- no IED -->
				</SCL>
			`,
				expectedQueries: ['/default:SCL[count(default:IED)=0]/default:Substation[@name="S1"]'],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = {
			verb: 'ied',
			sourceQuery: source.query,
			ref: { tagName: 'IED', id: 'isd-ied' } as Scl.Ref<'IED'>,
			anchor: { tagName: 'SCL', id: 'project-root' } as Scl.Ref<'SCL'>,
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		await target.transaction(async function applyIed(tx) {
			await expect(tx.lifecycle.apply({ ...lifecycle, report })).rejects.toMatchObject({
				cause: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'verb', value: 'ied' } },
			})
			expect(tx.getStagedOperations()).toEqual([])
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
