import React, { useRef, useEffect, useState, useCallback } from "react";
import { REELS, Reel, getUser, avatar } from "./data";
import { useInstagram } from "./store";
import {
  LikeIcon,
  CommentIcon,
  ShareIcon,
  MoreIcon,
  MuteIcon,
  AudioIcon,
  VerifiedIcon,
} from "./Icons";

interface ReelsViewProps {
  onOpenProfile?: (id: string) => void;
}

interface ReelCardProps {
  reel: Reel;
  muted: boolean;
  onToggleMute: () => void;
  onOpenProfile?: (id: string) => void;
}

const RailButton: React.FC<{
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => (
  <div className="flex flex-col items-center gap-1">
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-10 h-10 flex items-center justify-center rounded-full text-[#262626] hover:bg-black/5 transition-colors"
    >
      {children}
    </button>
  </div>
);

const ReelCard: React.FC<ReelCardProps> = ({ reel, muted, onToggleMute, onOpenProfile }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [heartPop, setHeartPop] = useState(false);
  const { likedReels, toggleReelLike, following, toggleFollow } = useInstagram();

  const user = getUser(reel.userId);
  const liked = likedReels.has(reel.id);
  const isFollowing = following.has(reel.userId);

  // Autoplay only when >60% visible.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const doLike = useCallback(() => {
    if (!likedReels.has(reel.id)) toggleReelLike(reel.id);
    setHeartPop(true);
    window.setTimeout(() => setHeartPop(false), 700);
  }, [likedReels, reel.id, toggleReelLike]);

  return (
    <div className="h-full snap-start flex items-center justify-center">
      <div className="flex items-end gap-4">
        {/* Player */}
        <div
          className="relative bg-black rounded-md overflow-hidden aspect-[9/16] h-[min(100%,90vh)] max-h-[90vh]"
          onDoubleClick={doLike}
        >
          <video
            ref={videoRef}
            src={reel.video}
            poster={reel.poster}
            muted={muted}
            loop
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Mute toggle */}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/60"
          >
            <MuteIcon size={16} filled={muted} />
          </button>

          {/* Double-click heart pop */}
          {heartPop && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <LikeIcon size={96} filled className="drop-shadow-lg animate-[reelHeart_0.7s_ease-out]" />
            </div>
          )}

          {/* Bottom-left overlay */}
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent text-white">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenProfile?.(user.id)}
                className="flex items-center gap-2"
              >
                <img
                  src={avatar(user.avatarSeed)}
                  alt={user.username}
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-white/70"
                />
                <span className="text-sm font-semibold flex items-center gap-1">
                  {user.username}
                  {user.verified && <VerifiedIcon size={12} className="text-[#0095f6]" />}
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleFollow(user.id)}
                className={`ml-1 px-2 py-0.5 text-xs font-semibold rounded border ${
                  isFollowing
                    ? "border-white/70 text-white"
                    : "border-white text-white"
                }`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            </div>
            <p className="mt-2 text-sm leading-snug line-clamp-2">{reel.caption}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <AudioIcon size={14} className="text-white" />
              <span className="truncate">{reel.audio}</span>
            </div>
          </div>
        </div>

        {/* Right action rail */}
        <div className="flex flex-col items-center gap-4 pb-6">
          <RailButton label="Like" onClick={() => toggleReelLike(reel.id)}>
            <LikeIcon size={26} filled={liked} className={liked ? "" : "text-[#262626]"} />
          </RailButton>
          <span className="-mt-3 text-xs font-semibold text-[#262626]">{reel.likes}</span>

          <RailButton label="Comment">
            <CommentIcon size={26} className="text-[#262626]" />
          </RailButton>
          <span className="-mt-3 text-xs font-semibold text-[#262626]">{reel.comments}</span>

          <RailButton label="Share">
            <ShareIcon size={26} className="text-[#262626]" />
          </RailButton>
          <span className="-mt-3 text-xs font-semibold text-[#262626]">{reel.shares}</span>

          <RailButton label="More">
            <MoreIcon size={26} className="text-[#262626]" />
          </RailButton>

          <button
            type="button"
            onClick={() => onOpenProfile?.(user.id)}
            aria-label={user.username}
            className="mt-1"
          >
            <img
              src={avatar(user.avatarSeed)}
              alt={user.username}
              className="w-9 h-9 rounded-md object-cover border border-[#dbdbdb]"
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ReelsView: React.FC<ReelsViewProps> = ({ onOpenProfile }) => {
  const [muted, setMuted] = useState(true);

  return (
    <div className="h-full w-full">
      <style>{`@keyframes reelHeart{0%{transform:scale(0);opacity:0}15%{transform:scale(1.2);opacity:1}30%{transform:scale(0.95)}45%{transform:scale(1)}80%{opacity:1}100%{transform:scale(1);opacity:0}}`}</style>
      <div className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide">
        {REELS.map((reel) => (
          <ReelCard
            key={reel.id}
            reel={reel}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onOpenProfile={onOpenProfile}
          />
        ))}
      </div>
    </div>
  );
};

export default ReelsView;
