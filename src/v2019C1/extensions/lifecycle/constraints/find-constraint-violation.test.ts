import { findConstraintViolation } from './find-constraint-violation'
import { resolveUniqueValue } from './resolve-unique-value'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A Bay already holding two named Functions (Prot, Prot_1) plus a Private-wrapped
// Application (CB). Bay children must be unique by name (schema constraint
// uniqueChildNameInBay, selector wildcard, fields [name]); Private is transparent,
// so the Application counts as a Bay child for the constraint.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="sub">
			<VoltageLevel name="V1" ${id}="vl">
				<Bay name="B1" ${id}="bay">
					<Function name="Prot" uuid="p1" ${id}="p1"/>
					<Function name="Prot_1" uuid="p2" ${id}="p2"/>
					<Private type="eIEC61850-6-100" ${id}="priv">
						<eIEC61850-6-100:Application name="CB" uuid="a1" ${id}="a1"/>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

const bayRef = { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase

describe('findConstraintViolation + resolveUniqueValue', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'detects a name collision and resolves a unique value (generic over the attribute)': {
			sourceXml,
		},
	}

	async function act({ source }: SclTest.ActParams<TestCase>): Promise<void> {
		const query = source.query

		// collision: a new Function named "Prot" clashes with the existing one
		const violation = await findConstraintViolation(query, {
			parentRef: bayRef,
			childTag: 'Function',
			candidate: { name: 'Prot' },
		})
		expect(violation?.constraint).toBe('uniqueChildNameInBay')
		expect(violation?.fields).toEqual(['name'])
		expect(violation?.offendingId).toBe('p1')

		// no collision: a free name
		expect(
			await findConstraintViolation(query, {
				parentRef: bayRef,
				childTag: 'Function',
				candidate: { name: 'Other' },
			}),
		).toBeNull()

		// Private is transparent: a new Application named "CB" clashes with the
		// Private-wrapped Application already under the Bay
		const privateCollision = await findConstraintViolation(query, {
			parentRef: bayRef,
			childTag: 'Application',
			candidate: { name: 'CB' },
		})
		expect(privateCollision?.offendingId).toBe('a1')

		// resolve: "Prot" and "Prot_1" taken -> "Prot_2"
		expect(
			await resolveUniqueValue(query, {
				parentRef: bayRef,
				childTag: 'Function',
				candidate: { name: 'Prot' },
				attr: 'name',
			}),
		).toBe('Prot_2')

		// resolve: an already-unique candidate is returned unchanged
		expect(
			await resolveUniqueValue(query, {
				parentRef: bayRef,
				childTag: 'Function',
				candidate: { name: 'Fresh' },
				attr: 'name',
			}),
		).toBe('Fresh')

		// resolve with a consumer decorator (affix scheme)
		expect(
			await resolveUniqueValue(query, {
				parentRef: bayRef,
				childTag: 'Function',
				candidate: { name: 'Prot' },
				attr: 'name',
				decorate: ({ base, attempt }) => `${base}_Fn_${attempt}`,
			}),
		).toBe('Prot_Fn_1')
	}

	runSclTestCases.withoutExport({ testCases, act })
})
