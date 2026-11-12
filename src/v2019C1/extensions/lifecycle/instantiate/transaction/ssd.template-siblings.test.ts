import { ssd } from './ssd'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * A level of a template holds at most one element named TEMPLATE: a template with several is not a valid file, and
 * nothing tells which of them to place. It is refused before anything is written.
 */
describe('instantiate.ssd - a level of the template holding several elements named TEMPLATE', () => {
	type RefusalTestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The element of the template the consumer names; none: read from the file. */
		scopeRef?: Scl.Ref<'Substation'>
		expectedRefusal: { key: string; meta: unknown }
	}

	const targetXml = /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Header id="project" uuid="project-uuid" ${id}="header-t"/>
			<Substation name="S1" ${id}="substation-t"/>
		</SCL>
	`

	const testCases: SclTest.TestCases<RefusalTestCase> = {
		'a substation of the template holding two voltage levels named TEMPLATE → refused, naming the substation and both, nothing written':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-1-s">
								<Bay name="B1" ${id}="bay-1-s"/>
							</VoltageLevel>
							<VoltageLevel name="TEMPLATE" ${id}="voltage-level-2-s">
								<Bay name="B2" ${id}="bay-2-s"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml,
				expectedRefusal: {
					key: 'SSD_TEMPLATE_NOT_UNIQUE',
					meta: {
						parent: { tagName: 'Substation', id: 'substation-s', name: 'TEMPLATE' },
						duplicates: [
							{ tagName: 'VoltageLevel', id: 'voltage-level-1-s', name: 'TEMPLATE' },
							{ tagName: 'VoltageLevel', id: 'voltage-level-2-s', name: 'TEMPLATE' },
						],
					},
				},
				// the project keeps only its own substation
				unexpectedQueries: ['//default:Bay', '//default:VoltageLevel'],
			},
		'a template file holding two substations named TEMPLATE → refused, naming the file and both, nothing written':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-1-s">
							<VoltageLevel name="V1" ${id}="voltage-level-1-s"/>
						</Substation>
						<Substation name="TEMPLATE" ${id}="substation-2-s">
							<VoltageLevel name="V2" ${id}="voltage-level-2-s"/>
						</Substation>
					</SCL>
				`,
				targetXml,
				expectedRefusal: {
					key: 'SSD_TEMPLATE_NOT_UNIQUE',
					meta: {
						parent: { tagName: 'SCL', id: 'ssd' },
						duplicates: [
							{ tagName: 'Substation', id: 'substation-1-s', name: 'TEMPLATE' },
							{ tagName: 'Substation', id: 'substation-2-s', name: 'TEMPLATE' },
						],
					},
				},
				// the project keeps only its own substation
				unexpectedQueries: ['//default:VoltageLevel'],
			},
		'one of two substations named TEMPLATE named by the consumer → refused the same, nothing written':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-1-s">
							<VoltageLevel name="V1" ${id}="voltage-level-1-s"/>
						</Substation>
						<Substation name="TEMPLATE" ${id}="substation-2-s">
							<VoltageLevel name="V2" ${id}="voltage-level-2-s"/>
						</Substation>
					</SCL>
				`,
				targetXml,
				scopeRef: { tagName: 'Substation', id: 'substation-2-s' },
				expectedRefusal: {
					key: 'SSD_TEMPLATE_NOT_UNIQUE',
					meta: {
						parent: { tagName: 'SCL', id: 'ssd' },
						duplicates: [
							{ tagName: 'Substation', id: 'substation-1-s', name: 'TEMPLATE' },
							{ tagName: 'Substation', id: 'substation-2-s', name: 'TEMPLATE' },
						],
					},
				},
				// the project keeps only its own substation
				unexpectedQueries: ['//default:VoltageLevel'],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<RefusalTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		const targetParent = { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>
		const { outcome, staged } = await target.transaction(async function refuse(tx) {
			const caught = await ssd(tx, {
				sourceQuery: source.query,
				targetParent,
				scopeRef: testCase.scopeRef,
			}).catch(function caught(error: unknown) {
				return error
			})
			return { outcome: caught, staged: tx.getStagedOperations() }
		})
		const refusal = toDialecteError(outcome)
		expect({ key: refusal?.key, meta: refusal?.meta }).toEqual(testCase.expectedRefusal)
		expect(staged).toEqual([])

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
