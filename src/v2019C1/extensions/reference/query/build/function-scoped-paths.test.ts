import { createDiagnostic } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { INCOHERENT_REFERENCE_RELATED, SCL_IMPORT_DIAGNOSTICS } from '@/v2019C1/errors'
import { resolveReferencePath } from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclImportDiagnostic } from '@/v2019C1/errors'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const v2019C1 = SCL_DIALECTE_CONFIG.namespaces.v2019C1

/** The source of the test project the files are imported into: a document holding nothing. */
const EMPTY_SCL = /* xml */ `<SCL ${ns}></SCL>`

/** The attributes of a FunctionRef naming the Function F1, or its SubFunction SF1, of the fixtures. */
const FUNCTION_REF_TO_F1 = 'function="S1/F1" functionUuid="function-uuid"'
const FUNCTION_REF_TO_SF1 = 'function="S1/F1/SF1" functionUuid="sub-function-uuid"'
/** A FunctionRef whose function and functionUuid name no element of the fixtures. */
const FUNCTION_REF_TO_NOTHING = 'function="S1/F9" functionUuid="missing-function-uuid"'

/**
 * A Function F1 holding a trip LNode PTRC1 (input Trip) and, in its SubFunction SF1, a breaker
 * XCBR1 (output Oper); an Application whose FunctionRef points at F1 (or at what `functionRef` names)
 * and holds a SignalRole.
 */
