/** Points visitors at Panframe, which turns cooking videos into recipes and lives at /recipe behind a rewrite. */
export function RecipePromo() {
  return (
    <section className="mt-16">
      {/* /recipe is a separate app, so this is a plain link rather than <Link>. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/recipe"
        className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 transition hover:border-accent sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold tracking-wide text-accent uppercase">Cooking videos</p>
          <h2 className="mt-1 text-xl font-bold">Get the full recipe from any cooking video</h2>
          <p className="mt-1 text-muted">
            Paste a TikTok, Reel or post into Panframe and get every ingredient with amounts and each step to cook it.
          </p>
        </div>
        <span className="shrink-0 self-start rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink sm:self-center">
          Get a recipe →
        </span>
      </a>
    </section>
  );
}
