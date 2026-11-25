import { listQuery, pageSchema } from '@zigordev/api';
import * as z from 'zod';
import { noteStatuses } from '../../db/schema.ts';

export const noteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  status: z.enum(noteStatuses),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Note = z.output<typeof noteSchema>;

export const noteParams = z.strictObject({ noteId: z.uuid() });

const title = z.string().trim().min(1).max(200);
const body = z.string().max(10_000);
const status = z.enum(noteStatuses);

export const createNoteBody = z.strictObject({
  title,
  body: body.optional(),
  status: status.optional(),
});

export const updateNoteBody = z
  .strictObject({ title: title.optional(), body: body.optional(), status: status.optional() })
  .refine((change) => Object.keys(change).length > 0, {
    message: 'names no field to change',
  });

export const listNotesQuery = listQuery({
  filters: { status: status.optional(), q: z.string().trim().min(1).max(100).optional() },
  sort: ['createdAt', 'updatedAt', 'title'],
  defaultSort: '-createdAt',
});

export const notesPage = pageSchema(noteSchema);

export type CreateNote = z.output<typeof createNoteBody>;
export type UpdateNote = z.output<typeof updateNoteBody>;
export type ListNotes = z.output<typeof listNotesQuery>;
