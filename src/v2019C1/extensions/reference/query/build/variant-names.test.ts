import { describe, expect, it } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { resolveReferencePath } from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const v2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

/**
 * An Application A1 whose role R1 holds `references`, with the variant FV1 (and its sub-variant SV1)
 * and, in the group Subtypes, the variants `P21/01` and `AIS TPO`; an Application A2 with its own variant
 * OTHER.
 */
function variantsXml(references = ''): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Private ${id}="applications" type="eIEC61850-6-100">
					<eIEC61850-6-100:Application ${id}="application" name="A1">
						<eIEC61850-6-100:FunctionRole ${id}="role" name="R1">
							${references}
							<eIEC61850-6-100:FunctionRoleContent ${id}="content" />
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:FunctionalVariant ${id}="variant" name="FV1" uuid="variant-uuid">
							<eIEC61850-6-100:FunctionalSubVariant ${id}="sub-variant" name="SV1" uuid="sub-variant-uuid" />
						</eIEC61850-6-100:FunctionalVariant>
						<eIEC61850-6-100:FunctionalVariantGroup ${id}="group" name="Subtypes">
							<eIEC61850-6-100:FunctionalVariant ${id}="slash-variant" name="P21/01" uuid="slash-variant-uuid" />
							<eIEC61850-6-100:FunctionalVariant ${id}="grouped-variant" name="AIS TPO" uuid="grouped-variant-uuid" />
						</eIEC61850-6-100:FunctionalVariantGroup>
					</eIEC61850-6-100:Application>
					<eIEC61850-6-100:Application ${id}="other-application" name="A2">
						<eIEC61850-6-100:FunctionRole ${id}="other-role" name="R2">
							<eIEC61850-6-100:FunctionRoleContent ${id}="other-content" />
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:FunctionalVariant ${id}="other-variant" name="OTHER" uuid="other-variant-uuid" />
					</eIEC61850-6-100:Application>
				</Private>
			</Substation>
		</SCL>
	`
}

function variantReference(attributes: string): string {
	return `<eIEC61850-6-100:FunctionalVariantRef ${id}="variant-ref" ${attributes} />`
}

describe('a variant reference names the variant of its Application', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act?: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'imported: the name of a variant of the Application -> its uuid, the name kept': {
			sourceXml: variantsXml(variantReference('functionalVariant="FV1"')),
			expectedQueries: [
				'//v2019C1:FunctionalVariantRef[@functionalVariantUuid="variant-uuid" and @functionalVariant="FV1"]',
			],
		},
		'imported: the name of a variant in a group -> its uuid, the name kept': {
			sourceXml: variantsXml(variantReference('functionalVariant="AIS TPO"')),
			expectedQueries: [
				'//v2019C1:FunctionalVariantRef[@functionalVariantUuid="grouped-variant-uuid" and @functionalVariant="AIS TPO"]',
			],
		},
		'imported: the name of a sub-variant -> its uuid, the name kept': {
			sourceXml: variantsXml(variantReference('functionalVariant="SV1"')),
			expectedQueries: [
				'//v2019C1:FunctionalVariantRef[@functionalVariantUuid="sub-variant-uuid" and @functionalVariant="SV1"]',
			],
		},
		'imported: a name holding a "/" -> its uuid, the name kept': {
			sourceXml: variantsXml(variantReference('functionalVariant="P21/01"')),
			expectedQueries: [
				'//v2019C1:FunctionalVariantRef[@functionalVariantUuid="slash-variant-uuid" and @functionalVariant="P21/01"]',
			],
		},
		'imported: the name beside its uuid -> kept as read': {
			sourceXml: variantsXml(
				variantReference(
					'functionalVariant="AIS TPO" functionalVariantUuid="grouped-variant-uuid"',
				),
			),
			expectedQueries: [
				'//v2019C1:FunctionalVariantRef[@functionalVariantUuid="grouped-variant-uuid" and @functionalVariant="AIS TPO"]',
			],
		},
		'imported: the full path an earlier version wrote -> resolved, written as the name': {
			sourceXml: variantsXml(variantReference('functionalVariant="S1/A1/Subtypes/AIS TPO"')),
			expectedQueries: [
				'//v2019C1:FunctionalVariantRef[@functionalVariantUuid="grouped-variant-uuid" and @functionalVariant="AIS TPO"]',
			],
		},
		'imported: the full path an earlier version wrote beside its uuid -> written as the name': {
			allowIncoherentReferences:
				'a file an earlier version wrote, a path beside the uuid, is what is under test',
			sourceXml: variantsXml(
				variantReference(
					'functionalVariant="S1/A1/FV1/SV1" functionalVariantUuid="sub-variant-uuid"',
				),
			),
			expectedQueries: [
				'//v2019C1:FunctionalVariantRef[@functionalVariantUuid="sub-variant-uuid" and @functionalVariant="SV1"]',
			],
		},
		'imported: the name of a variant of another Application -> left without uuid': {
			sourceXml: variantsXml(variantReference('functionalVariant="OTHER"')),
			expectedQueries: [
				'//v2019C1:FunctionalVariantRef[@functionalVariant="OTHER" and not(@functionalVariantUuid)]',
			],
		},
		'the variant is renamed -> its references write the new name': {
			sourceXml: variantsXml(
				variantReference(
					'functionalVariant="AIS TPO" functionalVariantUuid="grouped-variant-uuid"',
				),
			),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'FunctionalVariant', id: 'grouped-variant' },
						{ attributes: { name: 'GIS TPO' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:FunctionalVariantRef[@functionalVariant="GIS TPO"]'],
		},
		'the Application and its group are renamed -> the names stay': {
			sourceXml: variantsXml(
				variantReference(
					'functionalVariant="AIS TPO" functionalVariantUuid="grouped-variant-uuid"',
				),
			),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'Application', id: 'application' },
						{ attributes: { name: 'A9' } },
					)
					await tx.update(
						{ tagName: 'FunctionalVariantGroup', id: 'group' },
						{ attributes: { name: 'Renamed subtypes' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:FunctionalVariantRef[@functionalVariant="AIS TPO"]'],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await testCase.act?.(source)
			return { assertOn: 'source' }
		},
	})
})

describe('a variant name resolves through the query', () => {
	const testCases: Record<string, { name: string; expectedId: string | undefined }> = {
		'the name of a variant in a group -> that variant': {
			name: 'AIS TPO',
			expectedId: 'grouped-variant',
		},
		'the name of a sub-variant -> that sub-variant': { name: 'SV1', expectedId: 'sub-variant' },
		'a name holding a "/" -> that variant': { name: 'P21/01', expectedId: 'slash-variant' },
		'the full path an earlier version wrote -> that variant': {
			name: 'S1/A1/Subtypes/AIS TPO',
			expectedId: 'grouped-variant',
		},
		'the name of a variant of another Application -> nothing': {
			name: 'OTHER',
			expectedId: undefined,
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const { source } = await createSclTestProject({ sourceXml: variantsXml() })
			await source.document.transaction(async (tx) => {
				const variantRef = await tx.addChild(
					{ tagName: 'FunctionRole', id: 'role' },
					{
						tagName: 'FunctionalVariantRef',
						namespace: v2019C1,
						attributes: { functionalVariant: testCase.name },
					},
				)
				const resolved = await resolveReferencePath(tx, variantRef as never, 'functionalVariant')
				expect(resolved?.record.id).toBe(testCase.expectedId)
				// added last in its role, after the role's content, where the schema does not let it sit: it
				// is removed before the document is checked
				await tx.delete(variantRef)
			})
		})
	}
})
