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
  private final Configuration freemarker;
  private final Map<String, TemplateDefinition> definitions;

  public TemplateCatalog(@Qualifier("freemarkerConfiguration") Configuration freemarker) {
    this.freemarker = freemarker;
    this.definitions = Map.of(
        "gpool.pool-invitation", new TemplateDefinition(
            "You've been invited to join ${poolName} on GPool",
            "email/gpool/pool-invitation.ftlh"
        ),
        "gpool.pool-access-request", new TemplateDefinition(
            "Pool access request for ${poolName} on GPool",
            "email/gpool/pool-access-request.ftlh"
        ),
        "gpool.pool-access-granted", new TemplateDefinition(
            "Access granted to ${poolName} on GPool",
            "email/gpool/pool-access-granted.ftlh"
        ),
        "gpool.user-accepted-invitation", new TemplateDefinition(
            "${userName} accepted your invitation to ${poolName} on GPool",
            "email/gpool/user-accepted-invitation.ftlh"
        )
    );
  }

  public RenderedEmail render(String templateId, Map<String, Object> data)
      throws IOException, TemplateException {
    TemplateDefinition definition = definitions.get(templateId);
    if (definition == null) {
      throw new IllegalArgumentException("Unsupported templateId: " + templateId);
    }

    Map<String, Object> model = new HashMap<>(data);
    model.putIfAbsent("generatedAt", Instant.now().toString());

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
}
