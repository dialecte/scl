import type { SatelliteIndex } from './applied-satellites.types'
import type { Scl } from '@/v2019C1/config'

/**
 * What the project holds already of what a placement lands on: the project element each landing source uuid names
 * (`landed`), and by a project element's uuid the variables applying to it, with their lineage (`byTarget`), read from
 * the project's satellites (`projectIndex`; none read when the placement lands on nothing).
 */
export type HeldApplications = {
	landed: ReadonlyMap<string, string>
	byTarget: ReadonlyMap<string, readonly { lineage: string; copy: Scl.Ref<Scl.ElementsOf> }[]>
	projectIndex?: SatelliteIndex
}

/**
 * The applications of a variable the project's copy of it already makes: the references making them (record ids), and
 * that copy.
 */
export type DuplicateApplications = {
	referenceIds: Set<string>
	copy: Scl.Ref<Scl.ElementsOf> | undefined
}
