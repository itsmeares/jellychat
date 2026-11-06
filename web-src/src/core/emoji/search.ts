import type { EmojiCatalogItem } from "./catalog";

let loaded: EmojiCatalogItem[] | null = null;

export async function loadCatalog(): Promise<EmojiCatalogItem[]> {
  if (!loaded) {
    loaded = (await import("./catalog")).emojiCatalog;
  }
  return loaded;
}

export function searchCatalog(catalog: EmojiCatalogItem[], query: string): EmojiCatalogItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return catalog;
  }
  const score = (item: EmojiCatalogItem): number => {
    if (item.name === needle || item.aliases.includes(needle)) return 0;
    if (item.name.startsWith(needle) || item.aliases.some((alias) => alias.startsWith(needle))) return 1;
    if (item.name.includes(needle) || item.aliases.some((alias) => alias.includes(needle))) return 2;
    if (item.tags.some((tag) => tag.startsWith(needle))) return 3;
    return item.tags.some((tag) => tag.includes(needle)) ? 4 : 9;
  };
  return catalog
    .map((item) => ({ item, rank: score(item) }))
    .filter((entry) => entry.rank < 9)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.item);
}
