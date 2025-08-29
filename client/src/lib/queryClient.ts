// client/src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

type Method = "GET" | "POST" | "PUT" | "DELETE";

export async function apiRequest(
  method: Method,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  const res = await fetch(url, {
    method,
    credentials: "include", // <-- CRUCIAL FOR SESSIONS
    headers: {
      "Content-Type": body instanceof FormData ? undefined! : "application/json",
      ...headers,
    },
    body: body
      ? body instanceof FormData
        ? (body as FormData)
        : JSON.stringify(body)
      : undefined,
  });

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.clone().json();
      if (j?.message) msg = j.message;
    } catch {}
    throw new Error(msg);
  }
  return res;
}
