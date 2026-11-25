import { afterCursor, type CursorValue, keysetOrder, type SortDirection } from '@zigordev/api';
import { and, eq, ilike, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { notes } from '../../db/schema.ts';
import type { CreateNote, UpdateNote } from './schemas.ts';

export type NoteRow = typeof notes.$inferSelect;
export type Database = NodePgDatabase<{ notes: typeof notes }>;

export interface NoteListing {
  readonly status: NoteRow['status'] | undefined;
  readonly q: string | undefined;
  readonly field: 'createdAt' | 'updatedAt' | 'title';
  readonly direction: SortDirection;
  readonly after: readonly CursorValue[] | undefined;
  readonly limit: number;
}

function literal(text: string): string {
  return text.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}

export function notesRepository(db: Database) {
  return {
    async list(listing: NoteListing): Promise<NoteRow[]> {
      const columns = [notes[listing.field], notes.id] as const;
      return db
        .select()
        .from(notes)
        .where(
          and(
            listing.status === undefined ? undefined : eq(notes.status, listing.status),
            listing.q === undefined ? undefined : ilike(notes.title, `%${literal(listing.q)}%`),
            afterCursor(columns, listing.direction, listing.after)
          )
        )
        .orderBy(...keysetOrder(columns, listing.direction))
        .limit(listing.limit + 1);
    },
    async find(id: string): Promise<NoteRow | undefined> {
      const [row] = await db.select().from(notes).where(eq(notes.id, id));
      return row;
    },
    async create(note: CreateNote): Promise<NoteRow> {
      const [row] = await db.insert(notes).values(note).returning();
      return row as NoteRow;
    },
    async update(id: string, change: UpdateNote): Promise<NoteRow | undefined> {
      const [row] = await db
        .update(notes)
        .set({ ...change, updatedAt: sql`now()` })
        .where(eq(notes.id, id))
        .returning();
      return row;
    },
    async remove(id: string): Promise<boolean> {
      const removed = await db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
      return removed.length > 0;
    },
  };
}

export type NotesRepository = ReturnType<typeof notesRepository>;
