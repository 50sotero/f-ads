import { jsonLd } from "@/lib/seo";

/** Structured data for search engines and AI answers (schema.org JSON-LD). */
export function JsonLd({ graph }: { graph: object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />;
}
