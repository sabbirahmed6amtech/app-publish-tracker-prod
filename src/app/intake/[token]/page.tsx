import { IntakeForm } from "@/components/intake/IntakeForm";
import { intakeForm } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await intakeForm(token);

  if (!form) {
    return (
      <div className="card mx-auto max-w-md px-6 py-10 text-center">
        <h1 className="text-[20px] font-semibold">This link isn&apos;t active</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          It may have been replaced with a new one. Ask the team that sent it for a fresh link.
        </p>
      </div>
    );
  }

  return <IntakeForm token={token} form={form} />;
}
