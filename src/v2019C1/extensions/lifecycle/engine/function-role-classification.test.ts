import { diff } from './diff'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A `FunctionRole` (and its `FunctionRoleContent`) is tool-generated grouping — SET's
// `assign-to-application` creates one named after a function's highest `FunctionCategory`,
// from scratch (a `uuid` filled by hooks, NO `templateUuid`).
// So an instance `FunctionRole` with no template lineage is NOT author DATA content: it must
// never be reported as a `target-only` "keep/remove" decision (which would offer to delete it).
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-src">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:Application name="App" uuid="app-src" ${id}="app-s">
							<eIEC61850-6-100:FunctionRole name="APPLICATION ROOT" uuid="fr-src" ${id}="fr-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s"/>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

// The instance matches the template `Application` (templateUuid) and its `FunctionRole`,
// PLUS carries an extra tool-generated `FunctionRole name="Measurement"` with no templateUuid.
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="asd-tgt">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:Application name="App" uuid="app-i" templateUuid="app-src" ${id}="app-i">
							<eIEC61850-6-100:FunctionRole name="APPLICATION ROOT" uuid="fr-i" templateUuid="fr-src" ${id}="fr-i">
								<eIEC61850-6-100:FunctionRoleContent ${id}="frc-i"/>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:FunctionRole name="Measurement" uuid="fr-extra" ${id}="fr-extra"/>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('engine.diff — FunctionRole is engine-managed grouping, never target-only', () => {
	it('does not classify a lineage-less instance FunctionRole as a target-only change', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const report = await diff({
			sourceQuery: source.document.query,
			targetQuery: target.document.query,
			sourceRootRef: { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>,
			instanceRootRef: { tagName: 'Application', id: 'app-i' } as Scl.Ref<'Application'>,
		})

		const targetOnlyRoles = report.groups.filter(
			(group) => group.change === 'target-only' && group.primary.tagName === 'FunctionRole',
		)
		expect(targetOnlyRoles).toHaveLength(0)
		// nothing genuinely changed → fast track
		expect(report.groups).toHaveLength(0)
	})
})
