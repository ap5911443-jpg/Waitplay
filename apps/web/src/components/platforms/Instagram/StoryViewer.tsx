import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORIES, getUser, avatar } from "./data";
import {
  CloseIcon,
  ChevronLeft,
  ChevronRight,
  LikeIcon,
  ShareIcon,
  VerifiedIcon,
} from "./Icons";

const STORY_DURATION = 5000; // ms per image

// Deterministic "time ago" label so each story shows a stable muted timestamp.
const timeLabel = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `${(h % 20) + 1}h`;
};

export const StoryViewer: React.FC<{ initialUserId: string; onClose: () => void }> = ({
  initialUserId,
  onClose,
}) => {
  const stories = STORIES;
  const startIndex = useMemo(() => {
    const idx = stories.findIndex((s) => s.userId === initialUserId);
    return idx < 0 ? 0 : idx;
  }, [stories, initialUserId]);

  const [userIndex, setUserIndex] = useState(startIndex);
  const [imgIndex, setImgIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const story = stories[userIndex];
  const user = getUser(story.userId);

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  // Advance helpers ---------------------------------------------------------
  const nextImage = useCallback(() => {
    setProgress(0);
    elapsedRef.current = 0;
    if (imgIndex < story.images.length - 1) {
      setImgIndex(imgIndex + 1);
    } else if (userIndex < stories.length - 1) {
      setUserIndex(userIndex + 1);
      setImgIndex(0);
    } else {
      onClose();
    }
  }, [imgIndex, userIndex, story.images.length, stories.length, onClose]);

  const prevImage = useCallback(() => {
    setProgress(0);
    elapsedRef.current = 0;
    if (imgIndex > 0) {
      setImgIndex(imgIndex - 1);
    } else if (userIndex > 0) {
      const pi = userIndex - 1;
      setUserIndex(pi);
      setImgIndex(stories[pi].images.length - 1);
    } else {
      setImgIndex(0);
    }
  }, [imgIndex, userIndex, stories]);

  const nextUser = useCallback(() => {
    setProgress(0);
    elapsedRef.current = 0;
    if (userIndex < stories.length - 1) {
      setUserIndex(userIndex + 1);
      setImgIndex(0);
    } else {
      onClose();
    }
  }, [userIndex, stories.length, onClose]);

  const prevUser = useCallback(() => {
    setProgress(0);
    elapsedRef.current = 0;
    if (userIndex > 0) {
      setUserIndex(userIndex - 1);
      setImgIndex(0);
    } else {
      setImgIndex(0);
    }
  }, [userIndex]);

  // Timer (rAF) -------------------------------------------------------------
  useEffect(() => {
    if (paused) return;
    let active = true;
    startRef.current = performance.now() - elapsedRef.current;

    const tick = (now: number) => {
      if (!active) return;
      const elapsed = now - startRef.current;
      elapsedRef.current = elapsed;
      const pct = Math.min(1, elapsed / STORY_DURATION);
      setProgress(pct);
      if (pct >= 1) {
        nextImage();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [paused, userIndex, imgIndex, nextImage]);

  // Reset elapsed whenever we land on a new image/user.
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
  }, [userIndex, imgIndex]);

  // Keyboard ----------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") nextImage();
      else if (e.key === "ArrowLeft") prevImage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, nextImage, prevImage]);

  const hold = () => setPaused(true);
  const release = () => setPaused(false);

  const adjacent = (offset: number) => {
    const i = userIndex + offset;
    if (i < 0 || i >= stories.length) return null;
    return getUser(stories[i].userId);
  };
  const prevPeek = adjacent(-1);
  const nextPeek = adjacent(1);

  return (
    <div className="absolute inset-0 z-50 bg-[#1a1a1a] flex items-center justify-center">
      {/* Close (top-right of overlay) */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-20 text-white/90 hover:text-white"
      >
        <CloseIcon size={28} />
      </button>

      {/* Faded adjacent avatar — left */}
      {prevPeek && (
        <div className="hidden lg:flex absolute left-8 opacity-40">
          <img
            src={avatar(prevPeek.avatarSeed)}
            alt={prevPeek.username}
            className="w-16 h-16 rounded-full object-cover"
          />
        </div>
      )}

      {/* Prev user chevron */}
      <button
        onClick={prevUser}
        aria-label="Previous story"
        disabled={userIndex === 0}
        className="absolute left-2 md:left-20 z-20 w-10 h-10 rounded-full bg-white text-[#262626] flex items-center justify-center shadow disabled:opacity-0"
      >
        <ChevronLeft size={20} />
      </button>

      {/* Media card */}
      <div
        className="relative h-[90%] max-h-[720px] aspect-[9/16] rounded-lg overflow-hidden bg-black select-none"
        onPointerDown={hold}
        onPointerUp={release}
        onPointerLeave={release}
      >
        <img
          key={`${story.id}-${imgIndex}`}
          src={story.images[imgIndex]}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Top gradient for legibility */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

        {/* Progress bars */}
        <div className="absolute top-2 left-2 right-2 z-10 flex gap-1">
          {story.images.map((_, i) => (
            <div key={i} className="flex-1 h-[2px] rounded-full bg-white/35 overflow-hidden">
              <div
                className="h-full bg-white"
                style={{
                  width:
                    i < imgIndex ? "100%" : i === imgIndex ? `${progress * 100}%` : "0%",
                  transition: i === imgIndex ? "none" : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* Author row */}
        <div className="absolute top-5 left-3 right-3 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={avatar(user.avatarSeed)}
              alt={user.username}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-white/30"
            />
            <span className="text-white text-sm font-semibold truncate flex items-center gap-1">
              {user.username}
              {user.verified && <VerifiedIcon size={12} className="text-[#0095f6]" />}
            </span>
            <span className="text-white/60 text-xs">{timeLabel(story.id)}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-white/90 hover:text-white"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Tap zones */}
        <button
          type="button"
          aria-label="Previous"
          onClick={prevImage}
          className="absolute inset-y-0 left-0 w-1/3 z-[5] cursor-default focus:outline-none"
        />
        <button
          type="button"
          aria-label="Next"
          onClick={nextImage}
          className="absolute inset-y-0 right-0 w-1/3 z-[5] cursor-default focus:outline-none"
        />

        {/* Reply bar */}
        <div className="absolute inset-x-0 bottom-0 p-3 z-10 flex items-center gap-2 bg-gradient-to-t from-black/50 to-transparent">
          <input
            type="text"
            placeholder={`Reply to ${user.username}...`}
            className="flex-1 bg-transparent border border-white/50 rounded-full px-4 py-2 text-sm text-white placeholder-white/70 focus:outline-none focus:border-white"
            onFocus={hold}
            onBlur={release}
          />
          <button aria-label="Like" className="text-white hover:opacity-80">
            <LikeIcon size={24} />
          </button>
          <button aria-label="Share" className="text-white hover:opacity-80">
            <ShareIcon size={24} />
          </button>
        </div>
      </div>

      {/* Next user chevron */}
      <button
        onClick={nextUser}
        aria-label="Next story"
        className="absolute right-2 md:right-20 z-20 w-10 h-10 rounded-full bg-white text-[#262626] flex items-center justify-center shadow"
      >
        <ChevronRight size={20} />
      </button>

      {/* Faded adjacent avatar — right */}
      {nextPeek && (
        <div className="hidden lg:flex absolute right-8 opacity-40">
          <img
            src={avatar(nextPeek.avatarSeed)}
            alt={nextPeek.username}
            className="w-16 h-16 rounded-full object-cover"
          />
        </div>
      )}
    </div>
  );
};

export default StoryViewer;
