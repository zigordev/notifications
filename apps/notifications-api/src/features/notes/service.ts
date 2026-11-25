import { decodeCursor, notFound, type Page, pageOf, parseSort } from '@zigordev/api';
import type { NoteRow, NotesRepository } from './repository.ts';
import type { CreateNote, ListNotes, Note, UpdateNote } from './schemas.ts';

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function missing(noteId: string): Error {
  return notFound('note.not_found', 'No note has this id.', { noteId });
}

export function notesService(repository: NotesRepository) {
  return {
    async list(query: ListNotes): Promise<Page<Note>> {
      const { field, direction } = parseSort(query.sort);
      const rows = await repository.list({
        status: query.status,
        q: query.q,
        field,
        direction,
        after: query.cursor === undefined ? undefined : decodeCursor(query.cursor, query.sort, 2),
        limit: query.limit,
      });
      const page = pageOf(rows.map(toNote), query.limit, query.sort, (note) => [
        note[field],
        note.id,
      ]);
      return page;
    },
    async get(noteId: string): Promise<Note> {
      const row = await repository.find(noteId);
      if (row === undefined) {
        throw missing(noteId);
      }
      return toNote(row);
    },
    async create(note: CreateNote): Promise<Note> {
      return toNote(await repository.create(note));
    },
    async update(noteId: string, change: UpdateNote): Promise<Note> {
      const row = await repository.update(noteId, change);
      if (row === undefined) {
        throw missing(noteId);
      }
      return toNote(row);
    },
    async remove(noteId: string): Promise<void> {
      if (!(await repository.remove(noteId))) {
        throw missing(noteId);
      }
    },
  };
}
