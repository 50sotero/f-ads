// Renders the PNG and ICO icons from src/app/icon.svg. Run after changing the
// logo: node scripts/make_icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { ImageResponse } from "next/og.js";

const svg = readFileSync("src/app/icon.svg", "utf8");

async function png(size, { padded = false } = {}) {
  // Maskable icons get cropped to a circle, so keep the mark inside the middle 80%.
  const mark = padded ? svg.replace('rx="14"', 'rx="0"') : svg;
  const src = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;
  const img = h("img", { src, width: size, height: size });
  const res = new ImageResponse(h("div", { style: { display: "flex", width: "100%", height: "100%" } }, img), {
    width: size,
    height: size,
  });
  return Buffer.from(await res.arrayBuffer());
}

// An .ico file that simply wraps PNG images, which every current browser reads.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size % 256, at);
    header.writeUInt8(size % 256, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const sizes = [16, 32, 48];
writeFileSync("src/app/favicon.ico", ico(await Promise.all(sizes.map(async (size) => ({ size, data: await png(size) })))));
writeFileSync("src/app/apple-icon.png", await png(180, { padded: true }));
writeFileSync("public/icon-192.png", await png(192));
writeFileSync("public/icon-512.png", await png(512));
writeFileSync("public/icon-maskable-512.png", await png(512, { padded: true }));
console.log("Icons written.");
