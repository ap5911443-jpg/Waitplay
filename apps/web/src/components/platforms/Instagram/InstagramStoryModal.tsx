import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Volume2, VolumeX, Pause, Play, Heart, Send } from 'lucide-react';

export interface StoryItem {
  id: number;
  name: string;
  avatarText: string;
  avatarBg: string;
  timeAgo: string;
  title: string;
  subtitle: string;
  tagline: string;
  accentColor: string;
}

interface InstagramStoryModalProps {
  stories: StoryItem[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export const InstagramStoryModal: React.FC<InstagramStoryModalProps> = ({
  stories,
  initialIndex,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setProgress(0);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    if (!isOpen || isPaused) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (currentIndex < stories.length - 1) {
            setCurrentIndex((c) => c + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return prev + 1.25;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isOpen, isPaused, currentIndex, stories.length, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === ' ') {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, onClose]);

  if (!isOpen || stories.length === 0) return null;

  const current = stories[currentIndex];

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((c) => c + 1);
      setProgress(0);
      setIsLiked(false);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((c) => c - 1);
      setProgress(0);
      setIsLiked(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0C0F12]/95 backdrop-blur-md flex items-center justify-center select-none">
      {/* Top Close Button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-6 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors z-50"
        title="Close (Esc)"
      >
        <X size={26} />
      </button>

      {/* Prev Navigation Arrow */}
      {currentIndex > 0 && (
        <button
          onClick={handlePrev}
          className="absolute left-6 md:left-16 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all z-40 hidden sm:flex items-center justify-center"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Next Navigation Arrow */}
      {currentIndex < stories.length - 1 && (
        <button
          onClick={handleNext}
          className="absolute right-6 md:right-16 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all z-40 hidden sm:flex items-center justify-center"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Story 9:16 Card Container */}
      <div
        className="relative w-[380px] h-[675px] max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-between border border-white/10"
        style={{
          background: `radial-gradient(circle at 50% 20%, ${current.accentColor}33 0%, #0F1216 75%, #080A0C 100%)`,
        }}
      >
        {/* Top Progress Segment Bar */}
        <div className="p-3.5 flex flex-col gap-2 z-20 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-1.5 w-full">
            {stories.map((s, idx) => (
              <div key={s.id} className="flex-1 h-1 bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-75"
                  style={{
                    width:
                      idx < currentIndex
                        ? '100%'
                        : idx === currentIndex
                        ? `${progress}%`
                        : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          {/* User Header */}
          <div className="flex items-center justify-between mt-1 text-white">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
                style={{ backgroundColor: current.avatarBg }}
              >
                {current.avatarText}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{current.name}</span>
                <span className="text-[11px] text-white/60">{current.timeAgo}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-white/80">
              <button
                onClick={() => setIsPaused((p) => !p)}
                className="p-1 hover:text-white transition-colors"
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button
                onClick={() => setIsMuted((m) => !m)}
                className="p-1 hover:text-white transition-colors"
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Center Story Content Canvas */}
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            if (clickX < rect.width / 3) handlePrev();
            else handleNext();
          }}
          className="flex-1 flex flex-col items-center justify-center p-8 text-center cursor-pointer relative"
        >
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl transition-transform hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${current.accentColor} 0%, #3B82F6 100%)`,
            }}
          >
            <span className="text-3xl font-black text-white">{current.avatarText}</span>
          </div>

          <span
            className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3 text-white shadow-sm"
            style={{ backgroundColor: `${current.accentColor}44`, border: `1px solid ${current.accentColor}88` }}
          >
            {current.tagline}
          </span>

          <h3 className="text-xl font-bold text-white leading-snug mb-3 drop-shadow-md">
            {current.title}
          </h3>

          <p className="text-xs text-white/80 max-w-xs leading-relaxed drop-shadow-sm">
            {current.subtitle}
          </p>
        </div>

        {/* Bottom Quick Reply & Interaction Bar */}
        <div className="p-3.5 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2.5 z-20">
          <div className="flex-1 px-3.5 py-2 rounded-full border border-white/20 bg-white/10 text-white text-xs placeholder-white/50 focus-within:border-white/50">
            <input
              type="text"
              placeholder={`Reply to ${current.name}...`}
              className="w-full bg-transparent outline-none text-white text-xs placeholder-white/40"
              onFocus={() => setIsPaused(true)}
              onBlur={() => setIsPaused(false)}
            />
          </div>
          <button
            onClick={() => setIsLiked((l) => !l)}
            className="p-2 text-white hover:scale-110 active:scale-95 transition-transform"
          >
            <Heart size={22} className={isLiked ? 'fill-red-500 text-red-500' : 'text-white'} />
          </button>
          <button className="p-2 text-white hover:scale-110 active:scale-95 transition-transform">
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
