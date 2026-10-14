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
 * A Function F1 holding a trip LNode PTRC1 (input Trip) and, in its SubFunction SF1, a breaker
 * XCBR1 (output Oper); an Application whose FunctionRef points at F1 and holds an empty SignalRole.
 */
function functionXml(signalRole = ''): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Function ${id}="function" name="F1" uuid="function-uuid">
					<LNode ${id}="trip" uuid="trip-uuid" iedName="None" lnClass="PTRC" lnInst="1">
						<Private ${id}="trip-private" type="eIEC61850-6-100">
							<eIEC61850-6-100:LNodeInputs ${id}="inputs">
								<eIEC61850-6-100:SourceRef ${id}="source-ref" uuid="source-ref-uuid" input="Trip" />
							</eIEC61850-6-100:LNodeInputs>
						</Private>
					</LNode>
					<SubFunction ${id}="sub-function" name="SF1">
						<LNode ${id}="breaker" uuid="breaker-uuid" iedName="None" lnClass="XCBR" lnInst="1">
							<Private ${id}="breaker-private" type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
									<eIEC61850-6-100:ControlRef ${id}="control-ref" uuid="control-ref-uuid" output="Oper" />
								</eIEC61850-6-100:LNodeOutputs>
							</Private>
						</LNode>
					</SubFunction>
				</Function>
				<Private ${id}="application-private" type="eIEC61850-6-100">
					<eIEC61850-6-100:Application ${id}="application" name="A1">
						<eIEC61850-6-100:FunctionRole ${id}="role" name="R1">
							<eIEC61850-6-100:FunctionRoleContent ${id}="content">
								<eIEC61850-6-100:FunctionRef ${id}="function-ref" function="S1/F1" functionUuid="function-uuid">
									<eIEC61850-6-100:SignalRole ${id}="signal-role" name="Signals">${signalRole}</eIEC61850-6-100:SignalRole>
								</eIEC61850-6-100:FunctionRef>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
					</eIEC61850-6-100:Application>
				</Private>
			</Substation>
		</SCL>
	`
}

describe('the references of a signal role are relative to their Function', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act?: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNodeInputRef is created with its uuid -> its path from the Function down, the Function left out':
			{
				sourceXml: functionXml(),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.addChild(
							{ tagName: 'SignalRole', id: 'signal-role' },
							{
								tagName: 'LNodeInputRef',
								namespace: v2019C1,
								attributes: { sourceRefUuid: 'source-ref-uuid' },
							},
						)
					})
				},
				expectedQueries: ['//v2019C1:LNodeInputRef[@sourceRef="PTRC1/Trip"]'],
			},
		'an LNodeOutputRef to a ControlRef in a SubFunction -> the SubFunction is part of its path': {
			sourceXml: functionXml(),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'SignalRole', id: 'signal-role' },
						{
							tagName: 'LNodeOutputRef',
							namespace: v2019C1,
							attributes: { controlRefUuid: 'control-ref-uuid' },
						},
					)
				})
			},
			expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="SF1/XCBR1/Oper"]'],
		},
		'an LNodeDataRef is created with its uuid and data names -> LNode path from the Function, then the data':
			{
				sourceXml: functionXml(),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.addChild(
							{ tagName: 'SignalRole', id: 'signal-role' },
							{
								tagName: 'LNodeDataRef',
								namespace: v2019C1,
								attributes: { lnodeUuid: 'breaker-uuid', doName: 'Pos', daName: 'stVal' },
							},
						)
					})
				},
				expectedQueries: ['//v2019C1:LNodeDataRef[@data="SF1/XCBR1.Pos.stVal"]'],
			},
		'the Function is renamed -> the relative paths stay': {
			sourceXml: functionXml(
				`<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1/Trip" sourceRefUuid="source-ref-uuid" />`,
			),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'Function', id: 'function' }, { attributes: { name: 'F9' } })
				})
			},
			expectedQueries: [
				'//v2019C1:FunctionRef[@function="S1/F9"]',
				'//v2019C1:LNodeInputRef[@sourceRef="PTRC1/Trip"]',
			],
		},
		'the SubFunction is renamed -> the paths below it follow': {
			sourceXml: functionXml(
				`<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1/Oper" controlRefUuid="control-ref-uuid" />`,
			),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'SubFunction', id: 'sub-function' },
						{ attributes: { name: 'SF2' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="SF2/XCBR1/Oper"]'],
		},
		'imported: a relative path alone -> resolved to its SourceRef': {
			sourceXml: functionXml(
				`<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1/Trip" />`,
			),
			expectedQueries: [
				'//v2019C1:LNodeInputRef[@sourceRef="PTRC1/Trip"][@sourceRefUuid="source-ref-uuid"]',
			],
		},
		'imported: the absolute path an earlier version wrote -> resolved, written relative': {
			sourceXml: functionXml(
				`<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="S1/F1/SF1/XCBR1.Oper" />
				<eIEC61850-6-100:LNodeDataRef ${id}="data-ref" data="S1/F1/SF1/XCBR1.Pos.stVal" doName="Pos" daName="stVal" />`,
			),
			expectedQueries: [
				'//v2019C1:LNodeOutputRef[@controlRef="SF1/XCBR1/Oper"][@controlRefUuid="control-ref-uuid"]',
				'//v2019C1:LNodeDataRef[@data="SF1/XCBR1.Pos.stVal"][@lnodeUuid="breaker-uuid"]',
			],
		},
		'imported: an absolute path next to its uuid -> written relative': {
			sourceXml: functionXml(
				`<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="S1/F1/PTRC1.Trip" sourceRefUuid="source-ref-uuid" />`,
			),
			expectedQueries: ['//v2019C1:LNodeInputRef[@sourceRef="PTRC1/Trip"]'],
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

describe('a relative signal role path resolves through the query', () => {
	it('an LNodeInputRef holding only "PTRC1/Trip" -> its SourceRef', async () => {
		const { project, source } = await createSclTestProject({ sourceXml: functionXml() })
		try {
			await source.document.transaction(async (tx) => {
				const inputRef = await tx.addChild(
					{ tagName: 'SignalRole', id: 'signal-role' },
					{ tagName: 'LNodeInputRef', namespace: v2019C1, attributes: { sourceRef: 'PTRC1/Trip' } },
				)
				const resolved = await resolveReferencePath(tx, inputRef as never, 'sourceRef')
				expect(resolved?.record.id).toBe('source-ref')
			})
		} finally {
			await project.destroy()
		}
	})
})
