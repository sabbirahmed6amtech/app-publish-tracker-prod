import { FileTextIcon, PlusIcon } from "lucide-react";
import { DeleteButton } from "@/components/RowActions";
import { ProjectLogo } from "@/components/ProjectLogo";
import { ProductLineDialog } from "@/components/dialogs/ProductLineDialog";
import { ProductLineDescriptionsDialog } from "@/components/dialogs/ProductLineDescriptionsDialog";
import { getClients, getProductLines, lineDescriptions } from "@/lib/queries";
import { deleteProductLine } from "@/lib/actions";

/** The product lines the team sells, their projects and logos. */
export async function ProductLinesSettings() {
  const [lines, clients, descriptions] = await Promise.all([
    getProductLines(),
    getClients(),
    lineDescriptions(),
  ]);

  // How many client apps use each project, so the list shows what's in use.
  const usage = new Map<string, number>();
  for (const c of clients) {
    for (const p of c.products) usage.set(p.project_name, (usage.get(p.project_name) ?? 0) + 1);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted-foreground">
          Picked when setting up a client, and each line&apos;s logo shows on every app built
          from its projects.
        </p>
        <ProductLineDialog
          trigger={
            <>
              <PlusIcon className="size-4" /> Product line
            </>
          }
          className="btn btn-primary"
        />
      </div>

      {lines.length === 0 ? (
        <div className="card px-6 py-14 text-center text-[13px] text-muted-foreground">
          No product lines yet.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lines.map((line) => {
            const apps = line.projects.reduce((n, p) => n + (usage.get(p) ?? 0), 0);
            return (
              <section key={line.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <ProjectLogo
                    badge={{ line: line.name, logo: line.logo_url }}
                    project={line.name}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold">{line.name}</h2>
                    <p className="text-[12px] text-muted-foreground">
                      {line.projects.length} {line.projects.length === 1 ? "project" : "projects"}{" "}
                      · used by {apps} client {apps === 1 ? "app" : "apps"}
                      {!line.logo_url && " · no logo yet"}
                    </p>
                  </div>
                  <ProductLineDescriptionsDialog
                    line={{ id: line.id, name: line.name }}
                    projects={descriptions[line.id] ?? []}
                    trigger={
                      <>
                        <FileTextIcon className="size-3.5" /> Descriptions
                      </>
                    }
                  />
                  <ProductLineDialog line={line} trigger="Edit" className="btn btn-ghost h-7 px-2" />
                  <DeleteButton
                    label="✕"
                    confirmText={`Delete the ${line.name} product line? Client apps keep their project names but lose this logo.`}
                    action={async () => {
                      "use server";
                      return deleteProductLine(line.id);
                    }}
                    className="btn btn-ghost size-7 px-0"
                  />
                </div>

                {line.projects.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {line.projects.map((p) => (
                      <li
                        key={p}
                        className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                      >
                        {p}
                        {usage.get(p) ? (
                          <span className="ml-1.5 text-muted-foreground">{usage.get(p)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
