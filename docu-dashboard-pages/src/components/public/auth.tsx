import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowLeft, Eye, EyeOff, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAccount } from "@/lib/account";
import studio from "@/assets/landing-studio.jpg";
import { PublicBrand } from "./brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthPage({ mode }: { mode: "signin" | "signup" | "forgot" | "reset" }) {
  const navigate = useNavigate();
  const { user, loading } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [visible, setVisible] = useState(false);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => { if (mode === "reset") setRecovery(window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).get("type") === "recovery"); }, [mode]);
  useEffect(() => { if (!loading && user && (mode === "signin" || mode === "signup")) void navigate({ to: "/home", replace: true }); }, [user, loading, mode, navigate]);
  const title = { signin: "Welcome back.", signup: "Your next idea starts here.", forgot: "Forgot your password?", reset: "A fresh start." }[mode];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") || "").trim();
    const password = String(fields.get("password") || "");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { display_name: String(fields.get("name") || "").trim() } } });
        if (error) throw error;
        if (!data.session) setSuccess("Check your email to confirm your account, then sign in to your workspace.");
        else await navigate({ to: "/home", replace: true });
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await navigate({ to: "/home", replace: true });
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setSuccess("If an account exists for this address, a password reset link is on its way.");
      } else {
        if (!recovery || !user) throw new Error("Open the password reset link from your email first.");
        if (password !== String(fields.get("confirm"))) throw new Error("Your passwords do not match.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setSuccess("Your password has been updated. You can return to your workspace.");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setError("");
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
      if (result.error) throw result.error;
      if (!result.redirected) await navigate({ to: "/home", replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : "Google sign-in could not start."); }
    finally { setBusy(false); }
  }
  return <div className="auth-page"><header className="auth-header"><PublicBrand /><div className="auth-header-actions"><ThemeToggle /><Button variant="ghost" asChild><Link to="/"><ArrowLeft /> Back to home</Link></Button></div></header><main className="auth-main"><section className="auth-form-section"><span className="eyebrow">YOUR CREATIVE WORKSPACE</span><h1>{title}</h1><p className="auth-subtitle">{mode === "signin" ? "Pick up where your inspiration left off." : mode === "signup" ? "Make room for a little more possibility." : mode === "forgot" ? "We'll send you a link to reset it." : "Choose a new password for your account."}</p>
    {success ? <div className="auth-success" role="status"><CheckCircle2 /><h2>{mode === "signup" ? "Check your inbox" : "You're all set"}</h2><p>{success}</p><Button asChild><Link to={mode === "reset" ? "/home" : "/auth"}>{mode === "reset" ? "Open workspace" : "Back to sign in"}<ArrowRight /></Link></Button></div> : <>
      {(mode === "signin" || mode === "signup") && <><Button variant="outline" className="google-button" disabled={busy} onClick={google}><span className="google-letter" aria-hidden="true">G</span> Continue with Google</Button><div className="auth-divider"><span>or continue with email</span></div></>}
      <form onSubmit={submit} className="auth-form">{mode === "signup" && <label>Full name<input name="name" autoComplete="name" required maxLength={100} placeholder="Your full name" /></label>}{mode !== "reset" && <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label>}{mode !== "forgot" && <label><span>{mode === "reset" ? "New password" : "Password"}{mode === "signin" && <Link to="/forgot-password">Forgot password?</Link>}</span><div className="auth-password"><input name="password" type={visible ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={mode === "signin" ? 1 : 8} placeholder={mode === "signin" ? "Enter your password" : "At least 8 characters"} /><Button type="button" size="icon" variant="ghost" aria-label={visible ? "Hide password" : "Show password"} title={visible ? "Hide password" : "Show password"} onClick={()=>setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</Button></div></label>}{mode === "reset" && <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" required minLength={8} /></label>}
      {mode === "reset" && !recovery && <p className="auth-error" role="alert">Open the password reset link from your email to continue.</p>}{error && <p className="auth-error" role="alert">{error}</p>}
      <Button size="lg" type="submit" disabled={busy || (mode === "reset" && (!recovery || !user))}>{busy ? <Loader2 className="animate-spin" /> : mode === "forgot" ? <Mail /> : null}{busy ? "Please wait…" : { signin:"Sign in", signup:"Create account", forgot:"Send reset link", reset:"Update password" }[mode]}{!busy && <ArrowRight />}</Button></form>
      <p className="auth-switch">{mode === "signin" ? <>New to Marvedge? <Link to="/sign-up">Create an account</Link></> : mode === "signup" ? <>Already have an account? <Link to="/auth">Sign in</Link></> : <Link to="/auth">Back to sign in</Link>}</p>
    </>}
  </section><aside className="auth-visual"><img src={studio} alt="Video editing laptop and camera in a Marvedge-inspired studio" width={1536} height={1024} /><div><span className="eyebrow">A LITTLE MORE POSSIBILITY</span><h2>Big ideas deserve<br />a great first frame.</h2><p>Your recordings, your stories, your creative space.</p></div><span className="auth-visual-footer">marvedge. — made for your next big idea</span></aside></main><footer className="auth-footer">Accounts and profiles are saved securely. Project drafts and media remain session-only.</footer></div>;
}