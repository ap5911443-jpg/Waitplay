import React, { useState, useEffect } from 'react';
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
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { InstagramCommentsModal, CommentItem } from './InstagramCommentsModal';

export interface ReelData {
  id: string;
  creator: string;
  avatarText: string;
  avatarBg: string;
  isVerified: boolean;
  isFollowing: boolean;
  caption: string;
  hashtags: string[];
  audioTitle: string;
  likes: number;
  isLiked: boolean;
  commentsCount: number;
  repostsCount: number;
  sharesCount: number;
  isBookmarked: boolean;
  gradient: string;
  headline: string;
  subhead: string;
  codeSnippet?: string;
  badge: string;
  comments: CommentItem[];
}

const SAMPLE_REELS: ReelData[] = [
  {
    id: 'reel-1',
    creator: 'waitplay.official',
    avatarText: 'WP',
    avatarBg: '#0095F6',
    isVerified: true,
    isFollowing: false,
    caption: 'Why stare at a terminal spinner for 45 seconds? Dock WaitPlay to your screen edge and stay in flow.',
    hashtags: ['#developer', '#productivity', '#coding', '#ai'],
    audioTitle: 'WaitPlay Originals • Lo-Fi Flow Beats',
    likes: 24890,
    isLiked: false,
    commentsCount: 612,
    repostsCount: 1420,
    sharesCount: 3840,
    isBookmarked: false,
    gradient: 'linear-gradient(180deg, #181B20 0%, #0F1216 40%, #080A0C 100%)',
    headline: 'YOUR AI WORKS.',
    subhead: 'YOU PLAY.',
    codeSnippet: 'agent.run("Refactor auth system..."); // 32s',
    badge: 'WAITPLAY COMPANION',
    comments: [
      {
        id: 'rc1',
        username: 'dev_alex',
        avatarText: 'DA',
        avatarBg: '#3B82F6',
        text: 'This solves the tab-switching rabbit hole so cleanly.',
        timeAgo: '2h',
        likes: 89,
      },
      {
        id: 'rc2',
        username: 'frontend_ninja',
        avatarText: 'FN',
        avatarBg: '#10B981',
        text: 'The Reel UI recreation is pixel-perfect! 👏',
        timeAgo: '1h',
        likes: 34,
      },
    ],
  },
  {
    id: 'reel-2',
    creator: 'karpathy',
    avatarText: 'AK',
    avatarBg: '#10B981',
    isVerified: true,
    isFollowing: true,
    caption: 'The future of software engineering is orchestrating agents. But humans need sub-minute dopamine loops.',
    hashtags: ['#AI', '#MachineLearning', '#Agents'],
    audioTitle: 'Synthesizer Waves • Ambient Tech',
    likes: 48920,
    isLiked: true,
    commentsCount: 1240,
    repostsCount: 4510,
    sharesCount: 9210,
    isBookmarked: true,
    gradient: 'linear-gradient(180deg, #064E3B 0%, #065F46 30%, #022C22 100%)',
    headline: 'AUTONOMOUS REASONING',
    subhead: 'MULTI-STEP EXECUTION',
    codeSnippet: 'model: claude-3-7-sonnet | thinking: enabled',
    badge: 'DEEP DIVE',
    comments: [
      {
        id: 'rc3',
        username: 'sama',
        avatarText: 'SA',
        avatarBg: '#EC4899',
        text: 'Agreed on latency dynamics.',
        timeAgo: '3h',
        likes: 198,
      },
    ],
  },
  {
    id: 'reel-3',
    creator: 'dan_abramov',
    avatarText: 'DA',
    avatarBg: '#6366F1',
    isVerified: true,
    isFollowing: false,
    caption: 'Micro-interactions in React 19: maintaining 60fps animations while streaming large payloads.',
    hashtags: ['#React', '#JavaScript', '#WebDev'],
    audioTitle: 'Dan Abramov • Live Keynote Audio',
    likes: 31200,
    isLiked: false,
    commentsCount: 840,
    repostsCount: 2190,
    sharesCount: 5120,
    isBookmarked: false,
    gradient: 'linear-gradient(180deg, #1E1B4B 0%, #312E81 40%, #0F172A 100%)',
    headline: 'STREAMING UI TOKENS',
    subhead: 'ZERO JANK RENDERING',
    codeSnippet: '<Suspense fallback={<WaitPlayCompanion />}>',
    badge: 'REACT ARCHITECTURE',
    comments: [],
  },
];

interface InstagramReelsViewProps {
  onBackToFeed: () => void;
}