function functionXml(params: { signalRole?: string; functionRef?: string } = {}): string {
	const { signalRole = '', functionRef = FUNCTION_REF_TO_F1 } = params
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
					<SubFunction ${id}="sub-function" name="SF1" uuid="sub-function-uuid">
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
								<eIEC61850-6-100:FunctionRef ${id}="function-ref" ${functionRef}>
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

/**
 * A Function F1 whose SubFunction SF1 holds a distance LNode PDIS1: the only input AmpSv (instance 1,
 * data attribute instMag.i), two Op inputs (instances 1 and 2, data attribute general) and the only
 * output Trip (instance 1); an Application whose FunctionRef points at F1 and holds a SignalRole.
 */
function distanceXml(params: { signalRole?: string } = {}): string {
	const { signalRole = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Function ${id}="function" name="F1" uuid="function-uuid">
					<SubFunction ${id}="sub-function" name="SF1">
						<LNode ${id}="distance" uuid="distance-uuid" iedName="None" lnClass="PDIS" lnInst="1">
							<Private ${id}="distance-private" type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs ${id}="inputs">
									<eIEC61850-6-100:SourceRef ${id}="amp" uuid="amp-uuid" input="AmpSv" inputInst="1" pDA="instMag.i" />
									<eIEC61850-6-100:SourceRef ${id}="op-1" uuid="op-1-uuid" input="Op" inputInst="1" pDA="general" />
									<eIEC61850-6-100:SourceRef ${id}="op-2" uuid="op-2-uuid" input="Op" inputInst="2" pDA="general" />
								</eIEC61850-6-100:LNodeInputs>
								<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
									<eIEC61850-6-100:ControlRef ${id}="trip" uuid="trip-uuid" output="Trip" outputInst="1" />
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

/** The application of the fixtures below: its FunctionRef names what `functionRef` gives, its SignalRole holds `signalRole`. */
function applicationXml(params: { functionRef: string; signalRole: string }): string {
	return /* xml */ `
		<Private ${id}="application-private" type="eIEC61850-6-100">
			<eIEC61850-6-100:Application ${id}="application" name="A1">
				<eIEC61850-6-100:FunctionRole ${id}="role" name="R1">
					<eIEC61850-6-100:FunctionRoleContent ${id}="content">
						<eIEC61850-6-100:FunctionRef ${id}="function-ref" ${params.functionRef}>
							<eIEC61850-6-100:SignalRole ${id}="signal-role" name="Signals">${params.signalRole}</eIEC61850-6-100:SignalRole>
						</eIEC61850-6-100:FunctionRef>
					</eIEC61850-6-100:FunctionRoleContent>
				</eIEC61850-6-100:FunctionRole>
			</eIEC61850-6-100:Application>
		</Private>
	`
}

/** The attributes of a FunctionRef naming the SubFunction SF1 of `nestedFunctionXml`. */
const NESTED_REF_TO_SF1 = 'function="S1/F1/SF1" functionUuid="nested-sf1-uuid"'

/**
 * A Function F1 holding a SubFunction SF1 that holds a SubFunction SF2, which holds a breaker XCBR1
 * (output Oper); an Application whose FunctionRef points at F1 (or at what `functionRef` names).
 */
function nestedFunctionXml(params: { signalRole?: string; functionRef?: string } = {}): string {
	const { signalRole = '', functionRef = FUNCTION_REF_TO_F1 } = params
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Function ${id}="function" name="F1" uuid="function-uuid">
					<SubFunction ${id}="sf1" name="SF1" uuid="nested-sf1-uuid">
						<SubFunction ${id}="sf2" name="SF2" uuid="nested-sf2-uuid">
							<LNode ${id}="breaker" uuid="breaker-uuid" iedName="None" lnClass="XCBR" lnInst="1">
								<Private ${id}="breaker-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
										<eIEC61850-6-100:ControlRef ${id}="control-ref" uuid="control-ref-uuid" output="Oper" />
									</eIEC61850-6-100:LNodeOutputs>
								</Private>
							</LNode>
						</SubFunction>
					</SubFunction>
				</Function>
				${applicationXml({ functionRef, signalRole })}
			</Substation>
		</SCL>
	`
}

/** The attributes of a FunctionRef naming the EqFunction EF1, or its EqSubFunction ESF1, of `equipmentFunctionXml`. */
const FUNCTION_REF_TO_EF1 = 'function="S1/V1/B1/QA1/EF1" functionUuid="eq-function-uuid"'
const FUNCTION_REF_TO_ESF1 = 'function="S1/V1/B1/QA1/EF1/ESF1" functionUuid="eq-sub-function-uuid"'

/**
 * A breaker QA1 holding an EqFunction EF1, which holds a breaker LNode XCBR1 (output Oper) and an
 * EqSubFunction ESF1 holding a trip LNode PTRC1 (input Trip); an Application whose FunctionRef points
 * at what `functionRef` names.
 */
function equipmentFunctionXml(params: { signalRole?: string; functionRef?: string } = {}): string {
	const { signalRole = '', functionRef = FUNCTION_REF_TO_EF1 } = params
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<VoltageLevel ${id}="voltage-level" name="V1">
					<Bay ${id}="bay" name="B1">
						<ConductingEquipment ${id}="equipment" name="QA1" type="CBR">
							<EqFunction ${id}="eq-function" name="EF1" uuid="eq-function-uuid">
								<LNode ${id}="breaker" uuid="breaker-uuid" iedName="None" lnClass="XCBR" lnInst="1">
									<Private ${id}="breaker-private" type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
											<eIEC61850-6-100:ControlRef ${id}="control-ref" uuid="control-ref-uuid" output="Oper" />
										</eIEC61850-6-100:LNodeOutputs>
									</Private>
								</LNode>
								<EqSubFunction ${id}="eq-sub-function" name="ESF1" uuid="eq-sub-function-uuid">
									<LNode ${id}="trip" uuid="trip-uuid" iedName="None" lnClass="PTRC" lnInst="1">
										<Private ${id}="trip-private" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeInputs ${id}="inputs">
												<eIEC61850-6-100:SourceRef ${id}="source-ref" uuid="source-ref-uuid" input="Trip" />
											</eIEC61850-6-100:LNodeInputs>
										</Private>
									</LNode>
								</EqSubFunction>
							</EqFunction>
						</ConductingEquipment>
					</Bay>
				</VoltageLevel>
				${applicationXml({ functionRef, signalRole })}
			</Substation>
		</SCL>
	`
}

/**
 * A Function F1 holding a breaker LNode XCBR1 (output Oper) and its SubFunction SF1, which holds a
 * breaker LNode XCBR1 of its own (output Oper); an Application whose FunctionRef points at what
 * `functionRef` names.
 */
function twinBreakersXml(params: { signalRole?: string; functionRef?: string } = {}): string {
	const { signalRole = '', functionRef = FUNCTION_REF_TO_SF1 } = params
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Function ${id}="function" name="F1" uuid="function-uuid">
					<LNode ${id}="direct-breaker" uuid="direct-breaker-uuid" iedName="None" lnClass="XCBR" lnInst="1">
						<Private ${id}="direct-breaker-private" type="eIEC61850-6-100">
							<eIEC61850-6-100:LNodeOutputs ${id}="direct-outputs">
								<eIEC61850-6-100:ControlRef ${id}="direct-control-ref" uuid="direct-control-ref-uuid" output="Oper" />
							</eIEC61850-6-100:LNodeOutputs>
						</Private>
					</LNode>
					<SubFunction ${id}="sub-function" name="SF1" uuid="sub-function-uuid">
						<LNode ${id}="breaker" uuid="breaker-uuid" iedName="None" lnClass="XCBR" lnInst="1">
							<Private ${id}="breaker-private" type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
									<eIEC61850-6-100:ControlRef ${id}="control-ref" uuid="control-ref-uuid" output="Oper" />
								</eIEC61850-6-100:LNodeOutputs>
							</Private>
						</LNode>
					</SubFunction>
				</Function>
				${applicationXml({ functionRef, signalRole })}
			</Substation>
		</SCL>
	`
}

/**
 * A Function F1 holding a trip LNode PTRC1 with two inputs, "A.B" and "A/B" (in this order); an
 * Application whose FunctionRef points at F1 and holds a SignalRole.
 */
function collidingNamesXml(params: { signalRole?: string } = {}): string {
	const { signalRole = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Function ${id}="function" name="F1" uuid="function-uuid">
					<LNode ${id}="trip" uuid="trip-uuid" iedName="None" lnClass="PTRC" lnInst="1">
						<Private ${id}="trip-private" type="eIEC61850-6-100">
							<eIEC61850-6-100:LNodeInputs ${id}="inputs">
								<eIEC61850-6-100:SourceRef ${id}="dot-input" uuid="dot-input-uuid" input="A.B" />
								<eIEC61850-6-100:SourceRef ${id}="slash-input" uuid="slash-input-uuid" input="A/B" />
							</eIEC61850-6-100:LNodeInputs>
						</Private>
					</LNode>
				</Function>
				${applicationXml({ functionRef: FUNCTION_REF_TO_F1, signalRole })}
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
				sourceXml: functionXml({}),
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
				expectedQueries: ['//v2019C1:LNodeInputRef[@sourceRef="PTRC1.Trip"]'],
			},
		'an LNodeOutputRef to a ControlRef in a SubFunction -> the SubFunction is part of its path': {
			sourceXml: functionXml({}),
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
			expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="SF1/XCBR1.Oper"]'],
		},
		'an LNodeDataRef is created with its uuid and data names -> LNode path from the Function, then the data':
			{
				sourceXml: functionXml({}),
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
			sourceXml: functionXml({
				signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1.Trip" sourceRefUuid="source-ref-uuid" />`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'Function', id: 'function' }, { attributes: { name: 'F9' } })
				})
			},
			expectedQueries: [
				'//v2019C1:FunctionRef[@function="S1/F9"]',
				'//v2019C1:LNodeInputRef[@sourceRef="PTRC1.Trip"]',
			],
		},
		'the Function is renamed, its path written the former way -> the relative path stays, written with "."':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1/Trip" sourceRefUuid="source-ref-uuid" />`,
				}),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'Function', id: 'function' }, { attributes: { name: 'F9' } })
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionRef[@function="S1/F9"]',
					'//v2019C1:LNodeInputRef[@sourceRef="PTRC1.Trip"]',
				],
			},
		'the SubFunction is renamed -> the paths below it follow': {
			sourceXml: functionXml({
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1/Oper" controlRefUuid="control-ref-uuid" />`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'SubFunction', id: 'sub-function' },
						{ attributes: { name: 'SF2' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="SF2/XCBR1.Oper"]'],
		},
		'imported: a relative path written the former way, alone -> resolved to its SourceRef, written with "."':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1/Trip" />`,
				}),
				expectedQueries: [
					'//v2019C1:LNodeInputRef[@sourceRef="PTRC1.Trip"][@sourceRefUuid="source-ref-uuid"]',
				],
			},
		'imported: the absolute path an earlier version wrote -> resolved, written relative': {
			sourceXml: functionXml({
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="S1/F1/SF1/XCBR1.Oper" />
				<eIEC61850-6-100:LNodeDataRef ${id}="data-ref" data="S1/F1/SF1/XCBR1.Pos.stVal" doName="Pos" daName="stVal" />`,
			}),
			expectedQueries: [
				'//v2019C1:LNodeOutputRef[@controlRef="SF1/XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				'//v2019C1:LNodeDataRef[@data="SF1/XCBR1.Pos.stVal"][@lnodeUuid="breaker-uuid"]',
			],
		},
		'imported: an absolute path next to its uuid -> written relative': {
			sourceXml: functionXml({
				signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="S1/F1/PTRC1.Trip" sourceRefUuid="source-ref-uuid" />`,
			}),
			expectedQueries: ['//v2019C1:LNodeInputRef[@sourceRef="PTRC1.Trip"]'],
		},
		'the SubFunction is renamed, its path written with "." -> the paths below it follow': {
			sourceXml: functionXml({
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1.Oper" controlRefUuid="control-ref-uuid" />`,
			}),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'SubFunction', id: 'sub-function' },
						{ attributes: { name: 'SF2' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="SF2/XCBR1.Oper"]'],
		},

		// FunctionRef -> SubFunction: the path starts below SF1, SF1 left out
		'a FunctionRef to a SubFunction: an LNodeOutputRef is created with its uuid -> its path from the SubFunction down':
			{
				sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_SF1 }),
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
				expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"]'],
			},
		'a FunctionRef to a SubFunction: an LNodeDataRef is created with its uuid and data names -> LNode path from the SubFunction, then the data':
			{
				sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_SF1 }),
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
				expectedQueries: ['//v2019C1:LNodeDataRef[@data="XCBR1.Pos.stVal"]'],
			},
		'a FunctionRef to a SubFunction, imported: a uuid alone -> the path written from the SubFunction down':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRefUuid="control-ref-uuid" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'a FunctionRef to a SubFunction, imported: a path from the SubFunction alone -> resolved to its ControlRef':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="XCBR1.Oper" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'a FunctionRef to a SubFunction, imported: a path with "/" before the signal, from the SubFunction, alone -> resolved, written with "."':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="XCBR1/Oper" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'a FunctionRef to a SubFunction, imported: the nearest-Function base with "/" alone -> resolved, written from the SubFunction':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1/Oper" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'a FunctionRef to a SubFunction, imported: the nearest-Function base with "." alone -> resolved, written from the SubFunction':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1.Oper" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'a FunctionRef to a SubFunction, imported: the nearest-Function base with "/" next to its uuid -> written from the SubFunction':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1/Oper" controlRefUuid="control-ref-uuid" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"]'],
			},
		'a FunctionRef to a SubFunction, imported: the nearest-Function base with "." next to its uuid -> written from the SubFunction':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1.Oper" controlRefUuid="control-ref-uuid" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"]'],
			},
		'a FunctionRef to a SubFunction, imported: the absolute path an earlier version wrote -> resolved, written from the SubFunction':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="S1/F1/SF1/XCBR1.Oper" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'a FunctionRef to a SubFunction, imported: an LNode path from the nearest Function, alone -> resolved, written from the SubFunction':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeDataRef ${id}="data-ref" data="SF1/XCBR1.Pos.stVal" doName="Pos" daName="stVal" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeDataRef[@data="XCBR1.Pos.stVal"][@lnodeUuid="breaker-uuid"]',
				],
			},
		'a FunctionRef to a SubFunction, imported: an LNode path from the nearest Function next to its uuid -> written from the SubFunction':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeDataRef ${id}="data-ref" data="SF1/XCBR1.Pos.stVal" lnodeUuid="breaker-uuid" doName="Pos" daName="stVal" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: ['//v2019C1:LNodeDataRef[@data="XCBR1.Pos.stVal"]'],
			},
		'a FunctionRef to a SubFunction, imported: an LNode path from the SubFunction alone -> resolved, kept':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeDataRef ${id}="data-ref" data="XCBR1.Pos.stVal" doName="Pos" daName="stVal" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeDataRef[@data="XCBR1.Pos.stVal"][@lnodeUuid="breaker-uuid"]',
				],
			},

		// the FunctionRef is retargeted: the paths below it follow, whatever the order of the writes
		'a FunctionRef to the Function is retargeted to its SubFunction -> its output path is written from the SubFunction':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1.Oper" controlRefUuid="control-ref-uuid" />`,
				}),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'FunctionRef', id: 'function-ref' },
							{ attributes: { functionUuid: 'sub-function-uuid' } },
						)
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionRef[@function="S1/F1/SF1"]',
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'an output retargeted, then its FunctionRef, in one transaction -> the path relative to the new FunctionRef target':
			{
				sourceXml: twinBreakersXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="S1/F1/XCBR1.Oper" controlRefUuid="direct-control-ref-uuid" />`,
				}),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'LNodeOutputRef', id: 'output-ref' },
							{ attributes: { controlRefUuid: 'control-ref-uuid' } },
						)
						await tx.update(
							{ tagName: 'FunctionRef', id: 'function-ref' },
							{ attributes: { functionUuid: 'function-uuid' } },
						)
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionRef[@function="S1/F1"]',
					'//v2019C1:LNodeOutputRef[@controlRef="SF1/XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'a FunctionRef retargeted, then an output, in one transaction -> the path relative to the new FunctionRef target':
			{
				sourceXml: twinBreakersXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="S1/F1/XCBR1.Oper" controlRefUuid="direct-control-ref-uuid" />`,
				}),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'FunctionRef', id: 'function-ref' },
							{ attributes: { functionUuid: 'function-uuid' } },
						)
						await tx.update(
							{ tagName: 'LNodeOutputRef', id: 'output-ref' },
							{ attributes: { controlRefUuid: 'control-ref-uuid' } },
						)
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionRef[@function="S1/F1"]',
					'//v2019C1:LNodeOutputRef[@controlRef="SF1/XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},

		// a FunctionRef naming nothing: a signal role path is written absolute and read as written
		'a FunctionRef naming nothing: an LNodeOutputRef is created with its uuid -> its absolute path':
			{
				allowIncoherentReferences: 'the FunctionRef names no element',
				sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_NOTHING }),
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
				expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="S1/F1/SF1/XCBR1.Oper"]'],
			},
		'a FunctionRef naming nothing, imported: the absolute path alone -> resolved, the uuid written, the path kept':
			{
				allowIncoherentReferences: 'the FunctionRef names no element',
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="S1/F1/SF1/XCBR1.Oper" />`,
					functionRef: FUNCTION_REF_TO_NOTHING,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="S1/F1/SF1/XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},

		// an LNode of the same name in the Function and in the SubFunction: the base decides
		'twin XCBR1 in the Function and in SF1, a FunctionRef to SF1, imported: a path from SF1 alone -> SF1 breaker output':
			{
				sourceXml: twinBreakersXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="XCBR1.Oper" />`,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'twin XCBR1 in the Function and in SF1, a FunctionRef to SF1, imported: a data path from SF1 alone -> SF1 breaker':
			{
				sourceXml: twinBreakersXml({
					signalRole: `<eIEC61850-6-100:LNodeDataRef ${id}="data-ref" data="XCBR1.Pos.stVal" doName="Pos" daName="stVal" />`,
				}),
				expectedQueries: [
					'//v2019C1:LNodeDataRef[@data="XCBR1.Pos.stVal"][@lnodeUuid="breaker-uuid"]',
				],
			},
		'twin XCBR1 in the Function and in SF1, a FunctionRef to SF1, imported: the path from the nearest Function -> SF1 breaker output, written from SF1':
			{
				sourceXml: twinBreakersXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/XCBR1.Oper" />`,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},
		'a FunctionRef to a SubFunction, the SubFunction is renamed -> the path stays, the FunctionRef follows':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="XCBR1.Oper" controlRefUuid="control-ref-uuid" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'SubFunction', id: 'sub-function' },
							{ attributes: { name: 'SF9' } },
						)
					})
				},
				expectedQueries: [
					'//v2019C1:FunctionRef[@function="S1/F1/SF9"]',
					'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"]',
				],
			},

		// a signal not below the function the FunctionRef names keeps its absolute path
		'a FunctionRef to a SubFunction: an LNodeInputRef to a signal outside it is created with its uuid -> its absolute path':
			{
				sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_SF1 }),
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
				expectedQueries: ['//v2019C1:LNodeInputRef[@sourceRef="S1/F1/PTRC1.Trip"]'],
			},
		'a FunctionRef to a SubFunction, imported: the absolute path of a signal outside it -> resolved, kept absolute':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="S1/F1/PTRC1.Trip" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeInputRef[@sourceRef="S1/F1/PTRC1.Trip"][@sourceRefUuid="source-ref-uuid"]',
				],
			},

		// depth: the path starts below the function the FunctionRef names, every level kept
		'nested SubFunctions, a FunctionRef to the Function: an LNodeOutputRef is created with its uuid -> every SubFunction in its path':
			{
				sourceXml: nestedFunctionXml({}),
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
				expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="SF1/SF2/XCBR1.Oper"]'],
			},
		'nested SubFunctions, a FunctionRef to the outer one: an LNodeOutputRef is created with its uuid -> the inner SubFunction in its path':
			{
				sourceXml: nestedFunctionXml({ functionRef: NESTED_REF_TO_SF1 }),
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
				expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="SF2/XCBR1.Oper"]'],
			},
		'nested SubFunctions, a FunctionRef to the outer one, imported: the nearest-Function base with "/" -> resolved, written from the outer SubFunction':
			{
				sourceXml: nestedFunctionXml({
					signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/SF2/XCBR1/Oper" />`,
					functionRef: NESTED_REF_TO_SF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeOutputRef[@controlRef="SF2/XCBR1.Oper"][@controlRefUuid="control-ref-uuid"]',
				],
			},

		// kinds: EqFunction and EqSubFunction as the function the FunctionRef names
		'a FunctionRef to an EqFunction: an LNodeOutputRef is created with its uuid -> its path from the EqFunction down':
			{
				sourceXml: equipmentFunctionXml({}),
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
				expectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"]'],
			},
		'a FunctionRef to an EqFunction: an LNodeInputRef to a signal in its EqSubFunction is created with its uuid -> the EqSubFunction in its path':
			{
				sourceXml: equipmentFunctionXml({}),
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
				expectedQueries: ['//v2019C1:LNodeInputRef[@sourceRef="ESF1/PTRC1.Trip"]'],
			},
		'a FunctionRef to an EqSubFunction: an LNodeInputRef is created with its uuid -> its path from the EqSubFunction down':
			{
				sourceXml: equipmentFunctionXml({ functionRef: FUNCTION_REF_TO_ESF1 }),
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
				expectedQueries: ['//v2019C1:LNodeInputRef[@sourceRef="PTRC1.Trip"]'],
			},
		'a FunctionRef to an EqSubFunction, imported: the EqFunction-based path with "/" -> resolved, written from the EqSubFunction':
			{
				sourceXml: equipmentFunctionXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="ESF1/PTRC1/Trip" />`,
					functionRef: FUNCTION_REF_TO_ESF1,
				}),
				expectedQueries: [
					'//v2019C1:LNodeInputRef[@sourceRef="PTRC1.Trip"][@sourceRefUuid="source-ref-uuid"]',
				],
			},

		// two inputs of one LNode named "A.B" and "A/B"
		'two inputs named "A.B" and "A/B", imported: a path naming "A/B" -> resolved to it, not to "A.B"':
			{
				sourceXml: collidingNamesXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1.A/B" />`,
				}),
				expectedQueries: [
					'//v2019C1:LNodeInputRef[@sourceRef="PTRC1.A/B"][@sourceRefUuid="slash-input-uuid"]',
				],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async (params) => {
			await params.testCase.act?.(params.source)
			await expectExportedQueries({ act: params })
			return { assertOn: 'source' }
		},
	})
})

