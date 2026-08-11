import { useState } from "react";
import { supabase } from "../supabase.js";

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isRegister = mode === "register";

  async function submit() {
    setError(""); setNotice("");

    if (!email.trim()) return setError("Enter your email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (isRegister && !displayName.trim()) return setError("Enter the name you want shown on the leaderboard.");
    if (isRegister && !inviteCode.trim()) return setError("Enter the invite code you were given.");

    setBusy(true);
    try {
      if (isRegister) {
        const { data: ok, error: codeErr } = await supabase
          .rpc("check_invite_code", { p_code: inviteCode.trim() });
        if (codeErr) throw codeErr;
        if (!ok) throw new Error("That invite code is not valid. Check with whoever invited you.");

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (error) throw error;
        sessionStorage.setItem("boxpool_invite", inviteCode.trim());
        setNotice("Account created. Signing you in...");
        const { error: e2 } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (e2) { setMode("signin"); setNotice("Account created. Sign in to continue."); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (error) throw error;
        // The session listener in App takes over from here.
      }
    } catch (e) {
      setError(friendly(e.message));
    } finally {
      setBusy(false);
    }
  }

  function friendly(msg) {
    if (/invalid login/i.test(msg)) return "That email and password combination doesn't match an account.";
    if (/already registered/i.test(msg)) return "An account already exists for that email. Sign in instead.";
    if (/confirm/i.test(msg)) return "Confirm your email address first. Check your inbox for the link.";
    return msg;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="display">NFL Fantasy<br />Box Pool</div>
          <p>One player from every tier. No trades. No lineups.</p>
        </div>

        <div className="card">
          <div className="card-body">
            {error && <div className="msg msg-err" role="alert">{error}</div>}
            {notice && <div className="msg msg-ok" role="status">{notice}</div>}

            {isRegister && (
              <div className="field">
                <label htmlFor="ic">Invite code</label>
                <input id="ic" value={inviteCode} autoCapitalize="characters"
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder="From whoever invited you" />
              </div>
            )}

            {isRegister && (
              <div className="field">
                <label htmlFor="dn">Display name</label>
                <input id="dn" value={displayName} autoComplete="name"
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="How you appear on the leaderboard" />
              </div>
            )}

            <div className="field">
              <label htmlFor="em">Email</label>
              <input id="em" type="email" value={email} autoComplete="email"
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()} />
            </div>

            <div className="field">
              <label htmlFor="pw">Password</label>
              <input id="pw" type="password" value={password}
                autoComplete={isRegister ? "new-password" : "current-password"}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()} />
            </div>

            <button className="btn-primary" style={{ width: "100%" }}
              onClick={submit} disabled={busy}>
              {busy ? "Working..." : isRegister ? "Create account" : "Sign in"}
            </button>

            <div className="auth-switch">
              {isRegister ? "Already have an account?" : "New to the pool?"}{" "}
              <button onClick={() => { setMode(isRegister ? "signin" : "register"); setError(""); }}>
                {isRegister ? "Sign in" : "Create one"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
