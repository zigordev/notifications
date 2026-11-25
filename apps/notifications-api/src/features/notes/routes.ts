import { type ApiPlugin, problemResponses, requireScope } from '@zigordev/api';
import * as z from 'zod';
import { type Database, notesRepository } from './repository.ts';
import {
  createNoteBody,
  listNotesQuery,
  noteParams,
  noteSchema,
  notesPage,
  updateNoteBody,
} from './schemas.ts';
import { notesService } from './service.ts';

export interface NotesOptions {
  readonly db: Database;
}

export const notes: ApiPlugin<NotesOptions> = async (app, options) => {
  const service = notesService(notesRepository(options.db));
  const tags = ['notes'];

  app.get(
    '',
    {
      schema: {
        summary: 'List the notes',
        tags,
        operationId: 'listNotes',
        querystring: listNotesQuery,
        response: { 200: notesPage, ...problemResponses(400, 401, 403) },
      },
    },
    async (request) => {
      requireScope(request, 'notes:read');
      return service.list(request.query);
    }
  );

  app.post(
    '',
    {
      schema: {
        summary: 'Create a note',
        tags,
        operationId: 'createNote',
        body: createNoteBody,
        response: { 201: noteSchema, ...problemResponses(400, 401, 403) },
      },
    },
    async (request, reply) => {
      requireScope(request, 'notes:write');
      const note = await service.create(request.body);
      request.log.info({ event: 'note.created', noteId: note.id });
      return reply.code(201).header('location', `/api/v1/notes/${note.id}`).send(note);
    }
  );

  app.get(
    '/:noteId',
    {
      schema: {
        summary: 'Get one note',
        tags,
        operationId: 'getNote',
        params: noteParams,
        response: { 200: noteSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) => {
      requireScope(request, 'notes:read');
      return service.get(request.params.noteId);
    }
  );

  app.patch(
    '/:noteId',
    {
      schema: {
        summary: 'Change a note',
        tags,
        operationId: 'updateNote',
        params: noteParams,
        body: updateNoteBody,
        response: { 200: noteSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) => {
      requireScope(request, 'notes:write');
      return service.update(request.params.noteId, request.body);
    }
  );

  app.delete(
    '/:noteId',
    {
      schema: {
        summary: 'Delete a note',
        tags,
        operationId: 'deleteNote',
        params: noteParams,
        response: {
          204: z.null().describe('The note is deleted.'),
          ...problemResponses(400, 401, 403, 404),
        },
      },
    },
    async (request, reply) => {
      requireScope(request, 'notes:write');
      await service.remove(request.params.noteId);
      request.log.info({ event: 'note.deleted', noteId: request.params.noteId });
      return reply.code(204).send(null);
    }
  );
};