describe('a relative signal role path resolves through the query', () => {
	it('an LNodeInputRef holding only "PTRC1/Trip" -> its SourceRef', async () => {
		const { source } = await createSclTestProject({ sourceXml: functionXml({}) })
		await source.document.transaction(async (tx) => {
			const inputRef = await tx.addChild(
				{ tagName: 'SignalRole', id: 'signal-role' },
				{ tagName: 'LNodeInputRef', namespace: v2019C1, attributes: { sourceRef: 'PTRC1/Trip' } },
			)
			const resolved = await resolveReferencePath(tx, inputRef as never, 'sourceRef')
			expect(resolved?.record.id).toBe('source-ref')
		})
	})

	it('an LNodeInputRef holding only "PTRC1.Trip" -> its SourceRef', async () => {
		const { source } = await createSclTestProject({ sourceXml: functionXml({}) })
		let resolvedId: string | undefined
		await source.document.transaction(async (tx) => {
			const inputRef = await tx.addChild(
				{ tagName: 'SignalRole', id: 'signal-role' },
				{ tagName: 'LNodeInputRef', namespace: v2019C1, attributes: { sourceRef: 'PTRC1.Trip' } },
			)
			const resolved = await resolveReferencePath(tx, inputRef as never, 'sourceRef')
			resolvedId = resolved?.record.id
		})
		expect(resolvedId).toBe('source-ref')
	})
})

