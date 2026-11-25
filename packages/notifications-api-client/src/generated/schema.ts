export interface paths {
    "/api/v1/hello": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getHello"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listNotes"];
        put?: never;
        post: operations["createNote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notes/{noteId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getNote"];
        put?: never;
        post?: never;
        delete: operations["deleteNote"];
        options?: never;
        head?: never;
        patch: operations["updateNote"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHello: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message: string;
                    };
                };
            };
        };
    };
    listNotes: {
        parameters: {
            query?: {
                status?: "open" | "done";
                q?: string;
                sort?: "createdAt" | "-createdAt" | "updatedAt" | "-updatedAt" | "title" | "-title";
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            id: string;
                            title: string;
                            body: string;
                            status: "open" | "done";
                            createdAt: string;
                            updatedAt: string;
                        }[];
                        nextCursor?: string;
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
    };
    createNote: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                    body?: string;
                    status?: "open" | "done";
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        title: string;
                        body: string;
                        status: "open" | "done";
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
    };
    getNote: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        title: string;
                        body: string;
                        status: "open" | "done";
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
    };
    deleteNote: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
    };
    updateNote: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title?: string;
                    body?: string;
                    status?: "open" | "done";
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        title: string;
                        body: string;
                        status: "open" | "done";
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        detail: string;
                        instance: string;
                        code: string;
                        params: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
    };
}
