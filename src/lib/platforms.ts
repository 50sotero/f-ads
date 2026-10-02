import data from "../config/platforms.json";
import { detectPlatform, type Platform } from "./detect";

export type { Platform };
export { normalizeUrl } from "./detect";

export const platforms = data as Platform[];
export const featuredPlatforms = platforms.filter((p) => p.featured);
export const supportedPlatforms = platforms.filter((p) => p.status === "supported");
export const comingSoonPlatforms = platforms.filter((p) => p.status === "soon");

export function detect(url: string | null): Platform | null {
  return detectPlatform(url, platforms);
}
