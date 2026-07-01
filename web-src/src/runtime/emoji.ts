export type EmojiCatalogItem = {
  emoji: string;
  name: string;
  aliases: string[];
  tags: string[];
};

export type ReactionPreferences = {
  quick: string[];
  favorites: string[];
  recent: string[];
};

export const quickReactionSlotCount = 6;
export const recentEmojiLimit = 18;
export const defaultQuickReactions = ["❤️", "😍", "😂", "😮", "😢", "🔥"];

const quickStorageKey = "jellychat.reactions.quick.v1";
const favoritesStorageKey = "jellychat.reactions.favorites.v1";
const recentStorageKey = "jellychat.reactions.recent.v1";

export const emojiCatalog: EmojiCatalogItem[] = [
  { emoji: "❤️", name: "red heart", aliases: ["heart"], tags: ["love", "like", "favorite", "sweet"] },
  { emoji: "😍", name: "smiling face with heart eyes", aliases: ["heart eyes", "love face"], tags: ["love", "happy", "cute", "wow"] },
  { emoji: "😂", name: "face with tears of joy", aliases: ["laugh", "lol"], tags: ["laugh", "funny", "happy", "joy"] },
  { emoji: "😮", name: "surprised face", aliases: ["surprise", "wow"], tags: ["shock", "surprised", "amazed", "wow"] },
  { emoji: "😢", name: "crying face", aliases: ["sad", "tear"], tags: ["sad", "cry", "upset", "emotional"] },
  { emoji: "🔥", name: "fire", aliases: ["flame"], tags: ["fire", "hot", "hype", "great"] },
  { emoji: "❤️‍🔥", name: "heart on fire", aliases: ["burning heart"], tags: ["love", "fire", "hype", "intense"] },
  { emoji: "👍", name: "thumbs up", aliases: ["like", "yes"], tags: ["agree", "good", "ok", "nice"] },
  { emoji: "👏", name: "clapping hands", aliases: ["clap"], tags: ["applause", "good", "bravo", "hype"] },
  { emoji: "🎉", name: "party popper", aliases: ["party"], tags: ["celebrate", "win", "happy", "fun"] },
  { emoji: "😱", name: "face screaming in fear", aliases: ["scream"], tags: ["shock", "scared", "surprised", "wild"] },
  { emoji: "☹️", name: "frowning face", aliases: ["frown"], tags: ["sad", "down", "bad", "upset"] },
  { emoji: "😭", name: "loudly crying face", aliases: ["sob"], tags: ["sad", "cry", "emotional", "overwhelmed"] },
  { emoji: "😆", name: "grinning squinting face", aliases: ["laughing"], tags: ["laugh", "funny", "happy", "joy"] },
  { emoji: "🤣", name: "rolling on the floor laughing", aliases: ["rofl"], tags: ["laugh", "funny", "lol", "joy"] },
  { emoji: "😎", name: "smiling face with sunglasses", aliases: ["cool"], tags: ["cool", "smooth", "nice", "confident"] },
  { emoji: "😬", name: "grimacing face", aliases: ["grimace"], tags: ["awkward", "nervous", "oops", "tense"] },
  { emoji: "😐", name: "neutral face", aliases: ["neutral"], tags: ["meh", "flat", "quiet", "unsure"] },
  { emoji: "😡", name: "angry face", aliases: ["mad"], tags: ["angry", "rage", "bad", "upset"] },
  { emoji: "🤔", name: "thinking face", aliases: ["thinking"], tags: ["think", "hmm", "curious", "question"] },
  { emoji: "🙌", name: "raising hands", aliases: ["raised hands"], tags: ["celebrate", "hype", "yes", "win"] },
  { emoji: "🙏", name: "folded hands", aliases: ["pray", "please"], tags: ["thanks", "hope", "grateful", "please"] },
  { emoji: "💯", name: "hundred points", aliases: ["100"], tags: ["perfect", "score", "agree", "hype"] },
  { emoji: "⭐", name: "star", aliases: ["favorite star"], tags: ["favorite", "great", "shine", "best"] },
  { emoji: "✨", name: "sparkles", aliases: ["sparkle"], tags: ["magic", "pretty", "wow", "nice"] },
  { emoji: "👀", name: "eyes", aliases: ["watching"], tags: ["look", "watch", "attention", "sus"] },
  { emoji: "🍿", name: "popcorn", aliases: ["snack"], tags: ["watch", "movie", "drama", "fun"] },
  { emoji: "💀", name: "skull", aliases: ["dead"], tags: ["laugh", "dead", "funny", "shock"] },
  { emoji: "🤯", name: "exploding head", aliases: ["mind blown"], tags: ["shock", "wow", "surprised", "amazed"] },
  { emoji: "😴", name: "sleeping face", aliases: ["sleep"], tags: ["sleepy", "boring", "tired", "quiet"] },
  { emoji: "🤮", name: "face vomiting", aliases: ["vomit"], tags: ["gross", "bad", "sick", "dislike"] },
  { emoji: "🥺", name: "pleading face", aliases: ["pleading"], tags: ["sad", "cute", "please", "soft"] },
  { emoji: "😳", name: "flushed face", aliases: ["flushed"], tags: ["shock", "surprised", "awkward", "wow"] },
  { emoji: "🫶", name: "heart hands", aliases: ["love hands"], tags: ["love", "thanks", "sweet", "support"] },
  { emoji: "💔", name: "broken heart", aliases: ["heartbreak"], tags: ["sad", "love", "hurt", "cry"] },
  { emoji: "🤌", name: "pinched fingers", aliases: ["chef kiss"], tags: ["perfect", "good", "taste", "nice"] },
  { emoji: "👌", name: "ok hand", aliases: ["ok"], tags: ["good", "yes", "perfect", "agree"] },
  { emoji: "👎", name: "thumbs down", aliases: ["dislike"], tags: ["no", "bad", "disagree", "down"] },
  { emoji: "🫡", name: "saluting face", aliases: ["salute"], tags: ["respect", "ok", "yes", "support"] },
  { emoji: "🫠", name: "melting face", aliases: ["melt"], tags: ["awkward", "sad", "overwhelmed", "heat"] }
];

