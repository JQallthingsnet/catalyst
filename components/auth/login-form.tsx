"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_CODE_LEN, AUTH_CODE_TTL_MS } from "@/lib/auth/codes";

type Step = "email" | "code";

const EMPTY_CODE = Array.from({ length: AUTH_CODE_LEN }, () => "");

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  if (!text) return fallback;
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>([...EMPTY_CODE]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifyingRef = useRef(false);
  const codeString = code.join("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step !== "code") return;
    const timer = window.setTimeout(() => inputRefs.current[0]?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [step]);

  const clearCode = useCallback(() => {
    setCode([...EMPTY_CODE]);
  }, []);

  const handleVerify = useCallback(
    async (value: string) => {
      const normalized = digitsOnly(value).slice(0, AUTH_CODE_LEN);
      if (normalized.length !== AUTH_CODE_LEN || verifyingRef.current) return;

      verifyingRef.current = true;
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/auth/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: email.trim().toLowerCase(), code: normalized }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "Could not verify that code."));
          clearCode();
          inputRefs.current[0]?.focus();
          return;
        }
        window.location.assign("/dashboard");
      } catch {
        setError("Could not verify that code.");
        clearCode();
      } finally {
        setLoading(false);
        verifyingRef.current = false;
      }
    },
    [clearCode, email],
  );

  async function sendCode() {
    setError("");
    setDevCode(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Could not send the login code."));
        return;
      }
      const data = (await res.json()) as { devCode?: string };
      setDevCode(data.devCode ?? null);
      setStep("code");
      clearCode();
      setCooldown(AUTH_CODE_TTL_MS / 1000);
    } catch {
      setError("Could not send the login code.");
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(index: number, value: string) {
    const digit = digitsOnly(value).slice(-1);
    if (value && !digit) return;
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError("");
    if (digit && index < AUTH_CODE_LEN - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.join("").length === AUTH_CODE_LEN) {
      void handleVerify(next.join(""));
    }
  }

  function handleCodeKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleCodePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = digitsOnly(event.clipboardData.getData("text")).slice(0, AUTH_CODE_LEN);
    if (!pasted) return;
    const next = [...EMPTY_CODE];
    pasted.split("").forEach((digit, index) => {
      next[index] = digit;
    });
    setCode(next);
    if (pasted.length === AUTH_CODE_LEN) {
      void handleVerify(pasted);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">Sign in</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">
        {step === "email" ? "Enter your email" : "Enter your 8-digit code"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {step === "email"
          ? "We’ll send an 8-digit passcode to this address. First sign-in creates your account."
          : `Code sent to ${email}. It is valid for 5 minutes.`}
      </p>

      {step === "email" ? (
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-900">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              placeholder="you@company.com"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50"
            />
          </label>
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send passcode"}
          </button>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex justify-center gap-1.5 sm:gap-2">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                value={digit}
                disabled={loading}
                aria-label={`Digit ${index + 1} of 8`}
                onChange={(event) => handleCodeChange(index, event.target.value)}
                onKeyDown={(event) => handleCodeKeyDown(index, event)}
                onPaste={handleCodePaste}
                onFocus={(event) => event.target.select()}
                className="h-11 w-8 rounded-lg border border-slate-300 text-center text-lg font-semibold outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50 sm:h-12 sm:w-10"
              />
            ))}
          </div>
          {devCode ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
              Local testing code: <strong className="tracking-widest">{devCode}</strong>
            </p>
          ) : null}
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setStep("email");
                clearCode();
                setError("");
                setDevCode(null);
              }}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={loading || codeString.length !== AUTH_CODE_LEN}
              onClick={() => void handleVerify(codeString)}
              className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Checking…" : "Sign in"}
            </button>
          </div>
          <button
            type="button"
            disabled={loading || cooldown > 0}
            onClick={() => void sendCode()}
            className="w-full text-sm text-slate-600 hover:text-slate-950 disabled:text-slate-400"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      )}
    </div>
  );
}
