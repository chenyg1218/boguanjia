/** 授权档位：基础版 / 专业版（单平台 · 3个账号）/ 旗舰版（无上限） */
export type LicensePlan = 'free' | 'pro' | 'flagship'

export const LICENSE_PLAN_RANK: Record<LicensePlan, number> = {
  free: 0,
  pro: 1,
  flagship: 2,
}

/** maxAccounts：-1 表示无上限（避免 Infinity 经 IPC/JSON 丢失） */
export function maxAccountsForPlan(plan: LicensePlan): number {
  if (plan === 'flagship') return -1
  if (plan === 'pro') return 3
  return 1
}

export function normalizeLicensePlan(raw: unknown, fallback: LicensePlan = 'flagship'): LicensePlan {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (v === 'pro' || v === 'professional') return 'pro'
  if (v === 'flagship' || v === 'ultimate' || v === 'unlimited') return 'flagship'
  if (v === 'free') return 'free'
  return fallback
}

export function higherLicensePlan(a: LicensePlan, b: LicensePlan): LicensePlan {
  return LICENSE_PLAN_RANK[a] >= LICENSE_PLAN_RANK[b] ? a : b
}

export function planDisplayName(plan: LicensePlan): string {
  if (plan === 'pro') return '专业版'
  if (plan === 'flagship') return '旗舰版'
  return '基础版'
}

export function formatMaxAccounts(maxAccounts: number): string {
  if (maxAccounts < 0) return '无上限'
  return `${maxAccounts} 个`
}

export function canRedeemPlan(
  currentPlan: LicensePlan | null | undefined,
  cardPlan: LicensePlan,
): { ok: true; resultPlan: LicensePlan } | { ok: false; error: string } {
  if (!currentPlan || currentPlan === 'free') {
    return { ok: true, resultPlan: cardPlan === 'free' ? 'pro' : cardPlan }
  }
  if (cardPlan === currentPlan) {
    return { ok: true, resultPlan: cardPlan }
  }
  if (LICENSE_PLAN_RANK[cardPlan] > LICENSE_PLAN_RANK[currentPlan]) {
    return { ok: true, resultPlan: cardPlan }
  }
  const curName = planDisplayName(currentPlan)
  const cardName = planDisplayName(cardPlan)
  return {
    ok: false,
    error: `您当前是${curName}且尚未到期。请用同档卡密续期，或用更高档卡密升级；${cardName}卡密请等到期后再用（不会扣掉这张卡）`,
  }
}

/** 默认账号优先，其余按现有顺序，截取到上限 */
export function pickLicensedAccountIds(
  accounts: Array<{ id: string }>,
  maxAccounts: number,
): string[] {
  const ordered = [
    ...accounts.filter(a => a.id === 'default'),
    ...accounts.filter(a => a.id !== 'default'),
  ].map(a => a.id)
  if (maxAccounts < 0) return ordered
  return ordered.slice(0, Math.max(0, maxAccounts))
}
