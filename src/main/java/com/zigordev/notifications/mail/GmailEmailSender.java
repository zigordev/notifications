package com.zigordev.notifications.mail;

import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
public class GmailEmailSender {
  private final JavaMailSender mailSender;

  public GmailEmailSender(JavaMailSender mailSender) {
    this.mailSender = mailSender;
  }

  public void send(String from, String to, RenderedEmail email) throws Exception {
    MimeMessage message = mailSender.createMimeMessage();
    MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
    helper.setFrom(from);
    helper.setTo(to);
    helper.setSubject(email.subject());
    helper.setText(email.html(), true);
    mailSender.send(message);
  }
}
