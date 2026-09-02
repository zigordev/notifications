import { NonRetryableNotificationError } from '../common/errors';
import { TemplateCatalogService } from './template-catalog.service';

describe('TemplateCatalogService', () => {
  const catalog = new TemplateCatalogService();
  const invitationData = {
    poolName: 'Champions <script>',
    inviterEmail: 'admin@example.com',
    acceptUrl: 'https://example.com/accept?a=1&b=2',
    poolUrl: 'https://example.com/pool',
    frontendUrl: 'https://example.com',
  };
  const allTemplateCases = [
    {
      templateId: 'gpool.pool-invitation',
      data: invitationData,
      es: 'Te han invitado a unirte a Champions <script> en GPool',
      en: "You've been invited to join Champions <script> on GPool",
    },
    {
      templateId: 'gpool.pool-access-request',
      data: {
        poolName: 'Champions',
        requesterEmail: 'requester@example.com',
        acceptUrl: 'https://example.com/review',
        poolUrl: 'https://example.com/pool',
        frontendUrl: 'https://example.com',
      },
      es: 'Solicitud de acceso a Champions en GPool',
      en: 'Pool access request for Champions on GPool',
    },
    {
      templateId: 'gpool.pool-access-granted',
      data: {
        poolName: 'Champions',
        userName: 'Taylor',
        poolUrl: 'https://example.com/pool',
        frontendUrl: 'https://example.com',
      },
      es: 'Acceso concedido a Champions en GPool',
      en: 'Access granted to Champions on GPool',
    },
    {
      templateId: 'gpool.user-accepted-invitation',
      data: {
        poolName: 'Champions',
        userName: 'Taylor',
        userEmail: 'taylor@example.com',
        poolUrl: 'https://example.com/pool',
        frontendUrl: 'https://example.com',
      },
      es: 'Taylor ha aceptado tu invitación a Champions en GPool',
      en: 'Taylor accepted your invitation to Champions on GPool',
    },
    {
      templateId: 'cv.contact-received',
      data: {
        name: 'Taylor',
        email: 'taylor@example.com',
        message: 'Hello, I saw your CV.',
      },
      es: 'Nuevo mensaje de Taylor desde tu CV',
      en: 'New message from Taylor via your CV',
    },
    {
      templateId: 'kini.team-invitation',
      data: {
        teamName: 'Champions',
        inviterName: 'Taylor',
        inviterEmail: 'taylor@example.com',
        acceptUrl: 'https://example.com/accept',
        frontendUrl: 'https://example.com',
      },
      es: 'Te han invitado a unirte a Champions en Kini',
      en: "You've been invited to join Champions on Kini",
    },
  ] as const;

  it.each(
    allTemplateCases.flatMap((templateCase) =>
      (['es', 'en'] as const).map((locale) => ({
        templateId: templateCase.templateId,
        data: templateCase.data,
        locale,
        expectedSubject: templateCase[locale],
      }))
    )
  )(
    'renders $templateId in $locale without unresolved placeholders',
    async ({ templateId, data, locale, expectedSubject }) => {
      const result = await catalog.render(templateId, { ...data, locale });

      expect(result.subject).toBe(expectedSubject);
      expect(result.html).toContain(`lang="${locale}"`);
      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).not.toMatch(/\{\{[^}]+\}\}/);
    }
  );

  it('defaults to the existing Spanish locale and escapes HTML data', async () => {
    const result = await catalog.render('gpool.pool-invitation', invitationData);

    expect(result.subject).toBe('Te han invitado a unirte a Champions <script> en GPool');
    expect(result.html).toContain('lang="es"');
    expect(result.html).toContain('Champions &lt;script&gt;');
    expect(result.html).toContain('accept?a&#x3D;1&amp;b&#x3D;2');
  });

  it('normalizes locale variants and renders the English template', async () => {
    const result = await catalog.render('gpool.pool-invitation', {
      ...invitationData,
      locale: 'en-US',
    });

    expect(result.subject).toBe("You've been invited to join Champions <script> on GPool");
    expect(result.html).toContain('lang="en"');
  });

  it('preserves the key fallback used by the legacy templates', async () => {
    const result = await catalog.render('kini.team-invitation', {
      locale: 'en',
      teamName: 'Team',
      inviterEmail: 'admin@example.com',
      acceptUrl: 'https://example.com/accept',
      frontendUrl: 'https://example.com',
    });

    expect(result.html).toContain('<strong>admin@example.com</strong> invited you');
  });

  it('uses the literal fallback from the access-granted template', async () => {
    const result = await catalog.render('gpool.pool-access-granted', {
      locale: 'en',
      poolName: 'Pool',
      poolUrl: 'https://example.com/pool',
      frontendUrl: 'https://example.com',
    });

    expect(result.html).toContain('<p>Hello there,</p>');
  });

  it('falls back to the default locale for an unsupported language tag', async () => {
    const result = await catalog.render('cv.contact-received', {
      locale: 'pt',
      name: 'Taylor',
      email: 'taylor@example.com',
      message: 'Ola',
    });

    expect(result.subject).toBe('Nuevo mensaje de Taylor desde tu CV');
    expect(result.html).toContain('lang="es"');
  });

  it('escapes the sender-controlled contact message', async () => {
    const result = await catalog.render('cv.contact-received', {
      locale: 'en',
      name: 'Taylor',
      email: 'taylor@example.com',
      message: '<img src=x onerror=alert(1)>\nsecond line',
    });

    expect(result.html).not.toContain('<img src=x');
    expect(result.html).toContain('&lt;img src&#x3D;x');
    // pre-wrap keeps the newline meaningful without unescaped HTML
    expect(result.html).toContain('second line');
    expect(result.html).toContain('white-space: pre-wrap');
  });

  it('rejects an unsupported template as non-retryable', async () => {
    await expect(catalog.render('unknown', {})).rejects.toBeInstanceOf(
      NonRetryableNotificationError
    );
  });
});
