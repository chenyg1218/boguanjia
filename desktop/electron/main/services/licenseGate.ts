import { Result } from '@praha/byethrow'
import { ErrorFactory } from '@praha/error-factory'
import { licenseService } from '#/services/LicenseService'

/** 基础版 / 超出档位时禁用账号的统一提示（主进程权威） */
export const LICENSE_ACCOUNT_DENIED =
  '该账号已超出当前档位可用数量，请升级旗舰版或切换到已授权账号'

class LicenseAccountDeniedError extends ErrorFactory({
  name: 'LicenseAccountDeniedError',
  message: LICENSE_ACCOUNT_DENIED,
}) {}

/**
 * 主进程强制：基础版仅允许 default 账号连接/启任务。
 * 不信任渲染进程传来的 disabled 标志。
 */
export function assertAccountLicensed(accountId: string): Result.Result<void, Error> {
  if (licenseService.canUseAccount(accountId)) {
    return Result.succeed(undefined)
  }
  return Result.fail(new LicenseAccountDeniedError())
}

export function accountLicenseError(accountId: string): string | null {
  if (licenseService.canUseAccount(accountId)) return null
  return LICENSE_ACCOUNT_DENIED
}
