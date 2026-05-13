package com.zigordev.notifications.mail;

import freemarker.template.Configuration;
import freemarker.template.Template;
import freemarker.template.TemplateException;
import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

@Component
public class TemplateCatalog {
  private static final String DEFAULT_LOCALE = "es";

  private final Configuration freemarker;
  private final Map<String, Map<String, TemplateDefinition>> definitions;

  public TemplateCatalog(@Qualifier("freemarkerConfiguration") Configuration freemarker) {
    this.freemarker = freemarker;
    this.definitions = Map.of(
        "gpool.pool-invitation",
        localized(
            new TemplateDefinition(
                "Te han invitado a unirte a ${poolName} en GPool",
                "email/gpool/es/pool-invitation.ftlh"
            ),
            new TemplateDefinition(
                "You've been invited to join ${poolName} on GPool",
                "email/gpool/pool-invitation.ftlh"
            )
        ),
        "gpool.pool-access-request",
        localized(
            new TemplateDefinition(
                "Solicitud de acceso a ${poolName} en GPool",
                "email/gpool/es/pool-access-request.ftlh"
            ),
            new TemplateDefinition(
                "Pool access request for ${poolName} on GPool",
                "email/gpool/pool-access-request.ftlh"
            )
        ),
        "gpool.pool-access-granted",
        localized(
            new TemplateDefinition(
                "Acceso concedido a ${poolName} en GPool",
                "email/gpool/es/pool-access-granted.ftlh"
            ),
            new TemplateDefinition(
                "Access granted to ${poolName} on GPool",
                "email/gpool/pool-access-granted.ftlh"
            )
        ),
        "gpool.user-accepted-invitation",
        localized(
            new TemplateDefinition(
                "${userName} ha aceptado tu invitación a ${poolName} en GPool",
                "email/gpool/es/user-accepted-invitation.ftlh"
            ),
            new TemplateDefinition(
                "${userName} accepted your invitation to ${poolName} on GPool",
                "email/gpool/user-accepted-invitation.ftlh"
            )
        ),
        "cv.contact-message",
        Map.of(
            DEFAULT_LOCALE,
            new TemplateDefinition(
                "CV contact: ${subjectLine} (${senderName})",
                "email/cv/contact-message.ftlh"
            )
        )
    );
  }

  public RenderedEmail render(String templateId, Map<String, Object> data)
      throws IOException, TemplateException {
    TemplateDefinition definition = localizedDefinition(templateId, data);

    Map<String, Object> model = new HashMap<>(data);
    model.putIfAbsent("generatedAt", Instant.now().toString());
    model.put("locale", normalizeLocale(model.get("locale")));

    Template subjectTemplate = new Template(
        templateId + "-subject",
        new StringReader(definition.subjectTemplate()),
        freemarker
    );

    StringWriter subjectWriter = new StringWriter();
    StringWriter bodyWriter = new StringWriter();
    subjectTemplate.process(model, subjectWriter);
    freemarker.getTemplate(definition.bodyTemplate()).process(model, bodyWriter);

    return new RenderedEmail(subjectWriter.toString(), bodyWriter.toString());
  }

  private TemplateDefinition localizedDefinition(String templateId, Map<String, Object> data) {
    Map<String, TemplateDefinition> localizedDefinitions = definitions.get(templateId);
    if (localizedDefinitions == null) {
      throw new IllegalArgumentException("Unsupported templateId: " + templateId);
    }

    String locale = normalizeLocale(data.get("locale"));
    return localizedDefinitions.getOrDefault(
        locale,
        localizedDefinitions.get(DEFAULT_LOCALE)
    );
  }

  private static Map<String, TemplateDefinition> localized(
      TemplateDefinition spanishDefinition,
      TemplateDefinition englishDefinition
  ) {
    return Map.of(DEFAULT_LOCALE, spanishDefinition, "en", englishDefinition);
  }

  private String normalizeLocale(Object value) {
    if (!(value instanceof String rawLocale)) {
      return DEFAULT_LOCALE;
    }
    String locale = rawLocale.trim().toLowerCase();
    int dashSeparator = locale.indexOf('-');
    int underscoreSeparator = locale.indexOf('_');
    int separator = dashSeparator >= 0 ? dashSeparator : underscoreSeparator;
    if (separator >= 0) {
      locale = locale.substring(0, separator);
    }
    return "en".equals(locale) ? "en" : DEFAULT_LOCALE;
  }
}
