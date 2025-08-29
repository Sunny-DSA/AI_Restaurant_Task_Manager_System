// client/src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

type Method = "GET" | "POST" | "PUT" | "DELETE";

export async function apiRequest(method: Method, url: string, body?: unknown) {
  const headers: Record<string, string> = {};
  let fetchBody: BodyInit | undefined;

  if (body instanceof FormData) {
    fetchBody = body;
    // do not set content-type for FormData
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: fetchBody,
    credentials: "include", // 🔑 send/receive the session cookie
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }

  return res;
}
