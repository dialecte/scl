import { ssd } from './ssd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A fork keeps the file's uuids: a function of the unit standing on its own that the project already holds by its uuid
// (a fork placed again) is not written a second time, wherever the project holds it.
describe('instantiate.ssd - a fork of a bay whose own function the project holds by uuid', () => {
	const testCases: SclTest.TestCases = {
		'the project holds a function of the bay standing on its own, of its uuid → it is not written again':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="TEMPLATE" ${id}="substation-s">
						<VoltageLevel name="TEMPLATE" uuid="voltage-level-source-uuid" ${id}="voltage-level-s">
							<Bay name="B9" uuid="bay-source-uuid" ${id}="bay-s">
								<Function name="F_S" uuid="f-s-source-uuid" ${id}="f-s-s"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Header id="project" uuid="project-uuid" ${id}="header-t"/>
					<Substation name="S1" ${id}="substation-t">
						<VoltageLevel name="V1" uuid="project-voltage-level-uuid" ${id}="voltage-level-t">
							<Function name="F_S" uuid="f-s-source-uuid" ${id}="f-s-t"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				expectedQueries: [
					'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B9"][@uuid="bay-source-uuid"][not(default:Function)]',
					'/default:SCL[count(.//default:Function)=1]',
				],
			},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function forkTheBay(tx) {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef: { tagName: 'Bay', id: 'bay-s' },
				targetParent: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
				// the template's voltage level lands on the project's
				decisionMappings: new Map([
					['voltage-level-s', { existing: { tagName: 'VoltageLevel', id: 'voltage-level-t' } }],
				]),
				scenario: 'fork',
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
