import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { ChatActions, SyncPlayContext } from "../types";
import {
  EmojiCatalogItem,
  addRecentReaction,
  defaultQuickReactions,
  emojiCatalog,
  loadReactionPreferences,
  quickReactionSlotCount,
  saveFavoriteReactions,
  saveQuickReactions,
  searchEmojiCatalog
} from "../runtime/emoji";

type Props = {
  actions: ChatActions;
  syncPlay: SyncPlayContext;
};

type EmojiButtonProps = {
  item: EmojiCatalogItem;
  disabled: boolean;
  favorite: boolean;
  onChoose: (emoji: string) => void;
  onToggleFavorite: (emoji: string) => void;
};

const longPressMs = 560;

function EmojiButton({ item, disabled, favorite, onChoose, onToggleFavorite }: EmojiButtonProps) {
  const longPressTimer = useRef(0);
  const ignoreNextClick = useRef(false);

  function clearLongPress() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = 0;
    }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse") {
      return;
    }

    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      ignoreNextClick.current = true;
      onToggleFavorite(item.emoji);
    }, longPressMs);
  }

  return (
    <button
      type="button"
      className={favorite ? "jellyChatEmojiOption is-favorite" : "jellyChatEmojiOption"}
      aria-label={item.name}
      aria-pressed={favorite}
      title={item.name}
      disabled={disabled}
      onClick={() => {
        clearLongPress();
        if (ignoreNextClick.current) {
          ignoreNextClick.current = false;
          return;
        }

        onChoose(item.emoji);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onToggleFavorite(item.emoji);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
    >
      <span aria-hidden="true">{item.emoji}</span>
    </button>
  );
}

function toCatalogItems(emojis: string[]): EmojiCatalogItem[] {
  return emojis
    .map((emoji) => emojiCatalog.find((item) => item.emoji === emoji))
    .filter((item): item is EmojiCatalogItem => !!item);
}

export function ReactionBar({ actions, syncPlay }: Props) {
  const prefs = useRef(loadReactionPreferences());
  const [quick, setQuick] = useState(prefs.current.quick);
  const [favorites, setFavorites] = useState(prefs.current.favorites);
  const [recent, setRecent] = useState(prefs.current.recent);
  const [trayOpen, setTrayOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [lastEditAction, setLastEditAction] = useState<string | null>(null);
  const disabled = !syncPlay.inGroup;
  const results = searchEmojiCatalog(searchQuery);

  useEffect(() => {
    if (!window.JellyChatDebug) {
      return;
    }

    window.JellyChatDebug.emojiPickerOpen = pickerOpen;
    window.JellyChatDebug.emojiSearchQuery = searchQuery;
    window.JellyChatDebug.favoriteEmojiCount = favorites.length;
    window.JellyChatDebug.recentlyUsedEmojiCount = recent.length;
    window.JellyChatDebug.quickReactionSlots = quick.slice();
    window.JellyChatDebug.quickReactionEditMode = editMode;
    window.JellyChatDebug.selectedQuickReactionSlotIndex = selectedSlot;
    window.JellyChatDebug.lastQuickReactionEditAction = lastEditAction;
  }, [pickerOpen, searchQuery, favorites, recent, quick, editMode, selectedSlot, lastEditAction]);

  function clearSelectedSlot(action: string) {
    setSelectedSlot(null);
    setLastEditAction(action);
  }

  async function sendReaction(emoji: string) {
    if (disabled) {
      return;
    }

    const sent = await actions.sendReaction(emoji);
    if (sent) {
      setRecent((current) => addRecentReaction(current, emoji));
      setTrayOpen(false);
    }
  }

  function replaceQuickSlot(emoji: string) {
    if (selectedSlot === null) {
      setLastEditAction("emoji-ignored-no-slot");
      return;
    }

    setQuick((current) => {
      const next = current.length === quickReactionSlotCount ? current.slice() : defaultQuickReactions.slice();
      const existingIndex = next.indexOf(emoji);
      if (existingIndex !== -1 && existingIndex !== selectedSlot) {
        const currentEmoji = next[selectedSlot];
        next[selectedSlot] = emoji;
        next[existingIndex] = currentEmoji;
        setLastEditAction("swap-slot-" + selectedSlot + "-with-" + existingIndex);
        setSelectedSlot(null);
        return saveQuickReactions(next);
      }

      next[selectedSlot] = emoji;
      setLastEditAction("replace-slot-" + selectedSlot);
      setSelectedSlot(null);
      return saveQuickReactions(next);
    });
  }

  function onChooseEmoji(emoji: string) {
    if (editMode) {
      replaceQuickSlot(emoji);
      return;
    }

    void sendReaction(emoji);
  }

  function toggleFavorite(emoji: string) {
    setFavorites((current) => {
      const next = current.includes(emoji)
        ? current.filter((item) => item !== emoji)
        : current.concat(emoji);
      setLastEditAction(current.includes(emoji) ? "unfavorite-" + emoji : "favorite-" + emoji);
      return saveFavoriteReactions(next);
    });
  }

  function selectQuickSlot(index: number) {
    if (!editMode) {
      return;
    }

    if (selectedSlot === index) {
      clearSelectedSlot("deselect-slot-" + index);
      return;
    }

    if (selectedSlot === null) {
      setSelectedSlot(index);
      setLastEditAction("select-slot-" + index);
      return;
    }

    setQuick((current) => {
      const next = current.slice();
      const selectedEmoji = next[selectedSlot];
      next[selectedSlot] = next[index];
      next[index] = selectedEmoji;
      setLastEditAction("swap-slot-" + selectedSlot + "-with-" + index);
      setSelectedSlot(null);
      return saveQuickReactions(next);
    });
  }

  function toggleEditMode() {
    setEditMode((enabled) => {
      const next = !enabled;
      setSelectedSlot(null);
      setLastEditAction(next ? "enter-edit-mode" : "exit-edit-mode");
      return next;
    });
  }

  function closePicker() {
    setPickerOpen(false);
    setEditMode(false);
    setSearchQuery("");
    clearSelectedSlot("close-picker");
  }

  useEffect(() => {
    function closeFromEvent() {
      closePicker();
    }

    function exitEditFromEvent() {
      setEditMode(false);
      clearSelectedSlot("escape-edit-mode");
    }

    window.addEventListener("jellychat-close-emoji-picker", closeFromEvent);
    window.addEventListener("jellychat-exit-quick-edit", exitEditFromEvent);
    return () => {
      window.removeEventListener("jellychat-close-emoji-picker", closeFromEvent);
      window.removeEventListener("jellychat-exit-quick-edit", exitEditFromEvent);
    };
  }, []);

  const favoriteItems = toCatalogItems(favorites);
  const recentItems = toCatalogItems(recent);
  const reactionsClassName = [
    "jellyChatReactions",
    trayOpen || pickerOpen ? "is-tray-open" : ""
  ].filter(Boolean).join(" ");

  return (
    <div className={reactionsClassName}>
      <button
        type="button"
        className="jellyChatReactionTrayToggle"
        aria-label={trayOpen || pickerOpen ? "Hide quick reactions" : "Show quick reactions"}
        aria-expanded={trayOpen || pickerOpen}
        disabled={disabled}
        onClick={() => {
          if (trayOpen || pickerOpen) {
            closePicker();
            setTrayOpen(false);
            return;
          }

          setTrayOpen(true);
        }}
      >
        <span aria-hidden="true">:)</span>
      </button>
      <div className="jellyChatQuickReactions" aria-label="Quick reactions">
        {quick.map((emoji, index) => (
          <button
            key={index + ":" + emoji}
            type="button"
            className="jellyChatQuickReaction"
            aria-label={"Send " + emoji + " reaction"}
            disabled={disabled}
            onClick={() => void sendReaction(emoji)}
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          className={pickerOpen ? "jellyChatQuickReaction is-picker-open" : "jellyChatQuickReaction"}
          aria-label={pickerOpen ? "Close emoji picker" : "Open emoji picker"}
          aria-expanded={pickerOpen}
          onClick={() => {
            if (pickerOpen) {
              closePicker();
              setTrayOpen(false);
              return;
            }

            setTrayOpen(true);
            setPickerOpen(true);
          }}
        >
          +
        </button>
      </div>

      {pickerOpen ? (
        <div
          className="jellyChatEmojiPicker"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closePicker();
            }
          }}
        >
          <div className="jellyChatEmojiPickerToolbar">
            <input
              type="search"
              className="jellyChatEmojiSearch"
              placeholder="Search emoji"
              aria-label="Search emoji"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button
              type="button"
              className={editMode ? "jellyChatEmojiEditToggle is-active" : "jellyChatEmojiEditToggle"}
              aria-pressed={editMode}
              onClick={toggleEditMode}
            >
              {editMode ? "Done" : "Edit quick reactions"}
            </button>
          </div>

          {editMode ? (
            <div className="jellyChatQuickEditSlots" aria-label="Quick reaction slots">
              {quick.map((emoji, index) => (
                <button
                  key={index + ":" + emoji}
                  type="button"
                  className={selectedSlot === index ? "jellyChatQuickEditSlot is-selected" : "jellyChatQuickEditSlot"}
                  aria-label={"Quick reaction slot " + (index + 1)}
                  aria-pressed={selectedSlot === index}
                  onClick={() => selectQuickSlot(index)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}

          <div className="jellyChatEmojiPickerSection">
            <div className="jellyChatEmojiPickerHeading">Favorites</div>
            <div className="jellyChatEmojiGrid">
              {favoriteItems.length > 0 ? favoriteItems.map((item) => (
                <EmojiButton
                  key={"favorite:" + item.emoji}
                  item={item}
                  disabled={false}
                  favorite={favorites.includes(item.emoji)}
                  onChoose={onChooseEmoji}
                  onToggleFavorite={toggleFavorite}
                />
              )) : <span className="jellyChatEmojiHint">Right-click or long-press an emoji to favorite it.</span>}
            </div>
          </div>

          <div className="jellyChatEmojiPickerSection">
            <div className="jellyChatEmojiPickerHeading">Recently used</div>
            <div className="jellyChatEmojiGrid">
              {recentItems.length > 0 ? recentItems.map((item) => (
                <EmojiButton
                  key={"recent:" + item.emoji}
                  item={item}
                  disabled={editMode ? false : disabled}
                  favorite={favorites.includes(item.emoji)}
                  onChoose={onChooseEmoji}
                  onToggleFavorite={toggleFavorite}
                />
              )) : <span className="jellyChatEmojiHint">No reactions sent yet.</span>}
            </div>
          </div>

          <div className="jellyChatEmojiPickerSection">
            <div className="jellyChatEmojiPickerHeading">{searchQuery.trim() ? "Search results" : "Emoji"}</div>
            <div className="jellyChatEmojiGrid">
              {results.map((item) => (
                <EmojiButton
                  key={"catalog:" + item.emoji}
                  item={item}
                  disabled={editMode ? false : disabled}
                  favorite={favorites.includes(item.emoji)}
                  onChoose={onChooseEmoji}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
