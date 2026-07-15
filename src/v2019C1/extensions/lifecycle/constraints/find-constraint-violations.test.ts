import { findConstraintViolations } from './find-constraint-violations'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A Bay whose two Functions share the name "Dup" (violates uniqueChildNameInBay),
// and a clean Bay whose children are all uniquely named.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="sub">
			<VoltageLevel name="V1" ${id}="vl">
				<Bay name="Dirty" ${id}="dirty">
					<Function name="Dup" uuid="d1" ${id}="d1"/>
					<Function name="Dup" uuid="d2" ${id}="d2"/>
				</Bay>
				<Bay name="Clean" ${id}="clean">
					<Function name="A" uuid="a" ${id}="a"/>
					<Function name="B" uuid="b" ${id}="b"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

type TestCase = SclTest.BaseXmlTestCase

describe('findConstraintViolations (subtree validation)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'walks a subtree and reports every scoped-uniqueness violation': { sourceXml },
	}

	async function act({ source }: SclTest.ActParams<TestCase>): Promise<void> {
		const query = source.query

		// the dirty bay: both duplicate Functions collide -> two violations
		const dirty = await findConstraintViolations(query, {
			ref: { tagName: 'Bay', id: 'dirty' } as Scl.Ref<'Bay'>,
		})
		expect(dirty).toHaveLength(2)
		expect(dirty.every((violation) => violation.constraint === 'uniqueChildNameInBay')).toBe(true)

		// the clean bay: no violations
		const clean = await findConstraintViolations(query, {
			ref: { tagName: 'Bay', id: 'clean' } as Scl.Ref<'Bay'>,
		})
		expect(clean).toHaveLength(0)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
