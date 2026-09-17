import type { AuthContext } from './auth.ts'

export type AccountAuditEvent = 'ACCOUNT_CREATED' | 'ACCOUNT_UPDATED' | 'ACCOUNT_DELETED' | 'PASSWORD_RESET_REQUESTED'

export async function appendAccountAudit(
  context: AuthContext,
  targetUserId: string,
  eventName: AccountAuditEvent,
  details: Record<string, unknown> = {},
) {
  const { error } = await context.userClient.rpc('append_account_audit_event', {
    p_target_user_id: targetUserId,
    p_event_name: eventName,
    p_details: details,
  })

  if (error) {
    console.error('account audit event failed', { eventName, targetUserId, code: error.code })
    return false
  }
  return true
}
