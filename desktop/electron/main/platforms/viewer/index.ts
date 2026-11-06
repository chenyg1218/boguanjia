import { VIEWER_PLATFORM_CONFIGS } from './configs'
import { GenericViewerPlatform } from './GenericViewerPlatform'

export function createViewerPlatform(platform: LiveControlPlatform): GenericViewerPlatform {
  const cfg = VIEWER_PLATFORM_CONFIGS[platform]
  if (!cfg) {
    throw new Error(`暂不支持该平台的观众端：${platform}`)
  }
  return new GenericViewerPlatform(cfg)
}

export { VIEWER_PLATFORM_CONFIGS } from './configs'
export type { ViewerPlatformConfig } from './configs'
export { GenericViewerPlatform } from './GenericViewerPlatform'
