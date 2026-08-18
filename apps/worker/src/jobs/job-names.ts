/**
 * Every job is idempotent and carries a dedupe key (architecture.md section 9). Restarts
 * and provider retries are normal traffic, not incidents.
 *
 * The four workloads, named here before they are implemented so the queue topology is
 * visible in one place:
 */
export const JOBS = {
  /** Paced per WhatsApp number: provider throughput tiers are a hard external limit. */
  sendMessage: 'message.send',
  /** Timezone-sensitive sweep; must not double-notify for one task and due window. */
  followUpReminders: 'follow-up.sweep',
  /** High volume, out of order, idempotent on the provider event id. */
  processProviderEvent: 'provider-event.process',
  /** Cheap to rebuild from activity and outbox rows. */
  refreshReadModels: 'insights.refresh',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
