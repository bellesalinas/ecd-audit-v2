import { readFileSync } from "node:fs";
import type { DeckAssets } from "./deck.js";

const dataUri = (name: string) =>
  `data:image/png;base64,${readFileSync(new URL(`../../assets/${name}`, import.meta.url)).toString("base64")}`;

/** Reads the brand images from assets/ (Node only; the web build bundles them). */
export function loadDeckAssets(): DeckAssets {
  return {
    logo: dataUri("ecd-logo-primary-horizontal.png"),
    logoWhite: dataUri("ecd-logo-primary-horizontal-white.png"),
    cover: dataUri("ecd-cover-blue.png"),
  };
}
