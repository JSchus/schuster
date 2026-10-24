"use client";

import { useEffect } from "react";

const PREFIX = "progress-pending:";

/**
 * Sends reading positions that were saved while offline, from any page, as
 * soon as there's a connection, so another device sees them without this one
 * reopening each book. The server ignores anything older than what it has.
 */
export function ProgressFlusher() {
  useEffect(() => {
    const flush = () => {
      if (!navigator.onLine) return;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        const body = localStorage.getItem(key);
        if (!body) continue;
        void fetch(`/api/progress/${key.slice(PREFIX.length)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        })
          .then((res) => {
            // Done (or permanently rejected, e.g. the book was deleted).
            if ((res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) && localStorage.getItem(key) === body) {
              localStorage.removeItem(key);
            }
          })
          .catch(() => {});
      }
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
  return null;
}
