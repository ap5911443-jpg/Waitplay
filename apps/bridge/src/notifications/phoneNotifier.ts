import https from "node:https";

export interface CompletedTaskNotification {
  agent: string;
  sessionId: string;
  durationMs?: number;
}

interface PhoneNotifierConfig {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
}

function getConfig(): PhoneNotifierConfig | undefined {
  const values = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_FROM_NUMBER,
    to: process.env.WAITPLAY_NOTIFICATION_PHONE,
  };

  if (Object.values(values).every(Boolean)) {
    return values as PhoneNotifierConfig;
  }

  return undefined;
}

function sendSms(config: PhoneNotifierConfig, body: string): Promise<void> {
  const encoded = new URLSearchParams({
    To: config.to,
    From: config.from,
    Body: body,
  }).toString();
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.twilio.com",
        path: `/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(encoded),
        },
        timeout: 10_000,
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Twilio returned HTTP ${response.statusCode}: ${responseBody.slice(0, 300)}`));
          }
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("Twilio request timed out")));
    request.on("error", reject);
    request.end(encoded);
  });
}

export async function notifyTaskCompleted(task: CompletedTaskNotification): Promise<void> {
  const config = getConfig();
  if (!config) {
    return;
  }

  const duration = task.durationMs === undefined
    ? ""
    : ` Duration: ${Math.round(task.durationMs / 1000)}s.`;
  await sendSms(
    config,
    `WaitPlay: ${task.agent} finished work for session ${task.sessionId}.${duration}`
  );
}

export function isPhoneNotificationConfigured(): boolean {
  return getConfig() !== undefined;
}
