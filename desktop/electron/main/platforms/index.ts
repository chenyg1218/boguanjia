import type { IPlatform } from './IPlatform'
import { KuaishouPlatform } from './kuaishou'

export const platformFactory: Record<LiveControlPlatform, { new (): IPlatform }> = {
  kuaishou: KuaishouPlatform,
}
