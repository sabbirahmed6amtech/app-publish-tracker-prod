import { notFound, redirect } from "next/navigation";

export default async function TicketRedirect({ params }: { params: Promise<{ number: string }> }) {
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1) notFound();
  redirect(`/mail?t=${number}`);
}
