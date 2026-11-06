export type EmojiCatalogItem = {
  emoji: string;
  name: string;
  aliases: string[];
  tags: string[];
};

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