const catalogEmojiSet = new Set(emojiCatalog.map((item) => item.emoji));

function readJsonArray(key: string): string[] {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, values: string[]): void {
  try {
    window.localStorage?.setItem(key, JSON.stringify(values));
  } catch {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastError = "Could not save JellyChat reaction preferences.";
    }
  }
}

function uniqueValid(values: string[], options: { catalogOnly: boolean; limit?: number }): string[] {
  const output: string[] = [];
  values.forEach((value) => {
    const emoji = value.trim();
    if (!emoji || output.includes(emoji)) {
      return;
    }

    if (options.catalogOnly && !catalogEmojiSet.has(emoji)) {
      return;
    }

    output.push(emoji);
  });

  return typeof options.limit === "number" ? output.slice(0, options.limit) : output;
}

export function loadReactionPreferences(): ReactionPreferences {
  const storedQuick = uniqueValid(readJsonArray(quickStorageKey), { catalogOnly: true });
  const quick = storedQuick.length === quickReactionSlotCount
    ? storedQuick
    : defaultQuickReactions.slice();
  const favorites = uniqueValid(readJsonArray(favoritesStorageKey), { catalogOnly: true });
  const recent = uniqueValid(readJsonArray(recentStorageKey), { catalogOnly: true, limit: recentEmojiLimit });

  return { quick, favorites, recent };
}

export function saveQuickReactions(quick: string[]): string[] {
  const normalized = uniqueValid(quick, { catalogOnly: true });
  const result = normalized.length === quickReactionSlotCount ? normalized : defaultQuickReactions.slice();
  writeJsonArray(quickStorageKey, result);
  return result;
}

export function saveFavoriteReactions(favorites: string[]): string[] {
  const result = uniqueValid(favorites, { catalogOnly: true });
  writeJsonArray(favoritesStorageKey, result);
  return result;
}

export function saveRecentReactions(recent: string[]): string[] {
  const result = uniqueValid(recent, { catalogOnly: true, limit: recentEmojiLimit });
  writeJsonArray(recentStorageKey, result);
  return result;
}

export function addRecentReaction(recent: string[], emoji: string): string[] {
  return saveRecentReactions([emoji].concat(recent.filter((item) => item !== emoji)));
}

export function searchEmojiCatalog(query: string): EmojiCatalogItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return emojiCatalog;
  }

  return emojiCatalog.filter((item) => {
    const haystack = [
      item.emoji,
      item.name,
      ...item.aliases,
      ...item.tags
    ].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
