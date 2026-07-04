"use client";

// Minimal client wrapper whose ONLY job is a native confirm() gate before the
// delete Server Action fires. It receives the server action + the user id as
// props — it imports nothing from the admin DAL and references no secret, so it
// is safe to ship to the browser. Authorization is still enforced server-side
// inside the action itself (defense in depth).

import { useRef } from "react";

export default function DeleteUserForm({
  action,
  userId,
  userLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  userId: string;
  userLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Permanently delete ${userLabel} and ALL their data? This cannot be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
      style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
    >
      <input type="hidden" name="id" value={userId} />
      <input type="hidden" name="confirm" value="DELETE" />
      <button
        type="submit"
        className="mono"
        style={{
          fontSize: 12,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: "10px 16px",
          background: "var(--accent)",
          color: "var(--onAccent)",
          border: "1px solid var(--accent)",
          cursor: "pointer",
        }}
      >
        Delete user
      </button>
      <span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>
        Requires confirmation
      </span>
    </form>
  );
}
