import type { Database } from '@zigordev/events';
import { and, isNotNull, lt, or, sql } from 'drizzle-orm';
import { emails } from '../../db/schema.ts';

export async function deleteBodiesBefore(db: Database, cutoff: Date): Promise<number> {
  const deleted = await db
    .update(emails)
    .set({ html: null, text: null })
    .where(
      and(
        lt(sql`coalesce(${emails.sentAt}, ${emails.failedAt})`, cutoff),
        or(isNotNull(emails.html), isNotNull(emails.text))
      )
    )
    .returning({ id: emails.id });
  return deleted.length;
}