export const InstagramReelsView: React.FC<InstagramReelsViewProps> = ({ onBackToFeed }) => {
  const [reels, setReels] = useState<ReelData[]>(SAMPLE_REELS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlayPulse, setShowPlayPulse] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [discAngle, setDiscAngle] = useState(0);

  const currentReel = reels[currentIndex];

  useEffect(() => {
    let animId: number;
    if (isPlaying) {
      const updateDisc = () => {
        setDiscAngle((a) => (a + 2) % 360);
        animId = requestAnimationFrame(updateDisc);
      };
      animId = requestAnimationFrame(updateDisc);
    }
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') handlePrevReel();
      if (e.key === 'ArrowDown') handleNextReel();
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'm') setIsMuted((m) => !m);
      if (e.key === 'Escape') {
        if (showComments) setShowComments(false);
        else onBackToFeed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isPlaying, showComments]);

  const togglePlay = () => {
    setIsPlaying((p) => !p);
    setShowPlayPulse(true);
    setTimeout(() => setShowPlayPulse(false), 600);
  };

  const handleNextReel = () => {
    if (currentIndex < reels.length - 1) {
      setCurrentIndex((c) => c + 1);
      setIsPlaying(true);
    }
  };

  const handlePrevReel = () => {
    if (currentIndex > 0) {
      setCurrentIndex((c) => c - 1);
      setIsPlaying(true);
    }
  };

  const toggleLike = () => {
    setReels((prev) =>
      prev.map((r, i) => {
        if (i === currentIndex) {
          const liked = !r.isLiked;
          return {
            ...r,
            isLiked: liked,
            likes: r.likes + (liked ? 1 : -1),
          };
        }
        return r;
      })
    );
  };

  const toggleBookmark = () => {
    setReels((prev) =>
      prev.map((r, i) =>
        i === currentIndex ? { ...r, isBookmarked: !r.isBookmarked } : r
      )
    );
  };

  const toggleFollow = () => {
    setReels((prev) =>
      prev.map((r, i) =>
        i === currentIndex ? { ...r, isFollowing: !r.isFollowing } : r
      )
    );
  };

  const handleAddComment = (text: string) => {
    setReels((prev) =>
      prev.map((r, i) => {
        if (i === currentIndex) {
          const newComment: CommentItem = {
            id: Date.now().toString(),
            username: 'you',
            avatarText: 'ME',
            avatarBg: '#0095F6',
            text,
            timeAgo: 'Just now',
            likes: 0,
            isLiked: false,
          };
          return {
            ...r,
            commentsCount: r.commentsCount + 1,
            comments: [newComment, ...r.comments],
          };
        }
        return r;
      })
    );
  };

  return (
    <div className="w-full h-full bg-[#0C0F12] flex items-center justify-center relative overflow-hidden select-none font-sans">
      {/* Top Header Back Button */}
      <button
        onClick={onBackToFeed}
        className="absolute top-5 left-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md transition-colors z-40 cursor-pointer"
        title="Back to Feed (Esc)"
      >
        <ArrowLeft size={16} />
        <span>Feed</span>
      </button>

      {/* Up/Down Reel Navigators (Desktop standard) */}
      <div className="absolute right-6 sm:right-12 flex flex-col gap-3 z-30">
        <button
          onClick={handlePrevReel}
          disabled={currentIndex === 0}
          className="p-3 rounded-full bg-[#181C22]/80 hover:bg-zinc-800 disabled:opacity-30 text-white transition-colors cursor-pointer border border-white/10"
          title="Previous Reel (Up Arrow)"
        >
          <ChevronUp size={22} />
        </button>
        <button
          onClick={handleNextReel}
          disabled={currentIndex === reels.length - 1}
          className="p-3 rounded-full bg-[#181C22]/80 hover:bg-zinc-800 disabled:opacity-30 text-white transition-colors cursor-pointer border border-white/10"
          title="Next Reel (Down Arrow)"
        >
          <ChevronDown size={22} />
        </button>
      </div>

      {/* Centered 9:16 Video Container (approx 515px x 915px from spec) */}
      <div className="relative w-[380px] sm:w-[440px] md:w-[480px] lg:w-[515px] h-[720px] sm:h-[820px] lg:h-[890px] max-h-[94vh] rounded-[7px] bg-black overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
        {/* Reel Background & Animation Canvas */}
        <div
          onClick={togglePlay}
          className="absolute inset-0 cursor-pointer flex flex-col items-center justify-center p-8 text-center"
          style={{ background: currentReel.gradient }}
        >
          {/* Badge */}
          <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase mb-5 bg-white/15 text-white border border-white/25 shadow-sm">
            {currentReel.badge}
          </span>

          {/* Luminous Center Graphic */}
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-[#0095F6] via-[#7C3AED] to-[#EC4899] flex items-center justify-center shadow-2xl mb-6 shadow-blue-500/20">
            <span className="text-3xl font-black text-white">{currentReel.avatarText}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight mb-2 drop-shadow-lg">
            {currentReel.headline}
          </h2>

          <p className="text-sm font-semibold text-white/80 tracking-wide uppercase mb-6 drop-shadow-md">
            {currentReel.subhead}
          </p>

          {currentReel.codeSnippet && (
            <div className="px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 font-mono text-[11px] text-emerald-400 shadow-inner max-w-xs truncate">
              {currentReel.codeSnippet}
            </div>
          )}

          {/* Center Play/Pause Pop Animation */}
          {showPlayPulse && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white animate-ping">
                {isPlaying ? <Play size={36} /> : <Pause size={36} />}
              </div>
            </div>
          )}
        </div>

        {/* Video Overlay - Engagement Rail on Right Side (Spec) */}
        <div className="absolute right-3.5 bottom-24 flex flex-col items-center gap-5 z-20">
          {/* Like */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleLike}
              className="p-2 text-white hover:scale-115 active:scale-95 transition-transform cursor-pointer"
            >
              <Heart
                size={28}
                className={
                  currentReel.isLiked
                    ? 'fill-red-500 text-red-500 scale-110 transition-transform'
                    : 'text-white'
                }
              />
            </button>
            <span className="text-[11px] font-semibold text-white drop-shadow-md">
              {currentReel.likes.toLocaleString()}
            </span>
          </div>

          {/* Comment */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setShowComments(true)}
              className="p-2 text-white hover:scale-115 active:scale-95 transition-transform cursor-pointer"
            >
              <MessageCircle size={28} />
            </button>
            <span className="text-[11px] font-semibold text-white drop-shadow-md">
              {currentReel.commentsCount.toLocaleString()}
            </span>
          </div>

          {/* Repost */}
          <div className="flex flex-col items-center gap-1">
            <button className="p-2 text-white hover:scale-115 active:scale-95 transition-transform cursor-pointer">
              <Repeat2 size={28} />
            </button>
            <span className="text-[11px] font-semibold text-white drop-shadow-md">
              {currentReel.repostsCount.toLocaleString()}
            </span>
          </div>

          {/* Share */}
          <div className="flex flex-col items-center gap-1">
            <button className="p-2 text-white hover:scale-115 active:scale-95 transition-transform cursor-pointer">
              <Send size={26} />
            </button>
            <span className="text-[11px] font-semibold text-white drop-shadow-md">
              {currentReel.sharesCount.toLocaleString()}
            </span>
          </div>

          {/* Bookmark */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleBookmark}
              className="p-2 text-white hover:scale-115 active:scale-95 transition-transform cursor-pointer"
            >
              <Bookmark
                size={26}
                className={currentReel.isBookmarked ? 'fill-white text-white' : ''}
              />
            </button>
          </div>

          {/* More Options */}
          <button className="p-2 text-white hover:scale-115 transition-transform cursor-pointer">
            <MoreHorizontal size={24} />
          </button>

          {/* Spinning Audio Vinyl Disc */}
          <div
            className="w-8 h-8 rounded-full border-2 border-white/60 bg-gradient-to-tr from-zinc-800 to-zinc-950 flex items-center justify-center shadow-lg mt-1"
            style={{ transform: `rotate(${discAngle}deg)` }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-white/80" />
          </div>
        </div>

        {/* Video Overlay - Bottom-Left Information (Spec) */}
        <div className="absolute left-4 right-20 bottom-5 flex flex-col gap-2 z-20 text-white drop-shadow-md pointer-events-none">
          {/* Creator Profile */}
          <div className="flex items-center gap-2.5 pointer-events-auto">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
              style={{ backgroundColor: currentReel.avatarBg }}
            >
              {currentReel.avatarText}
            </div>

            <span className="text-xs font-bold hover:underline cursor-pointer">
              {currentReel.creator}
            </span>

            {currentReel.isVerified && (
              <CheckCircle2 size={13} className="text-[#0095F6] fill-[#0095F6]" />
            )}

            <button
              onClick={toggleFollow}
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border transition-colors cursor-pointer ${
                currentReel.isFollowing
                  ? 'border-white/40 bg-transparent text-white'
                  : 'border-white bg-white text-black hover:bg-white/90'
              }`}
            >
              {currentReel.isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>

          {/* Caption & Hashtags */}
          <p className="text-xs text-white/95 leading-relaxed line-clamp-2">
            {currentReel.caption}{' '}
            {currentReel.hashtags.map((h, i) => (
              <span key={i} className="font-semibold text-white mr-1 hover:underline cursor-pointer pointer-events-auto">
                {h}
              </span>
            ))}
          </p>

          {/* Audio Track Marquee */}
          <div className="flex items-center gap-2 text-[11px] text-white/80 pointer-events-auto">
            <Music size={13} className="shrink-0" />
            <span className="truncate max-w-[220px] font-medium">{currentReel.audioTitle}</span>
          </div>
        </div>

        {/* Bottom Right Mute/Unmute Control */}
        <button
          onClick={() => setIsMuted((m) => !m)}
          className="absolute bottom-5 right-4 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors z-20 cursor-pointer"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {/* Reel Comments Drawer */}
      <InstagramCommentsModal
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        postAuthor={currentReel.creator}
        postCaption={currentReel.caption}
        comments={currentReel.comments}
        onAddComment={handleAddComment}
      />
    </div>
  );
};
