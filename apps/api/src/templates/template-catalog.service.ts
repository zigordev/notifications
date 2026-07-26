import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NonRetryableNotificationError } from '../common/errors';

export interface RenderedEmail {
  subject: string;
  html: string;
}

interface TemplateDefinition {
  subjectTemplate: string;
  bodyTemplate: string;
}

type Locale = 'en' | 'es';

const DEFAULT_LOCALE: Locale = 'es';

const DEFINITIONS: Readonly<Record<string, Readonly<Record<Locale, TemplateDefinition>>>> = {
  'gpool.pool-invitation': localized(
    'Te han invitado a unirte a {{poolName}} en GPool',
    'email/gpool/es/pool-invitation.html',
    "You've been invited to join {{poolName}} on GPool",
    'email/gpool/pool-invitation.html'
  ),
  'gpool.pool-access-request': localized(
    'Solicitud de acceso a {{poolName}} en GPool',
    'email/gpool/es/pool-access-request.html',
    'Pool access request for {{poolName}} on GPool',
    'email/gpool/pool-access-request.html'
  ),
  'gpool.pool-access-granted': localized(
    'Acceso concedido a {{poolName}} en GPool',
    'email/gpool/es/pool-access-granted.html',
    'Access granted to {{poolName}} on GPool',
    'email/gpool/pool-access-granted.html'
  ),
  'gpool.user-accepted-invitation': localized(
    '{{userName}} ha aceptado tu invitación a {{poolName}} en GPool',
    'email/gpool/es/user-accepted-invitation.html',
    '{{userName}} accepted your invitation to {{poolName}} on GPool',
    'email/gpool/user-accepted-invitation.html'
  ),
  'kini.team-invitation': localized(
    'Te han invitado a unirte a {{teamName}} en Kini',
    'email/kini/es/team-invitation.html',
    "You've been invited to join {{teamName}} on Kini",
    'email/kini/team-invitation.html'
  ),
};

@Injectable()
export class TemplateCatalogService {
  private readonly templateRoot = join(__dirname, '../resources/templates');
  private readonly bodyCache = new Map<string, string>();
  private readonly handlebars = Handlebars.create();

  constructor() {
    this.handlebars.registerHelper(
      'default',
      (value: unknown, fallback: unknown) => value ?? fallback
    );
  }

  async render(templateId: string, data: Record<string, unknown>): Promise<RenderedEmail> {
    const locale = normalizeLocale(data.locale);
    const definition = DEFINITIONS[templateId]?.[locale];
    if (!definition) {
      throw new NonRetryableNotificationError(`Unsupported templateId: ${templateId}`);
    }

    const model: Record<string, unknown> = {
      ...data,
      generatedAt: data.generatedAt ?? new Date().toISOString(),
      locale,
    };
    const bodyTemplate = await this.loadBody(definition.bodyTemplate);

    try {
      return {
        subject: this.handlebars.compile(definition.subjectTemplate, {
          noEscape: true,
          strict: true,
        })(model),
        html: this.handlebars.compile(bodyTemplate, { strict: true })(model),
      };
    } catch (error) {
      throw new NonRetryableNotificationError(`Failed to render template ${templateId}`, {
        cause: error,
      });
    }
  }

  private async loadBody(relativePath: string): Promise<string> {
    const cached = this.bodyCache.get(relativePath);
    if (cached !== undefined) {
      return cached;
    }
    const template = await readFile(join(this.templateRoot, relativePath), 'utf8');
    this.bodyCache.set(relativePath, template);
    return template;
  }
}

function localized(
  spanishSubject: string,
  spanishBody: string,
  englishSubject: string,
  englishBody: string
): Readonly<Record<Locale, TemplateDefinition>> {
  return {
    es: {
      subjectTemplate: spanishSubject,
      bodyTemplate: spanishBody,
    },
    en: {
      subjectTemplate: englishSubject,
      bodyTemplate: englishBody,
    },
  };
}

function normalizeLocale(value: unknown): Locale {
  if (typeof value !== 'string') {
    return DEFAULT_LOCALE;
  }
  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return language === 'en' ? 'en' : DEFAULT_LOCALE;
}
