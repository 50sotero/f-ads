import Link from "next/link";
import { site } from "@/config/site";
import { FooterSponsors } from "./Sponsors";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <FooterSponsors />
        <div className="mt-8 flex flex-col gap-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name}. Only download videos you own or have permission to use.
          </p>
          <nav className="flex gap-5">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/dmca" className="hover:text-ink">Copyright / DMCA</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
