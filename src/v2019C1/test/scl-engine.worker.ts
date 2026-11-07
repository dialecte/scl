// The SCL engine worker of the test suites: a project of the test factory on `sqlite` storage runs in it.
import { serveDialecteEngine } from '@dialecte/core/engine'

import { SCL_DIALECTE } from '@/v2019C1/declaration.constants'

serveDialecteEngine({ dialecte: SCL_DIALECTE })
