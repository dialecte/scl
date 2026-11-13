import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SourceRoot } from './source-root.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { expected: SourceRoot<'ied'> }

// What an IED file holds to place: the one IED, none, or several in document order. Never throws on the shape of a file.
describe('query.lifecycle.sourceRoot.ied', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'one IED → found': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<IED name="P1" uuid="ied-p1-uuid" ${id}="ied-p1">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
			expected: { kind: 'found', ref: { tagName: 'IED', id: 'ied-p1' } },
		},
		'no IED → none, a substation alone is not an IED': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="S1" ${id}="substation-1"/>
					<!-- no IED -->
				</SCL>
			`,
			expected: { kind: 'none' },
		},
		'two IEDs → several, in document order whatever their names and ids': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<IED name="Z9" uuid="ied-z9-uuid" ${id}="ied-b">
						<AccessPoint name="AP1"/>
					</IED>
					<IED name="A1" uuid="ied-a1-uuid" ${id}="ied-a">
						<AccessPoint name="AP1"/>
					</IED>
				</SCL>
			`,
			expected: {
				kind: 'several',
				candidates: [
					{ ref: { tagName: 'IED', id: 'ied-b' }, name: 'Z9', linked: [] },
					{ ref: { tagName: 'IED', id: 'ied-a' }, name: 'A1', linked: [] },
				],
			},
		},
	}

	async function act({ source, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		await expect(source.query.lifecycle.sourceRoot.ied()).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
