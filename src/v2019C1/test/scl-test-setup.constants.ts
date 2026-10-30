import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { SCL_EXTENSION_MODULES } from '@/v2019C1/extensions'
import { HOOKS, createSclImportSession } from '@/v2019C1/hooks'

/**
 * What every SCL test project is opened with, as `createSclProject` opens a real one: the dialecte config, the
 * extensions and every hook on the Project instance: the import session (core creates one per file imported, so no
 * project or test shares import state) and the record hooks. Internal to the test helpers.
 */
export const SCL_TEST_SETUP = {
	dialecteConfig: SCL_DIALECTE_CONFIG,
	extensions: { base: SCL_EXTENSION_MODULES },
	hooks: { createImportSession: createSclImportSession, ...HOOKS },
}

/**
 * How long the check of a runner call's fixtures may take before its first case runs: each fixture is imported into
 * a test project of its own, a few milliseconds each in node, more on a browser's store under load.
 */
export const FIXTURE_REFERENCES_CHECK_TIMEOUT_MS = 120_000
