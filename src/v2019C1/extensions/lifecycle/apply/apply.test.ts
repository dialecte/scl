import { apply } from './apply'

import { describe, expect, it } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('apply — returns { report, instances }', () => {
	it('fsd instantiate: returns the placed Function root', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		})

		let result: Awaited<ReturnType<typeof apply>> | undefined
		await target.document.transaction(async (tx) => {
			result = await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.document.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
			})
		})

		expect(result?.report).toBe(rep)
		expect(result?.instances.verb).toBe('fsd')
		expect(result?.instances.verb === 'fsd' && result.instances.functions).toHaveLength(1)
	})
})

describe('apply — keepNameTypesFrom threads to the type import', () => {
	const dedupSourceXml = /* xml */ `
		<SCL ${ns} ${id}="fsd">
			<Substation name="TEMPLATE" ${id}="sub-s">
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="TEMPLATE" ${id}="bay-s">
						<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_ICD" ${id}="lnode-1" uuid="lnode-src-uuid"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-s">
				<LNodeType id="CSWI_ICD" lnClass="CSWI" ${id}="lnt-s">
					<DO name="Pos" type="DPC_ICD" ${id}="do-s"/>
				</LNodeType>
				<DOType id="DPC_ICD" cdc="DPC" ${id}="dot-s">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>`
	// target already holds a structurally-equal type under a different id (CSWI_SSD).
	const dedupTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t">
					<Bay name="B1" ${id}="bay-t"/>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-t">
				<LNodeType id="CSWI_SSD" lnClass="CSWI" ${id}="lnt-t">
					<DO name="Pos" type="DPC_SSD" ${id}="do-t"/>
				</LNodeType>
				<DOType id="DPC_SSD" cdc="DPC" ${id}="dot-t">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>`

	async function instantiate(
		keepNameTypesFrom: 'source' | 'target' | undefined,
	): Promise<string[]> {
		const { source, target } = await createSclTestProject({
			sourceXml: dedupSourceXml,
			targetXml: dedupTargetXml,
		})
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
			scenario: 'instantiate',
		})
		await target.document.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.document.query,
				ref: functionRef,
				anchor: bayRef,
				scenario: 'instantiate',
				report: rep,
				keepNameTypesFrom,
			})
		})

		const records = await target.document.query.getRecordsByTagName('LNodeType')
		return records
			.map((record) => record.attributes.find((a) => a.name === 'id')?.value)
			.filter((value): value is string => value !== undefined)
	}

	it('keepNameTypesFrom "source": the reused type adopts the incoming id', async () => {
		const ids = await instantiate('source')
		expect(ids).toContain('CSWI_ICD')
		expect(ids).not.toContain('CSWI_SSD')
	})

	it('default (target): the reused type keeps the destination id', async () => {
		const ids = await instantiate(undefined)
		expect(ids).toContain('CSWI_SSD')
		expect(ids).not.toContain('CSWI_ICD')
	})
})