/**
 * A signal written with its instance and data attribute names one signal even when no other signal
 * of its LNode shares its name, and a path may join the signal to its LNode with "." as an
 * InputVar does: both resolve, and are written again in the form the engine writes.
 */
describe('a signal role path in another form the file may write', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'the only AmpSv written with its instance and data attribute -> resolved, written as its name':
			{
				sourceXml: distanceXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="SF1/PDIS1/AmpSv(1).instMag.i" />`,
				}),
				expectedQueries: [
					'//v2019C1:LNodeInputRef[@sourceRefUuid="amp-uuid"][@sourceRef="SF1/PDIS1.AmpSv"]',
				],
			},
		'the only AmpSv joined to its LNode with "." -> resolved, written with "."': {
			sourceXml: distanceXml({
				signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="SF1/PDIS1.AmpSv" />`,
			}),
			expectedQueries: [
				'//v2019C1:LNodeInputRef[@sourceRefUuid="amp-uuid"][@sourceRef="SF1/PDIS1.AmpSv"]',
			],
		},
		'the only AmpSv, its instance and data attribute, joined with "." -> resolved': {
			sourceXml: distanceXml({
				signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="SF1/PDIS1.AmpSv(1).instMag.i" />`,
			}),
			expectedQueries: [
				'//v2019C1:LNodeInputRef[@sourceRefUuid="amp-uuid"][@sourceRef="SF1/PDIS1.AmpSv"]',
			],
		},
		'the absolute path, the only AmpSv with its instance and data attribute -> resolved, written relative':
			{
				sourceXml: distanceXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="S1/F1/SF1/PDIS1.AmpSv(1).instMag.i" />`,
				}),
				expectedQueries: [
					'//v2019C1:LNodeInputRef[@sourceRefUuid="amp-uuid"][@sourceRef="SF1/PDIS1.AmpSv"]',
				],
			},
		'the second Op joined to its LNode with "." -> resolved, written with "."': {
			sourceXml: distanceXml({
				signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="SF1/PDIS1.Op(2).general" />`,
			}),
			expectedQueries: [
				'//v2019C1:LNodeInputRef[@sourceRefUuid="op-2-uuid"][@sourceRef="SF1/PDIS1.Op(2).general"]',
			],
		},
		'the only Trip output written with its instance -> resolved, written as its name': {
			sourceXml: distanceXml({
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="SF1/PDIS1/Trip(1)" />`,
			}),
			expectedQueries: [
				'//v2019C1:LNodeOutputRef[@controlRefUuid="trip-uuid"][@controlRef="SF1/PDIS1.Trip"]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async (params) => {
			await expectExportedQueries({ act: params })
			return { assertOn: 'source' }
		},
	})
})

