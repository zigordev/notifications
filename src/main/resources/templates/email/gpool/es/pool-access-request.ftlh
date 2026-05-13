<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solicitud de acceso - GPool</title>
  <style>
    body { margin: 0; padding: 0; background: #e6eee8; color: #11181c; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.55; }
    .page { max-width: 640px; margin: 0 auto; padding: 28px 18px; }
    .card { background: #f1f7f3; border: 1px solid #c7d9cc; border-radius: 16px; overflow: hidden; box-shadow: 0 16px 32px rgba(15, 23, 28, 0.10), 0 4px 8px rgba(15, 23, 28, 0.05); }
    .topbar { height: 5px; background: #ea580c; }
    .inner { padding: 32px; }
    .brand { font-size: 26px; font-weight: 800; letter-spacing: -0.01em; color: #11181c; margin: 0 0 22px; }
    .eyebrow { display: inline-block; margin-bottom: 12px; padding: 4px 10px; border: 1px solid rgba(234, 88, 12, 0.30); border-radius: 999px; color: #ea580c; background: rgba(234, 88, 12, 0.10); font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 0 0 16px; color: #11181c; font-size: 24px; line-height: 1.18; font-weight: 800; }
    p { margin: 0 0 14px; color: #475563; font-size: 15px; }
    strong { color: #11181c; font-weight: 800; }
    .info { margin: 20px 0; padding: 14px 16px; background: #d5ddd8; border: 1px solid rgba(199, 217, 204, 0.80); border-radius: 10px; }
    .pool-name { color: #11181c; font-weight: 800; }
    .button-wrap { text-align: center; margin: 26px 0; }
    .button { display: inline-block; padding: 13px 24px; background: #107a4e; color: #ffffff !important; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 800; box-shadow: 0 8px 24px rgba(22, 101, 52, 0.18), 0 2px 6px rgba(234, 88, 12, 0.12); }
    .link-block { font-size: 13px; color: #475563; }
    a { color: #166534; word-break: break-word; }
    .footer { margin-top: 28px; padding-top: 18px; border-top: 1px solid #d8e5db; text-align: center; }
    .footer p { margin: 0 0 8px; font-size: 13px; color: #475563; }
    @media (max-width: 520px) { .page { padding: 16px 10px; } .inner { padding: 24px 18px; } h1 { font-size: 22px; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="card">
      <div class="topbar"></div>
      <div class="inner">
        <div class="brand">GPool</div>
        <span class="eyebrow">Solicitud de acceso</span>
        <h1>Alguien quiere unirse a tu porra</h1>
        <p>Hola,</p>
        <p>Has recibido una nueva solicitud de acceso para <strong class="pool-name">${poolName}</strong>.</p>
        <div class="info">
          <p style="margin: 0;"><strong>Solicitada por:</strong> ${requesterEmail}</p>
        </div>
        <p>Revisa la solicitud y decide si quieres conceder acceso a tu porra.</p>
        <div class="button-wrap">
          <a href="${acceptUrl}" class="button">Revisar solicitud</a>
        </div>
        <p class="link-block">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          <a href="${acceptUrl}">${acceptUrl}</a>
        </p>
        <p class="link-block">
          También puedes ver la porra directamente:<br>
          <a href="${poolUrl}">${poolUrl}</a>
        </p>
        <div class="footer">
          <p>Esta notificación ha sido enviada por GPool. Puedes gestionar las solicitudes desde tu porra.</p>
          <p><a href="${frontendUrl}">Ir a GPool</a></p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
