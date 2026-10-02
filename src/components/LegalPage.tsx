import { SponsorRails } from "./Sponsors";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated October 2, 2026</p>
      <div className="mt-8 space-y-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_a]:underline">
        {children}
      </div>
      <SponsorRails />
    </article>
  );
}
