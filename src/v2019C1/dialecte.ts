import { SCL_DIALECTE } from './declaration.constants'

import { createProjectFactory } from '@dialecte/core'

/**
 * Create an SCL project: every part of it comes from the dialecte's declaration (`SCL_DIALECTE`).
 * Call .open(name) to initialize the store and hydrate state. The factory carries the declaration
 * (`createSclProject.dialecte`) and deletes an SCL project without opening it
 * (`createSclProject.destroyProject({ name, storage })`).
 *
 * Marked pure, as the declaration: a consumer importing one helper of the main entry leaves it out of its bundle.
 *
 * @intent open an SCL project, work on SCD/SSD/FSD/ASD files, import and edit SCL documents, register custom extensions on an SCL project, delete an SCL project without opening it
 */
export const createSclProject = /* @__PURE__ */ createProjectFactory({ dialecte: SCL_DIALECTE })