describe('a signal role path in another form resolves through the query', () => {
	const testCases: Record<string, { sourceRef: string; expectedId: string }> = {
		'the only AmpSv with its instance and data attribute -> its SourceRef': {
			sourceRef: 'SF1/PDIS1/AmpSv(1).instMag.i',
			expectedId: 'amp',
		},
		'the only AmpSv joined to its LNode with "." -> its SourceRef': {
			sourceRef: 'SF1/PDIS1.AmpSv',
			expectedId: 'amp',
		},
		'the second Op joined to its LNode with "." -> its SourceRef': {
			sourceRef: 'SF1/PDIS1.Op(2).general',
			expectedId: 'op-2',
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const { source } = await createSclTestProject({ sourceXml: distanceXml({}) })
			await source.document.transaction(async (tx) => {
				const inputRef = await tx.addChild(
					{ tagName: 'SignalRole', id: 'signal-role' },
					{
						tagName: 'LNodeInputRef',
						namespace: v2019C1,
						attributes: { sourceRef: testCase.sourceRef },
					},
				)
				const resolved = await resolveReferencePath(tx, inputRef as never, 'sourceRef')
				expect(resolved?.record.id).toBe(testCase.expectedId)
			})
		})
	}
})

describe('a signal role path from a SubFunction, or naming a colliding name, resolves through the query', () => {
	type TestCase = {
		sourceXml: string
		/** The reason the fixture needs an incoherent reference. */
		allowIncoherentReferences?: string
		tagName: 'LNodeInputRef' | 'LNodeOutputRef' | 'LNodeDataRef'
		attribute: 'sourceRef' | 'controlRef' | 'data'
		value: string
		expectedId: string
		expectedQualifier?: string
	}

	const testCases: Record<string, TestCase> = {
		'a FunctionRef to a SubFunction, the path from the SubFunction with "." before the signal -> its ControlRef':
			{
				sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_SF1 }),
				tagName: 'LNodeOutputRef',
				attribute: 'controlRef',
				value: 'XCBR1.Oper',
				expectedId: 'control-ref',
			},
		'a FunctionRef to a SubFunction, the path from the SubFunction with "/" before the signal -> its ControlRef':
			{
				sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_SF1 }),
				tagName: 'LNodeOutputRef',
				attribute: 'controlRef',
				value: 'XCBR1/Oper',
				expectedId: 'control-ref',
			},
		'a FunctionRef to the Function, a path below its SubFunction with "." before the signal -> its ControlRef':
			{
				sourceXml: functionXml({}),
				tagName: 'LNodeOutputRef',
				attribute: 'controlRef',
				value: 'SF1/XCBR1.Oper',
				expectedId: 'control-ref',
			},
		'a FunctionRef to the Function, a path below its SubFunction with "/" before the signal -> its ControlRef':
			{
				sourceXml: functionXml({}),
				tagName: 'LNodeOutputRef',
				attribute: 'controlRef',
				value: 'SF1/XCBR1/Oper',
				expectedId: 'control-ref',
			},
		'a FunctionRef to a SubFunction, the path from the nearest Function with "." before the signal -> its ControlRef':
			{
				sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_SF1 }),
				tagName: 'LNodeOutputRef',
				attribute: 'controlRef',
				value: 'SF1/XCBR1.Oper',
				expectedId: 'control-ref',
			},
		'a FunctionRef to a SubFunction, the data of an LNode from the SubFunction -> its LNode and the data':
			{
				sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_SF1 }),
				tagName: 'LNodeDataRef',
				attribute: 'data',
				value: 'XCBR1.Pos.stVal',
				expectedId: 'breaker',
				expectedQualifier: 'Pos.stVal',
			},
		'a FunctionRef naming nothing, the absolute path of a ControlRef -> that ControlRef': {
			allowIncoherentReferences: 'the FunctionRef names no element',
			sourceXml: functionXml({ functionRef: FUNCTION_REF_TO_NOTHING }),
			tagName: 'LNodeOutputRef',
			attribute: 'controlRef',
			value: 'S1/F1/SF1/XCBR1.Oper',
			expectedId: 'control-ref',
		},
		'twin XCBR1 in the Function and in SF1, a FunctionRef to SF1, the path "XCBR1.Oper" -> the ControlRef of the SF1 breaker':
			{
				sourceXml: twinBreakersXml({}),
				tagName: 'LNodeOutputRef',
				attribute: 'controlRef',
				value: 'XCBR1.Oper',
				expectedId: 'control-ref',
			},
		'twin XCBR1 in the Function and in SF1, a FunctionRef to SF1, the data "XCBR1.Pos.stVal" -> the SF1 breaker':
			{
				sourceXml: twinBreakersXml({}),
				tagName: 'LNodeDataRef',
				attribute: 'data',
				value: 'XCBR1.Pos.stVal',
				expectedId: 'breaker',
				expectedQualifier: 'Pos.stVal',
			},
		'twin XCBR1 in the Function and in SF1, a FunctionRef to SF1, the path from the nearest Function "SF1/XCBR1.Oper" -> the ControlRef of the SF1 breaker':
			{
				sourceXml: twinBreakersXml({}),
				tagName: 'LNodeOutputRef',
				attribute: 'controlRef',
				value: 'SF1/XCBR1.Oper',
				expectedId: 'control-ref',
			},
		'two inputs named "A.B" (first in the file) and "A/B", the path "PTRC1.A/B" -> the input "A/B"':
			{
				sourceXml: collidingNamesXml({}),
				tagName: 'LNodeInputRef',
				attribute: 'sourceRef',
				value: 'PTRC1.A/B',
				expectedId: 'slash-input',
			},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const { source } = await createSclTestProject({
				sourceXml: testCase.sourceXml,
				allowIncoherentReferences: testCase.allowIncoherentReferences,
			})
			let resolvedId: string | undefined
			let resolvedQualifier: string | undefined
			await source.document.transaction(async (tx) => {
				const reference = await tx.addChild(
					{ tagName: 'SignalRole', id: 'signal-role' },
					{
						tagName: testCase.tagName,
						namespace: v2019C1,
						attributes: { [testCase.attribute]: testCase.value },
					},
				)
				const resolved = await resolveReferencePath(tx, reference as never, testCase.attribute)
				resolvedId = resolved?.record.id
				resolvedQualifier = resolved?.qualifier
			})
			// asserted outside the transaction, which wraps what its callback throws
			expect(resolvedId).toBe(testCase.expectedId)
			expect(resolvedQualifier).toBe(testCase.expectedQualifier)
		})
	}
})

