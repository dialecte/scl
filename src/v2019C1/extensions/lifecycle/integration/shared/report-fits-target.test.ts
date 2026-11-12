import { reportAndApply } from '../integration-helpers'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMapping } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const substationRef = { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const gatewayRef = { tagName: 'AllocationRole', id: 'gateway-t' } as Scl.Ref<'AllocationRole'>

// a bay template whose application is allocated to a role; the project holds roles of its own the consumer may choose
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="B1" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="private-s">
						<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
						</eIEC61850-6-100:AllocationRole>
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/B1/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-project-uuid" ${id}="role-t"/>
				<eIEC61850-6-100:AllocationRole name="Gateway" uuid="gateway-project-uuid" ${id}="gateway-t"/>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

function lifecycle(sourceQuery: Scl.Query) {
	return {
		verb: 'ssd',
		scenario: 'instantiate',
		sourceQuery,
		ref: substationRef,
		anchor: bayRef,
	} as const
}

async function roleNames(query: Scl.Query): Promise<string[]> {
	const names: string[] = []
	const roles = await query.getRecordsByTagName('AllocationRole')
	for (const role of roles) {
		const name = await query.getAttribute(role, { name: 'name' })
		names.push(name ?? '')
	}
	return names.sort()
}

/**
 * Report (with the mapping choices unless they are made at the apply only), delete `deleted` between the report and
 * the apply, then apply with the choices: the refusal.
 */
async function appliedAfterDeleting(params: {
	mappings?: ReadonlyMap<string, DecisionMapping>
	chosenAtApplyOnly?: boolean
	deleted: Scl.Ref<'AllocationRole'>
}) {
	const { mappings, deleted } = params
	const { source, target } = await createSclTestProject({ sourceXml, targetXml: projectXml })
	if (!target) throw new Error('target required')
	const placement = lifecycle(source.document.query)
	const reported = await report(target.document.query, {
		...placement,
		...(mappings && !params.chosenAtApplyOnly ? { resolution: { mappings } } : {}),
	})
	await target.document.transaction(async function deleteBetween(tx) {
		await tx.delete(deleted)
	})
	const before = await target.document.query.getSnapshot({ as: 'xml' })

	const applied = target.document.transaction(async function applyReport(tx) {
		await apply(tx, {
			...placement,
			report: reported,
			resolution: { decisions: new Map(), ...(mappings ? { mappings } : {}) },
		})
	})
	const outcome = await applied.catch(function caught(error: unknown) {
		return error
	})
	const refusal = toDialecteError(outcome)
	return {
		refusal: { key: refusal?.key, code: refusal?.code, meta: refusal?.meta },
		unchanged: (await target.document.query.getSnapshot({ as: 'xml' })) === before,
		roles: await roleNames(target.document.query),
	}
}

describe('apply: a report naming an element deleted since is refused, nothing written', () => {
	it('the role a mapping choice names deleted between the report and the apply → refused', async () => {
		const outcome = await appliedAfterDeleting({
			mappings: new Map([['role-s', { existing: gatewayRef }]]),
			deleted: gatewayRef,
		})

		expect(outcome).toEqual({
			refusal: {
				key: 'REPORT_STALE',
				code: 'SCL1014',
				meta: { element: { tagName: 'AllocationRole', id: 'gateway-t' }, kind: 'mapping' },
			},
			unchanged: true,
			roles: ['HMI_PC'],
		})
	})

	it('a role chosen at the apply only, deleted after the report → refused', async () => {
		const outcome = await appliedAfterDeleting({
			mappings: new Map([['role-s', { existing: gatewayRef }]]),
			chosenAtApplyOnly: true,
			deleted: gatewayRef,
		})

		expect(outcome).toEqual({
			refusal: {
				key: 'REPORT_STALE',
				code: 'SCL1014',
				meta: { element: { tagName: 'AllocationRole', id: 'gateway-t' }, kind: 'mapping' },
			},
			unchanged: true,
			roles: ['HMI_PC'],
		})
	})
})

describe('apply: a report applied again is safe', () => {
	const fsdSourceXml = /* xml */ `
		<SCL ${ns} ${id}="fsd">
			<Substation name="TEMPLATE" ${id}="sub-s">
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="TEMPLATE" ${id}="bay-tpl-s">
						<Function name="Prot" uuid="fn-uuid" desc="r1" ${id}="fn-s"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	function fsdLifecycle(sourceQuery: Scl.Query, scenario: 'instantiate' | 'template') {
		return {
			verb: 'fsd',
			scenario,
			sourceQuery,
			ref: { tagName: 'Function', id: 'fn-s' } as Scl.Ref<'Function'>,
			anchor: bayRef,
		} as const
	}

	it('a first placement applied twice → one instance', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: fsdSourceXml,
			targetXml: projectXml,
		})
		if (!target) throw new Error('target required')
		const placement = fsdLifecycle(source.document.query, 'template')
		const reported = await report(target.document.query, placement)

		for (const turn of [1, 2]) {
			await target.document.transaction(async function applyTurn(tx) {
				await apply(tx, { ...placement, report: reported, resolution: { decisions: new Map() } })
			})
			const instances = await target.document.query.findByAttributes({
				tagName: 'Function',
				attributes: { templateUuid: 'fn-uuid' },
			})
			expect(instances, 'turn ' + turn).toHaveLength(1)
		}
	})

	it('an update applied twice → the second writes nothing', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: fsdSourceXml,
			targetXml: projectXml,
		})
		if (!target) throw new Error('target required')
		await reportAndApply({
			document: target.document,
			lifecycle: fsdLifecycle(source.document.query, 'instantiate'),
		})
		await source.document.transaction(async function templateChanges(tx) {
			await tx.update({ tagName: 'Function', id: 'fn-s' } as Scl.Ref<'Function'>, {
				attributes: { desc: 'r2' },
			})
		})
		const update = fsdLifecycle(source.document.query, 'template')
		const reported = await report(target.document.query, update)

		await target.document.transaction(async function applyOnce(tx) {
			await apply(tx, { ...update, report: reported, resolution: { decisions: new Map() } })
		})
		const once = await target.document.query.getSnapshot({ as: 'xml' })
		await target.document.transaction(async function applyAgain(tx) {
			await apply(tx, { ...update, report: reported, resolution: { decisions: new Map() } })
		})

		const twice = await target.document.query.getSnapshot({ as: 'xml' })
		expect(twice).toEqual(once)
	})
})
