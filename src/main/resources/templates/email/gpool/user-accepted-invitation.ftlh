<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation Accepted - GPool</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
    .container { background-color: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 32px; font-weight: bold; color: #89986D; margin-bottom: 10px; }
    .title { font-size: 24px; font-weight: 600; color: #333; margin-bottom: 20px; }
    .pool-name { font-size: 20px; font-weight: 600; color: #89986D; margin: 20px 0; }
    .button { display: inline-block; padding: 14px 28px; background-color: #89986D; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; text-align: center; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666; text-align: center; }
    .user-info { background-color: #F6F0D7; padding: 15px; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">GPool</div>
    </div>
    <h1 class="title">Invitation Accepted!</h1>
    <p>Hello,</p>
    <p>Great news. <strong>${userName}</strong> has accepted your invitation to join <strong class="pool-name">${poolName}</strong>.</p>
    <div class="user-info">
      <p style="margin: 0;"><strong>New member:</strong> ${userName} (${userEmail})</p>
    </div>
    <p>They are now a member of your pool and can start making predictions.</p>
    <div style="text-align: center;">
      <a href="${poolUrl}" class="button">View Pool</a>
    </div>
    <p style="font-size: 14px; color: #666;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${poolUrl}" style="color: #89986D; word-break: break-all;">${poolUrl}</a>
    </p>
    <div class="footer">
      <p>This notification was sent by GPool. You can manage your pool members from your pool dashboard.</p>
      <p style="margin-top: 10px;"><a href="${frontendUrl}" style="color: #89986D;">Visit GPool</a></p>
    </div>
  </div>
</body>
</html>
