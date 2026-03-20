/// <reference types="@cloudflare/workers-types" />

export class EmailService {
  static async send(to: string, subject: string, html: string) {
    const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to }],
          },
        ],
        from: {
          email: "noreply@cafeasiana.com.mv",
          name: "Cafe Asiana OmniStock",
        },
        subject: subject,
        content: [
          {
            type: "text/html",
            value: html,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${error}`);
    }
  }
}
