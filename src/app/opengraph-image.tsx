import { site } from "@/config/site";
import { ogImage, ogSize } from "@/lib/ogImage";

export const alt = `${site.name}: free video downloader with no waiting`;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ title: "Download any video. No waiting.", subtitle: "TikTok, X, Instagram, Facebook, Reddit and more" });
}
