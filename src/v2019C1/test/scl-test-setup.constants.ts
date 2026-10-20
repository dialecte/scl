import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { SCL_EXTENSION_MODULES } from '@/v2019C1/extensions'
import { HOOKS, createSclIoHooks } from '@/v2019C1/hooks'

/**
 * What every SCL test project is opened with, as `createSclProject` opens a real one: the dialecte config, the
 * extensions and every hook (io + record) on the Project instance. Internal to the test helpers.
 */
export const SCL_TEST_SETUP = {
	dialecteConfig: SCL_DIALECTE_CONFIG,
	extensions: { base: SCL_EXTENSION_MODULES },
	hooks: { ...createSclIoHooks(), ...HOOKS },
}
