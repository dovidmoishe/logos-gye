import nodemailer from "nodemailer";

type Message = { to: string; subject: string; text: string; messageId: string };

export function partnerEmailTransport(from: string, apiKey?: string, smtpUrl?: string) {
  if (apiKey && smtpUrl) throw new Error("Choose one partner email transport.");
  if (apiKey) {
    return {
      async send(message: Message) {
        const response = await fetch("https://api.senviok.live/v1/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
          body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text }),
        });
        if (!response.ok) throw new Error("Senviok HTTP " + response.status);
        // A successful HTTP response means the provider accepted the message.
        // An unreadable receipt after acceptance should not cause a second send.
        return (await response.json().catch(() => null))?.id as string | undefined;
      },
      close() {},
    };
  }
  if (!smtpUrl) return;
  const smtp = new URL(smtpUrl);
  if (!["smtp:", "smtps:"].includes(smtp.protocol)) throw new Error("Configure an SMTP transport");
  smtp.searchParams.set("connectionTimeout", "10000");
  smtp.searchParams.set("greetingTimeout", "10000");
  smtp.searchParams.set("socketTimeout", "15000");
  const transport = nodemailer.createTransport(smtp.href);
  return {
    async send(message: Message) {
      return (await transport.sendMail({ ...message, from, to: { name: "", address: message.to } })).messageId;
    },
    close() { transport.close(); },
  };
}
