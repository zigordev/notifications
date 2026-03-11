<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New CV Contact Message</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px; background-color: #f8fafc; }
    .card { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08); }
    .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #475569; margin-bottom: 16px; }
    .title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0 0 8px; }
    .meta { margin: 20px 0; padding: 18px; border-radius: 12px; background-color: #f1f5f9; }
    .meta p { margin: 0 0 10px; }
    .meta p:last-child { margin-bottom: 0; }
    .label { font-weight: 700; color: #0f172a; }
    .message { margin-top: 24px; padding: 20px; border-radius: 12px; border: 1px solid #cbd5e1; background-color: #ffffff; white-space: pre-wrap; }
    .footer { margin-top: 24px; font-size: 13px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">CV Contact</div>
    <h1 class="title">${subjectLine}</h1>
    <p>A new contact request was sent from the CV site.</p>

    <div class="meta">
      <p><span class="label">From:</span> ${senderName}</p>
      <p><span class="label">Email:</span> ${senderEmail}</p>
      <#if pageUrl?? && pageUrl?has_content>
      <p><span class="label">Page:</span> ${pageUrl}</p>
      </#if>
      <#if locale?? && locale?has_content>
      <p><span class="label">Locale:</span> ${locale}</p>
      </#if>
      <p><span class="label">Submitted:</span> ${submittedAt}</p>
    </div>

    <div class="message">${message}</div>

    <div class="footer">
      Reply directly to this email to answer ${senderName}.
    </div>
  </div>
</body>
</html>
