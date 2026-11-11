export function SetupNotice() {
  const code = "rounded bg-muted px-1 py-0.5 font-mono";
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-xl font-semibold text-foreground">Connect the database to continue</h1>
      <p className="mt-2 text-[14px] text-foreground/70">
        The tracker needs its Supabase database and a login secret before it can start.
      </p>
      <ol className="mt-6 space-y-3 text-[13px] text-foreground/85">
        <li>
          <strong className="font-semibold">1.</strong> Create a Supabase project and run{" "}
          <code className={code}>supabase db push</code> to apply{" "}
          <code className={code}>supabase/migrations</code>, then{" "}
          <code className={code}>supabase/seed.sql</code> for sample data.
        </li>
        <li>
          <strong className="font-semibold">2.</strong> Copy{" "}
          <code className={code}>.env.example</code> to <code className={code}>.env</code> and
          fill in <code className={code}>DATABASE_URL</code> and{" "}
          <code className={code}>AUTH_SECRET</code>.
        </li>
        <li>
          <strong className="font-semibold">3.</strong> Restart{" "}
          <code className={code}>npm run dev</code> and sign in (sample login:{" "}
          <code className={code}>sabbir@example.com</code> /{" "}
          <code className={code}>password123</code>).
        </li>
      </ol>
    </div>
  );
}