/**
 * A reference of a signal role in a file: the import is the guard. Its path is followed (the new form,
 * then the former forms) and written again in the form the engine writes; the uuid wins over a path
 * naming another element; a path naming nothing stays as read and is reported.
 */
describe('import of a signal role path through a project', () => {
	type TestCase = {
		sourceXml: string
		/** The path the LNodeInputRef holds once imported. */
		expectedPath: string
		/** The uuid the LNodeInputRef holds once imported; none when it holds none. */
		expectedUuid?: string
		expectedDiagnostics: SclImportDiagnostic[]
	}

	const testCases: Record<string, TestCase> = {
		'no uuid, a path with "/" before the signal naming its target -> the uuid written, the path written with ".", no warning':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1/Trip" />`,
				}),
				expectedPath: 'PTRC1.Trip',
				expectedUuid: 'source-ref-uuid',
				expectedDiagnostics: [],
			},
		'a uuid, a path with "/" before the signal naming the same element -> the path written with ".", no warning':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1/Trip" sourceRefUuid="source-ref-uuid" />`,
				}),
				expectedPath: 'PTRC1.Trip',
				expectedUuid: 'source-ref-uuid',
				expectedDiagnostics: [],
			},
		'a uuid, a path naming another element -> the uuid wins, the path written from it with ".", one incoherent-reference naming both':
			{
				sourceXml: distanceXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="SF1/PDIS1/Op(1).general" sourceRefUuid="op-2-uuid" />`,
				}),
				expectedPath: 'SF1/PDIS1.Op(2).general',
				expectedUuid: 'op-2-uuid',
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'incoherent-reference', {
						ref: { tagName: 'LNodeInputRef', id: 'input-ref', attribute: 'sourceRef' },
						meta: {
							uuidAttribute: 'sourceRefUuid',
							pathValue: 'SF1/PDIS1/Op(1).general',
							uuidValue: 'op-2-uuid',
						},
						related: [
							{
								ref: { tagName: 'SourceRef', id: 'op-2' },
								message: INCOHERENT_REFERENCE_RELATED.uuidTarget,
							},
							{
								ref: { tagName: 'SourceRef', id: 'op-1' },
								message: INCOHERENT_REFERENCE_RELATED.pathTarget,
							},
						],
					}),
				],
			},
		'no uuid, a path naming nothing -> left as read, one unresolved-reference listing the keys tried, the new form first':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="PTRC1/Missing" />`,
				}),
				expectedPath: 'PTRC1/Missing',
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unresolved-reference', {
						ref: { tagName: 'LNodeInputRef', id: 'input-ref', attribute: 'sourceRef' },
						meta: {
							uuidAttribute: 'sourceRefUuid',
							pathValue: 'PTRC1/Missing',
							triedKeys: ['S1/F1/PTRC1/Missing', 'S1/F1/PTRC1.Missing', 'PTRC1/Missing'],
						},
					}),
				],
			},
		'no uuid, a path naming nothing, a FunctionRef to a SubFunction -> one unresolved-reference listing the SubFunction base, the Function base, the path as written':
			{
				sourceXml: functionXml({
					signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="XCBR1.Missing" />`,
					functionRef: FUNCTION_REF_TO_SF1,
				}),
				expectedPath: 'XCBR1.Missing',
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unresolved-reference', {
						ref: { tagName: 'LNodeInputRef', id: 'input-ref', attribute: 'sourceRef' },
						meta: {
							uuidAttribute: 'sourceRefUuid',
							pathValue: 'XCBR1.Missing',
							triedKeys: ['S1/F1/SF1/XCBR1.Missing', 'S1/F1/XCBR1.Missing', 'XCBR1.Missing'],
						},
					}),
				],
			},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const { project } = await createSclTestProject({ sourceXml: EMPTY_SCL })
			const [entry] = await project.import(
				[new File([testCase.sourceXml], 'signal-role.scd', { type: 'text/xml' })],
				{ useCustomRecordsIds: true },
			)
			if (entry.status !== 'imported') throw new Error('signal-role.scd not imported')

			const query = project.openDocument(entry.documentId).query
			const reference = { tagName: 'LNodeInputRef', id: 'input-ref' } as const
			const writtenPath = await query.getAttribute(reference, { name: 'sourceRef' })
			const writtenUuid = await query.getAttribute(reference, { name: 'sourceRefUuid' })
			expect(writtenPath).toBe(testCase.expectedPath)
			expect(writtenUuid).toBe(testCase.expectedUuid ?? '')
			expect(entry.diagnostics).toEqual(testCase.expectedDiagnostics)
		})
	}
})

/** A FunctionRef naming nothing gives its signal role paths no base: one that names nothing is reported. */
describe('import of a signal role path below a FunctionRef naming nothing', () => {
	it('no uuid, an absolute path naming nothing -> left as read, one unresolved-reference on the path', async () => {
		const { project } = await createSclTestProject({ sourceXml: EMPTY_SCL })
		const [entry] = await project.import(
			[
				new File(
					[
						functionXml({
							signalRole: `<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="S1/F1/PTRC1.Missing" />`,
							functionRef: FUNCTION_REF_TO_NOTHING,
						}),
					],
					'signal-role.scd',
					{ type: 'text/xml' },
				),
			],
			{ useCustomRecordsIds: true },
		)
		if (entry.status !== 'imported') throw new Error('signal-role.scd not imported')

		const query = project.openDocument(entry.documentId).query
		const writtenPath = await query.getAttribute(
			{ tagName: 'LNodeInputRef', id: 'input-ref' },
			{ name: 'sourceRef' },
		)
		expect(writtenPath).toBe('S1/F1/PTRC1.Missing')
		expect(entry.diagnostics.map(({ code, ref }) => ({ code, ref }))).toEqual([
			{
				code: 'unresolved-reference',
				ref: { tagName: 'LNodeInputRef', id: 'input-ref', attribute: 'sourceRef' },
			},
		])
	})
})

/**
 * A FunctionRef whose uuid names nothing and whose path names SF1: the base of its signal role paths is
 * SF1, read from the path as the query reads it (the uuid first, then the path). The FunctionRef is
 * incoherent on purpose; only the outcome of the signal reference is asserted.
 */
describe('import of a signal role path below a FunctionRef whose uuid names nothing and whose path names a SubFunction', () => {
	type TestCase = {
		signalRole: string
		/** The uuid the LNodeOutputRef holds once imported. */
		expectedUuid: string
	}

	const testCases: Record<string, TestCase> = {
		'no uuid, a path from the SubFunction the FunctionRef path names -> resolved to its ControlRef, the uuid written, the path kept, no warning for it':
			{
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="XCBR1.Oper" />`,
				expectedUuid: 'control-ref-uuid',
			},
		'its uuid, a path from the SubFunction the FunctionRef path names -> the path kept, no warning for it':
			{
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="XCBR1.Oper" controlRefUuid="control-ref-uuid" />`,
				expectedUuid: 'control-ref-uuid',
			},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const { project } = await createSclTestProject({ sourceXml: EMPTY_SCL })
			const [entry] = await project.import(
				[
					new File(
						[
							functionXml({
								signalRole: testCase.signalRole,
								functionRef: 'function="S1/F1/SF1" functionUuid="missing-function-uuid"',
							}),
						],
						'signal-role.scd',
						{ type: 'text/xml' },
					),
				],
				{ useCustomRecordsIds: true },
			)
			if (entry.status !== 'imported') throw new Error('signal-role.scd not imported')

			const query = project.openDocument(entry.documentId).query
			const reference = { tagName: 'LNodeOutputRef', id: 'output-ref' } as const
			const writtenPath = await query.getAttribute(reference, { name: 'controlRef' })
			const writtenUuid = await query.getAttribute(reference, { name: 'controlRefUuid' })
			expect(writtenPath).toBe('XCBR1.Oper')
			expect(writtenUuid).toBe(testCase.expectedUuid)
			expect(entry.diagnostics.filter(({ ref }) => ref?.id === 'output-ref')).toEqual([])
		})
	}
})

/**
 * The base of a signal role path is a function element (Function, SubFunction, EqFunction,
 * EqSubFunction), whatever else the FunctionRef's uuid or path names. Only the outcome of the signal
 * reference is asserted; the FunctionRef is incoherent on purpose.
 */
describe('import of a signal role path below a FunctionRef naming an element that is no function', () => {
	type TestCase = {
		functionRef: string
		signalRole: string
		expectedPath: string
		expectedUuid: string
	}

	const testCases: Record<string, TestCase> = {
		'a FunctionRef path naming an LNode, an absolute path alone -> resolved, the uuid written, the path kept absolute':
			{
				functionRef: 'function="S1/F1/SF1/XCBR1" functionUuid="missing-function-uuid"',
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="S1/F1/SF1/XCBR1.Oper" />`,
				expectedPath: 'S1/F1/SF1/XCBR1.Oper',
				expectedUuid: 'control-ref-uuid',
			},
		'a FunctionRef path naming an LNode, an absolute path next to its uuid -> the path kept absolute':
			{
				functionRef: 'function="S1/F1/SF1/XCBR1" functionUuid="missing-function-uuid"',
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="S1/F1/SF1/XCBR1.Oper" controlRefUuid="control-ref-uuid" />`,
				expectedPath: 'S1/F1/SF1/XCBR1.Oper',
				expectedUuid: 'control-ref-uuid',
			},
		'a FunctionRef uuid naming an LNode, its path naming a SubFunction, a path from the SubFunction alone -> resolved through the path, the uuid written, the path kept':
			{
				functionRef: 'function="S1/F1/SF1" functionUuid="breaker-uuid"',
				signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="XCBR1.Oper" />`,
				expectedPath: 'XCBR1.Oper',
				expectedUuid: 'control-ref-uuid',
			},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const { project } = await createSclTestProject({ sourceXml: EMPTY_SCL })
			const [entry] = await project.import(
				[
					new File(
						[
							functionXml({
								signalRole: testCase.signalRole,
								functionRef: testCase.functionRef,
							}),
						],
						'signal-role.scd',
						{ type: 'text/xml' },
					),
				],
				{ useCustomRecordsIds: true },
			)
			if (entry.status !== 'imported') throw new Error('signal-role.scd not imported')

			const query = project.openDocument(entry.documentId).query
			const reference = { tagName: 'LNodeOutputRef', id: 'output-ref' } as const
			const writtenPath = await query.getAttribute(reference, { name: 'controlRef' })
			const writtenUuid = await query.getAttribute(reference, { name: 'controlRefUuid' })
			expect(writtenPath).toBe(testCase.expectedPath)
			expect(writtenUuid).toBe(testCase.expectedUuid)
			expect(entry.diagnostics.filter(({ ref }) => ref?.id === 'output-ref')).toEqual([])
		})
	}
})

