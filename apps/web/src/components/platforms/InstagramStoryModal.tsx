import React, { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Story } from "./InstagramFeed";

interface InstagramStoryModalProps {
  story: Story | null;
  onClose: () => void;
  onNextStory?: () => void;
  onPrevStory?: () => void;
}

export const InstagramStoryModal: React.FC<InstagramStoryModalProps> = ({
  story,
  onClose,
  onNextStory,
  onPrevStory,
}) => {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!story) return;
    setProgress(0);

    const interval = setInterval(() => {
      if (!isPaused) {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            if (onNextStory) onNextStory();
            else onClose();
            return 100;
          }
          return prev + 2;
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [story, isPaused, onNextStory, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && onNextStory) onNextStory();
      if (e.key === "ArrowLeft" && onPrevStory) onPrevStory();
      if (e.key === " ") setIsPaused((p) => !p);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNextStory, onPrevStory]);

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center select-none font-sans">
      {/* Top Close Button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-6 z-50 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white/80 hover:text-white transition-colors cursor-pointer"
        title="Close (Esc)"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Prev Navigation Arrow */}
      {onPrevStory && (
        <button
          onClick={onPrevStory}
          className="absolute left-6 z-40 p-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white transition-colors cursor-pointer hidden sm:block"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Next Navigation Arrow */}
      {onNextStory && (
        <button
          onClick={onNextStory}
          className="absolute right-6 z-40 p-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white transition-colors cursor-pointer hidden sm:block"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Story 9:16 Frame */}
      <div
        className="relative w-[360px] sm:w-[420px] h-[720px] max-h-[90vh] bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col justify-between"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Background Story Image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-300"
          style={{ backgroundImage: `url(${story.storyImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
        </div>

        {/* Top Progress Bar and User Info */}
        <div className="relative z-20 p-4 space-y-3">
          {/* Progress Indicator */}
          <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-100 ease-linear rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* User Row */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5">
              <img
                src={story.avatar}
                alt={story.username}
                className="w-8 h-8 rounded-full object-cover border border-white/60"
              />
              <span className="text-xs font-semibold hover:underline">
                {story.username}
              </span>
              <span className="text-[10px] text-white/70">3h ago</span>
              {story.isLive && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-600 text-white rounded-xs uppercase">
                  Live
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaused(!isPaused);
                }}
                className="p-1 text-white/80 hover:text-white"
              >
                {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMuted(!isMuted);
                }}
                className="p-1 text-white/80 hover:text-white"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Story Caption */}
        <div className="relative z-20 p-5 text-white space-y-3">
          <p className="text-sm font-medium leading-relaxed drop-shadow-md">
            {story.caption}
          </p>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder={`Reply to ${story.username}...`}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-black/40 border border-white/30 rounded-full px-4 py-2 text-xs text-white placeholder-white/60 focus:outline-hidden backdrop-blur-xs"
            />
            <button
              onClick={(e) => e.stopPropagation()}
              className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
