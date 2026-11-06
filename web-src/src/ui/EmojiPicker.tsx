import { useEffect, useMemo, useState } from "react";
import type { EmojiCatalogItem } from "../core/emoji/catalog";
import { loadCatalog, searchCatalog } from "../core/emoji/search";

type Props = {
  recent: string[];
  favorites: string[];
  onPick: (emoji: string) => void;
  onToggleFavorite: (emoji: string) => void;
  autoFocus?: boolean;
};

export function EmojiPicker({ recent, favorites, onPick, onToggleFavorite, autoFocus }: Props) {
  const [catalog, setCatalog] = useState<EmojiCatalogItem[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    void loadCatalog().then((items) => alive && setCatalog(items));
    return () => { alive = false; };
  }, []);

  const results = useMemo(() => searchCatalog(catalog, query), [catalog, query]);

  const button = (emoji: string, key: string) => (
    <button
      key={key}
      type="button"
      title="Click to use. Right-click to favorite"
      onClick={() => onPick(emoji)}
      onContextMenu={(event) => { event.preventDefault(); onToggleFavorite(emoji); }}
    >
      {emoji}
    </button>
  );

  return (
    <>
      <input type="search" placeholder="Search emoji" value={query} autoFocus={autoFocus} onChange={(event) => setQuery(event.target.value)} aria-label="Search emoji" />
      {!query && favorites.length > 0 && (
        <div><h5>Favorites</h5><div className="row">{favorites.map((emoji) => button(emoji, "f" + emoji))}</div></div>
      )}
      {!query && recent.length > 0 && (
        <div><h5>Recent</h5><div className="row">{recent.slice(0, 12).map((emoji) => button(emoji, "r" + emoji))}</div></div>
      )}
      <div className="grid">{results.map((item) => button(item.emoji, item.emoji))}</div>
      {query && results.length === 0 && <div className="none">No emoji match "{query}".</div>}
    </>
  );
}