/**
 * An application cloned into a project: the clone's FunctionRef still names the SubFunction of the
 * source until the remap repoints it, and its LNodeOutputRef the ControlRef of the source. Once
 * remapped, the path is the one relative to the clone's SubFunction, not an absolute path.
 */
describe('a signal role path after the uuid remap of a cloned application', () => {
	const testCases: SclTest.TestCases = {
		'a FunctionRef to a SubFunction and its ControlRef cloned together, the output mapped before its FunctionRef -> the output path relative to the cloned SubFunction':
			{
				allowIncoherentReferences:
					'freshly cloned references still carry the uuids of the document they were cloned from',
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="substation" name="P1">
							<Function ${id}="function" name="F1" uuid="function-clone-uuid">
								<SubFunction ${id}="sub-function" name="SF1" uuid="sub-function-clone-uuid">
									<LNode ${id}="breaker" uuid="breaker-clone-uuid" iedName="None" lnClass="XCBR" lnInst="1">
										<Private ${id}="breaker-private" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
												<eIEC61850-6-100:ControlRef ${id}="control-ref" uuid="control-ref-clone-uuid" output="Oper" />
											</eIEC61850-6-100:LNodeOutputs>
										</Private>
									</LNode>
								</SubFunction>
							</Function>
							${applicationXml({
								functionRef: 'function="TEMPLATE/F1/SF1" functionUuid="sub-function-source-uuid"',
								signalRole: `<eIEC61850-6-100:LNodeOutputRef ${id}="output-ref" controlRef="XCBR1.Oper" controlRefUuid="control-ref-source-uuid" />`,
							})}
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:FunctionRef[@functionUuid="sub-function-clone-uuid"][@function="P1/F1/SF1"]',
					'//v2019C1:LNodeOutputRef[@controlRefUuid="control-ref-clone-uuid"][@controlRef="XCBR1.Oper"]',
				],
				unexpectedQueries: ['//v2019C1:LNodeOutputRef[@controlRef="P1/F1/SF1/XCBR1.Oper"]'],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async (params) => {
			await params.source.transaction(async (tx) => {
				await applyUuidRemap(tx, {
					cloneMappings: [
						{
							source: {
								tagName: 'SubFunction',
								id: 'sub-function-source',
								attributes: [{ name: 'uuid', value: 'sub-function-source-uuid' }],
							},
							target: { tagName: 'SubFunction', id: 'sub-function' },
						},
						{
							source: {
								tagName: 'ControlRef',
								id: 'control-ref-source',
								attributes: [{ name: 'uuid', value: 'control-ref-source-uuid' }],
							},
							target: { tagName: 'ControlRef', id: 'control-ref' },
						},
						{
							source: { tagName: 'LNodeOutputRef', id: 'output-ref-source', attributes: [] },
							target: { tagName: 'LNodeOutputRef', id: 'output-ref' },
						},
						{
							source: { tagName: 'FunctionRef', id: 'function-ref-source', attributes: [] },
							target: { tagName: 'FunctionRef', id: 'function-ref' },
						},
					] as unknown as Scl.CloneMapping[],
				})
			})
			await expectExportedQueries({ act: params })
			return { assertOn: 'source' }
		},
	})
})
