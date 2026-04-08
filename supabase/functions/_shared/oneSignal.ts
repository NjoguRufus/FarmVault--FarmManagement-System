export type OneSignalNotificationPayload = {
  app_id: string;
  headings: Record<string, string>;
  contents: Record<string, string>;
  filters?: Array<{ field: string; key?: string; relation?: string; value?: string }>;
  include_external_user_ids?: string[];
  url?: string;
  data?: Record<string, unknown>;
};

function oneSignalApiKey(): string | null {
  const key = Deno.env.get("ONESIGNAL_REST_API_KEY")?.trim();
  return key || null;
}

function oneSignalAppId(): string | null {
  const id = Deno.env.get("ONESIGNAL_APP_ID")?.trim();
  return id || null;
}

export function isOneSignalConfigured(): boolean {
  return Boolean(oneSignalApiKey() && oneSignalAppId());
}

export async function sendNotification(payload: Omit<OneSignalNotificationPayload, "app_id"> & { app_id?: string }) {
  const apiKey = oneSignalApiKey();
  const appId = payload.app_id?.trim() || oneSignalAppId();
  if (!apiKey || !appId) {
    throw new Error("OneSignal is not configured");
  }

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      ...payload,
      app_id: appId,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`OneSignal API error (${res.status}): ${bodyText}`);
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return { ok: true, raw: bodyText };
  }
}

