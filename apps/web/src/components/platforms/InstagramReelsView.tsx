import React, { useState, useEffect, useRef } from "react";
import {
  Heart,
  MessageCircle,
  Repeat2,
  Send,
  Bookmark,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Music,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";

export interface ReelItem {
  id: string;
  creator: {
    username: string;
    avatar: string;
    verified: boolean;
    isFollowing?: boolean;
  };
  caption: string;
  hashtags: string[];
  audioTitle: string;
  videoUrl?: string;
  posterUrl: string;
  fallbackGradient: string;
  likes: number;
  commentsCount: number;
  sharesCount: number;
  repostsCount: number;
  tags: string[];
}

export const REELS_DATA: ReelItem[] = [
  {
    id: "r1",
    creator: {
      username: "alex.tech.daily",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      verified: true,
      isFollowing: false,
    },
    caption: "Building an autonomous micro-SaaS agent pipeline in 15 minutes with Claude Code. Watch this flow! ⚡️",
    hashtags: ["#buildinpublic", "#aiagents", "#coding", "#saas"],
    audioTitle: "alex.tech.daily • Original audio (Lo-Fi Dev Beats)",
    posterUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=900&auto=format&fit=crop&q=80",
    fallbackGradient: "linear-gradient(180deg, #1E1B4B 0%, #0F172A 50%, #020617 100%)",
    likes: 84390,
    commentsCount: 1420,
    sharesCount: 5210,
    repostsCount: 890,
    tags: ["Tech", "AI", "Startup"],
  },
  {
    id: "r2",
    creator: {
      username: "frontend.sorcery",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      verified: true,
      isFollowing: true,
    },
    caption: "POV: You ask the AI coding model to center a div and it rewrites the entire flex layout into CSS Grid with 12 animations 😅",
    hashtags: ["#frontend", "#webdev", "#developerhumor", "#css"],
    audioTitle: "trending_audio • Synthwave Chill Coding",
    posterUrl: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&auto=format&fit=crop&q=80",
    fallbackGradient: "linear-gradient(180deg, #3B0764 0%, #18181B 50%, #09090B 100%)",
    likes: 124500,
    commentsCount: 2310,
    sharesCount: 14500,
    repostsCount: 3200,
    tags: ["CSS", "Humor", "WebDev"],
  },
  {
    id: "r3",
    creator: {
      username: "waitplay.hq",
      avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
      verified: true,
      isFollowing: true,
    },
    caption: "Don't stare at a blank terminal when your agent is reasoning. WaitPlay launches high-speed micro-games and content right inside your view.",
    hashtags: ["#WaitPlay", "#DevTools", "#Focus", "#FlowState"],
    audioTitle: "WaitPlay HQ • Electronic Pulse Anthem",
    posterUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900&auto=format&fit=crop&q=80",
    fallbackGradient: "linear-gradient(180deg, #022C22 0%, #064E3B 50%, #022C22 100%)",
    likes: 45200,
    commentsCount: 680,
    sharesCount: 3100,
    repostsCount: 940,
    tags: ["WaitPlay", "Productivity"],
  },
];

interface InstagramReelsViewProps {
  onClose?: () => void;
  onNavigateToFeed?: () => void;
}

export const InstagramReelsView: React.FC<InstagramReelsViewProps> = ({
  onClose,
  onNavigateToFeed,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({ r1: true });
  const [bookmarkedMap, setBookmarkedMap] = useState<Record<string, boolean>>({});
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({
    "alex.tech.daily": false,
    "frontend.sorcery": true,
    "waitplay.hq": true,
  });
  const [heartAnim, setHeartAnim] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentsList, setCommentsList] = useState<Record<string, { user: string; text: string; time: string }[]>>({
    r1: [
      { user: "dev_sara", text: "Autonomous agents speed is unreal now!", time: "2h" },
      { user: "mark_codes", text: "What model are you using in Claude Code?", time: "1h" },
    ],
  });

  const activeReel = REELS_DATA[currentIndex];
  const isLiked = !!likedMap[activeReel.id];
  const isBookmarked = !!bookmarkedMap[activeReel.id];
  const isFollowing = !!followingMap[activeReel.creator.username];

  // Keyboard navigation: Up/Down arrows to change reels, Space to toggle play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentIndex((prev) => (prev < REELS_DATA.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : REELS_DATA.length - 1));
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === "Escape") {
        if (onClose) onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const toggleLike = () => {
    setLikedMap((prev) => ({ ...prev, [activeReel.id]: !isLiked }));
    if (!isLiked) {
      setHeartAnim(true);
      setTimeout(() => setHeartAnim(false), 800);
    }
  };

  const toggleBookmark = () => {
    setBookmarkedMap((prev) => ({ ...prev, [activeReel.id]: !isBookmarked }));
  };

  const toggleFollow = () => {
    setFollowingMap((prev) => ({ ...prev, [activeReel.creator.username]: !isFollowing }));
  };

  const handleSendComment = () => {
    if (!newComment.trim()) return;
    setCommentsList((prev) => ({
      ...prev,
      [activeReel.id]: [
        ...(prev[activeReel.id] || []),
        { user: "you", text: newComment.trim(), time: "Now" },
      ],
    }));
    setNewComment("");
  };

  return (
    <div className="relative w-full h-full bg-[#0C0F12] text-white flex items-center justify-center overflow-hidden font-sans select-none">
      {/* Top Controls / Exit */}
      <div className="absolute top-4 left-6 z-30 flex items-center gap-4">
        {onNavigateToFeed && (
          <button
            onClick={onNavigateToFeed}
            className="px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white border border-zinc-700/60 backdrop-blur-md transition-colors cursor-pointer"
          >
            ← Back to Feed
          </button>
        )}
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Instagram Reels
        </span>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-6 z-30 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 backdrop-blur-md transition-colors cursor-pointer"
          title="Close Reels"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Up / Down Navigation Controls (Right Side desktop experience) */}
      <div className="hidden md:flex flex-col items-center gap-3 absolute right-6 z-20">
        <button
          onClick={() =>
            setCurrentIndex((prev) => (prev > 0 ? prev - 1 : REELS_DATA.length - 1))
          }
          className="p-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 shadow-lg transition-transform active:scale-90 cursor-pointer"
          title="Previous Reel (Up Arrow)"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
        <button
          onClick={() =>
            setCurrentIndex((prev) => (prev < REELS_DATA.length - 1 ? prev + 1 : 0))
          }
          className="p-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 shadow-lg transition-transform active:scale-90 cursor-pointer"
          title="Next Reel (Down Arrow)"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* Main Reels Center Column */}
      <div className="relative flex items-end justify-center h-full max-h-[920px] py-4">
        {/* Centered 9:16 Video Container (515px x 915px desktop reference ratio) */}
        <div
          className="relative w-[380px] sm:w-[460px] md:w-[480px] lg:w-[515px] h-full max-h-[880px] rounded-[7px] overflow-hidden bg-black shadow-2xl flex items-center justify-center cursor-pointer border border-[#262A30]/60"
          onClick={() => setIsPlaying(!isPlaying)}
          onDoubleClick={toggleLike}
        >
          {/* Background Poster / Visual Content */}
          <div
            className="absolute inset-0 w-full h-full bg-cover bg-center transition-all duration-500"
            style={{
              backgroundImage: `url(${activeReel.posterUrl})`,
              filter: isPlaying ? "none" : "brightness(0.7)",
            }}
          >
            {/* Ambient subtle vignette */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40" />
          </div>

          {/* Visual Simulation Graphic inside Reel */}
          <div className="relative z-10 text-center px-6 pointer-events-none">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-[#0095F6] to-[#7C3AED] flex items-center justify-center shadow-2xl shadow-blue-500/30 mb-4 animate-pulse">
              <span className="font-extrabold text-2xl tracking-tighter text-white">WP</span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-white drop-shadow-md">
              {activeReel.tags[0]} Showcase
            </h3>
            <p className="text-xs text-zinc-300 mt-1 drop-shadow-sm font-medium">
              Click to pause • Double-click to like
            </p>
          </div>

          {/* Play/Pause center overlay when paused */}
          {!isPlaying && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
              <div className="p-4 rounded-full bg-black/60 backdrop-blur-md text-white border border-white/20 animate-in zoom-in-75">
                <Play className="w-10 h-10 fill-white translate-x-0.5" />
              </div>
            </div>
          )}

          {/* Double-click Heart Pop Animation */}
          {heartAnim && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none animate-in zoom-in-50 duration-300">
              <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-2xl animate-pulse" />
            </div>
          )}

          {/* Bottom-Right Mute/Unmute Control */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted(!isMuted);
            }}
            className="absolute bottom-6 right-5 z-20 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white backdrop-blur-md transition-colors cursor-pointer"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Bottom-Left Information Overlay */}
          <div
            className="absolute bottom-6 left-5 right-18 z-20 text-left space-y-2.5 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Creator Row */}
            <div className="flex items-center gap-2.5">
              <img
                src={activeReel.creator.avatar}
                alt={activeReel.creator.username}
                className="w-9 h-9 rounded-full object-cover border-2 border-white/80 shadow-md"
              />
              <span className="font-semibold text-sm text-white drop-shadow-md hover:underline cursor-pointer">
                {activeReel.creator.username}
              </span>
              {activeReel.creator.verified && (
                <CheckCircle2 className="w-4 h-4 text-[#0095F6] fill-[#0095F6]/20" />
              )}
              <span className="text-white/60 text-xs">•</span>
              <button
                onClick={toggleFollow}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md border backdrop-blur-xs transition-colors cursor-pointer ${
                  isFollowing
                    ? "bg-white/20 border-white/30 text-white"
                    : "bg-transparent border-white text-white hover:bg-white/10"
                }`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            </div>

            {/* Caption & Hashtags */}
            <div className="text-xs text-white drop-shadow-md leading-relaxed pr-2">
              <span>{activeReel.caption}</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {activeReel.hashtags.map((tag) => (
                  <span key={tag} className="font-medium text-white/90 hover:underline cursor-pointer">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Audio Track Pill */}
            <div className="flex items-center gap-2 text-xs text-white/90 drop-shadow-md pt-1">
              <Music className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[260px] text-[11px] font-normal">
                {activeReel.audioTitle}
              </span>
            </div>
          </div>
        </div>

        {/* Right Vertical Engagement Rail (Desktop Instagram Reels standard) */}
        <div className="ml-4 mb-6 flex flex-col items-center gap-5 z-20 shrink-0">
          {/* Like */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleLike}
              className="p-3 rounded-full hover:bg-white/10 text-white transition-transform active:scale-125 cursor-pointer"
              title="Like"
            >
              <Heart
                className={`w-7 h-7 transition-colors ${
                  isLiked ? "text-[#ED4956] fill-[#ED4956]" : "text-white"
                }`}
              />
            </button>
            <span className="text-[11px] font-semibold text-white/90">
              {(activeReel.likes + (isLiked ? 1 : 0)).toLocaleString()}
            </span>
          </div>

          {/* Comment */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setIsCommentsOpen(!isCommentsOpen)}
              className="p-3 rounded-full hover:bg-white/10 text-white transition-transform active:scale-125 cursor-pointer"
              title="Comment"
            >
              <MessageCircle className="w-7 h-7" />
            </button>
            <span className="text-[11px] font-semibold text-white/90">
              {activeReel.commentsCount.toLocaleString()}
            </span>
          </div>

          {/* Repost */}
          <div className="flex flex-col items-center gap-1">
            <button
              className="p-3 rounded-full hover:bg-white/10 text-white transition-transform active:scale-125 cursor-pointer"
              title="Repost"
            >
              <Repeat2 className="w-7 h-7" />
            </button>
            <span className="text-[11px] font-semibold text-white/90">
              {activeReel.repostsCount.toLocaleString()}
            </span>
          </div>

          {/* Share */}
          <div className="flex flex-col items-center gap-1">
            <button
              className="p-3 rounded-full hover:bg-white/10 text-white transition-transform active:scale-125 cursor-pointer"
              title="Share"
            >
              <Send className="w-6 h-6 -rotate-12" />
            </button>
            <span className="text-[11px] font-semibold text-white/90">
              {activeReel.sharesCount.toLocaleString()}
            </span>
          </div>

          {/* Bookmark */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleBookmark}
              className="p-3 rounded-full hover:bg-white/10 text-white transition-transform active:scale-125 cursor-pointer"
              title="Save"
            >
              <Bookmark
                className={`w-7 h-7 transition-colors ${
                  isBookmarked ? "text-white fill-white" : "text-white"
                }`}
              />
            </button>
          </div>

          {/* More options */}
          <button
            className="p-3 rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer"
            title="Options"
          >
            <MoreHorizontal className="w-6 h-6" />
          </button>

          {/* Creator Audio Disc Spinning thumbnail */}
          <div
            className={`w-9 h-9 rounded-lg border-2 border-white overflow-hidden shadow-lg mt-1 cursor-pointer ${
              isPlaying ? "animate-spin" : ""
            }`}
            style={{ animationDuration: "5s" }}
          >
            <img
              src={activeReel.creator.avatar}
              alt="audio avatar"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Slide-over Comments Drawer for Reels */}
        {isCommentsOpen && (
          <div className="absolute inset-y-0 right-0 z-40 w-[340px] bg-[#12161A] border-l border-[#262A30] flex flex-col p-4 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#262A30]">
              <h4 className="text-sm font-bold text-white">Comments</h4>
              <button
                onClick={() => setIsCommentsOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {(commentsList[activeReel.id] || []).map((c, i) => (
                <div key={i} className="text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{c.user}</span>
                    <span className="text-[10px] text-zinc-500">{c.time}</span>
                  </div>
                  <p className="text-zinc-300">{c.text}</p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#262A30] flex items-center gap-2">
              <input
                type="text"
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
                className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-hidden"
              />
              <button
                onClick={handleSendComment}
                className="text-xs font-semibold text-[#0095F6] hover:text-blue-400 px-2"
              >
                Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
