import { pruneEmptyContainers } from './prune-empty-containers'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

describe('pruneEmptyContainers', () => {
	const testCases: SclTest.TestCases = {
		'FunctionCategory with no children → deleted': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionCategory name="Cat1"/>
						</Private>
					</Substation>
				</SCL>
			`,
			unexpectedQueries: ['//v2019C1:FunctionCategory'],
		},

		'FunctionCategory with children → kept': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionCategory name="Cat1">
								<eIEC61850-6-100:FunctionCatRef function="S1/Prot" functionUuid="func-uuid-1"/>
							</eIEC61850-6-100:FunctionCategory>
						</Private>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:FunctionCategory[@name="Cat1"]'],
		},

		'PowerSystemRelations with no children → deleted': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<Function name="F1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:PowerSystemRelations/>
							</Private>
						</Function>
					</Substation>
				</SCL>
			`,
			unexpectedQueries: ['//v2019C1:PowerSystemRelations'],
		},

		'Private with no children → deleted': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<Private type="eIEC61850-6-100"/>
					</Substation>
				</SCL>
			`,
			unexpectedQueries: ['//default:Private'],
		},

		'Private with children → kept': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionRef function="S1/Prot" functionUuid="func-uuid-1"/>
						</Private>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//default:Private[@type="eIEC61850-6-100"]'],
		},

		'mixed: empty FunctionCategory deleted, Private with children kept': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionCategory name="Empty"/>
							<eIEC61850-6-100:FunctionRef function="S1/Prot" functionUuid="func-uuid-1"/>
						</Private>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//default:Private', '//v2019C1:FunctionRef[@functionUuid="func-uuid-1"]'],
			unexpectedQueries: ['//v2019C1:FunctionCategory[@name="Empty"]'],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.document.transaction(async (tx) => {
				await pruneEmptyContainers(tx)
			})
			return { assertDatabaseName: source.databaseName }
		},
	})
})
