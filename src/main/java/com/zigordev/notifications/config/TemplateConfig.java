package com.zigordev.notifications.config;

import freemarker.cache.ClassTemplateLoader;
import freemarker.template.Configuration;
import freemarker.template.TemplateExceptionHandler;
import org.springframework.context.annotation.Bean;

@org.springframework.context.annotation.Configuration
public class TemplateConfig {

  @Bean
  Configuration freemarkerConfiguration() {
    Configuration configuration = new Configuration(Configuration.VERSION_2_3_33);
    configuration.setTemplateLoader(new ClassTemplateLoader(getClass(), "/templates"));
    configuration.setDefaultEncoding("UTF-8");
    configuration.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);
    configuration.setLogTemplateExceptions(false);
    configuration.setWrapUncheckedExceptions(true);
    return configuration;
  }
}
