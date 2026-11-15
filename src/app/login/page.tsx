"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/authActions";
import { Spinner } from "@/components/Spinner";
import { BrandMark } from "@/components/BrandMark";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const wanted = params.get("next") || "/";
  const next = wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const result = await signIn(email, password);

    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm p-6">
      <div className="mb-5 flex items-center gap-2.5">
        <BrandMark className="size-7" />
        <div className="leading-tight">
          <div className="text-[16px] font-semibold">Publish Tracker</div>
          <div className="text-[12px] text-muted-foreground">Store submissions</div>
        </div>
      </div>

      <label className="label" htmlFor="email">
        Work email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="field mb-3"
      />

      <label className="label" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="field"
      />

      {error && (
        <p className="mt-3 rounded-md bg-bad-soft px-2.5 py-2 text-[12px] text-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn btn-primary mt-5 w-full justify-center">
        {busy ? (
          <>
            <Spinner /> Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>

      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground/80">
        No account yet? Ask an admin to add you.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
