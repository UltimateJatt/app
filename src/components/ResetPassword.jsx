import { useState } from "react";
import { supabase } from "../supabase.js";

export default function ResetPassword({ onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (pw.length < 8) return setError("Password must be at least 8 characters.");
    if (pw !== pw2) return setError("The two passwords don't match.");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);

    if (error) {
      setError(/expired|invalid/i.test(error.message)
        ? "That reset link has expired. Request a new one from the sign-in screen."
        : error.message);
      return;
    }
    // Clear the recovery token out of the address bar so a refresh
    // does not drop the person back into this screen.
    window.history.replaceState(null, "", window.location.pathname);
    onDone();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="display">Set a new<br />password</div>
          <p>Then you're back in.</p>
        </div>

        <div className="card">
          <div className="card-body">
            {error && <div className="msg msg-err" role="alert">{error}</div>}

            <div className="field">
              <label htmlFor="np">New password</label>
              <input id="np" type="password" value={pw} autoComplete="new-password"
                onChange={e => setPw(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="np2">Type it again</label>
              <input id="np2" type="password" value={pw2} autoComplete="new-password"
                onChange={e => setPw2(e.target.value)}
                onKeyDown={e => e.key === "Enter" && save()} />
            </div>

            <button className="btn-primary" style={{ width: "100%" }}
              onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Save password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
