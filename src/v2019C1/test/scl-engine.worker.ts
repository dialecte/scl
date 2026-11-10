// The SCL engine worker of the test suites: a project of the SCL dialecte on `sqlite` storage runs in it.
import { serveSqliteEngine } from '@dialecte/core/sqlite'

import { SCL_DIALECTE } from '@/v2019C1/declaration.constants'

serveSqliteEngine({ dialectes: [SCL_DIALECTE] })
