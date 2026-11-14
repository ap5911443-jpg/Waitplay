import React, { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Repeat2,
  MoreHorizontal,
  CheckCircle2,
  Compass,
  Film,
  Home,
  PlusSquare,
  Search,
  User,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Bell,
} from 'lucide-react';
import { InstagramStoryModal, StoryItem } from './InstagramStoryModal';
import { InstagramCommentsModal, CommentItem } from './InstagramCommentsModal';

interface PostData {
  id: string;
  author: string;
  avatarText: string;
  avatarBg: string;
  isVerified: boolean;
  timeAgo: string;
  mediaType: 'image' | 'video';
  mediaGradient: string;
  mediaTitle: string;
  mediaBadge: string;
  likes: number;
  isLiked: boolean;
  isBookmarked: boolean;
  isFollowing: boolean;
  caption: string;
  hashtags: string[];
  commentsCount: number;
  comments: CommentItem[];
}

interface InstagramFeedProps {
  onNavigateToReels: () => void;
}

const INITIAL_STORIES: StoryItem[] = [
  {
    id: 1,
    name: 'waitplay.app',
    avatarText: 'WP',
    avatarBg: '#0095F6',
    timeAgo: '2h',
    tagline: 'SaaS Launch Update',
    title: 'WaitPlay v2.0 is Live',
    subtitle: 'Micro-games, Instagram Reels, and YouTube while your Claude agent works.',
    accentColor: '#3B82F6',
  },
  {
    id: 2,
    name: 'dan_abramov',
    avatarText: 'DA',
    avatarBg: '#6366F1',
    timeAgo: '3h',
    tagline: 'React Server Actions',
    title: 'Zero Latency Transitions',
    subtitle: 'Exploring concurrent rendering patterns in distributed systems.',
    accentColor: '#818CF8',
  },
  {
    id: 3,
    name: 'karpathy',
    avatarText: 'AK',
    avatarBg: '#10B981',
    timeAgo: '4h',
    tagline: 'AI Thoughts',
    title: 'Autoregressive Code Gen',
    subtitle: 'The 10-second agent delay is the new compiling latency.',
    accentColor: '#10B981',
  },
  {
    id: 4,
    name: 'sama',
    avatarText: 'SA',
    avatarBg: '#EC4899',
    timeAgo: '5h',
    tagline: 'Next-Gen Models',
    title: 'Scaling Test-Time Compute',
    subtitle: 'Reasoning models will do 5-minute autonomous multi-step loops.',
    accentColor: '#EC4899',
  },
  {
    id: 5,
    name: 'levelsio',
    avatarText: 'LV',
    avatarBg: '#F59E0B',
    timeAgo: '6h',
    tagline: 'Indie Hacking',
    title: 'Shipping from Lisbon',
    subtitle: 'Solopreneurs with AI coding tools are outbuilding 50-person teams.',
    accentColor: '#F59E0B',
  },
  {
    id: 6,
    name: 'rauchg',
    avatarText: 'GR',
    avatarBg: '#06B6D4',
    timeAgo: '7h',
    tagline: 'Edge Infrastructure',
    title: 'Frontend Cloud & AI',
    subtitle: 'Streaming responses with edge workers for instant UX feedback.',
    accentColor: '#06B6D4',
  },
];

const INITIAL_POSTS: PostData[] = [
  {
    id: 'post-1',
    author: 'anthropic.ai',
    avatarText: 'AI',
    avatarBg: '#D97706',
    isVerified: true,
    timeAgo: '2h',
    mediaType: 'video',
    mediaGradient: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #1E293B 100%)',
    mediaTitle: 'Claude 3.7 Sonnet: Hybrid Reasoning in Action',
    mediaBadge: 'AGENT EXECUTION',
    likes: 14820,
    isLiked: false,
    isBookmarked: false,
    isFollowing: false,
    caption: 'When your AI agent starts executing multi-step bash commands, you no longer need to switch away. Enjoy WaitPlay companion mode right alongside your terminal.',
    hashtags: ['#ClaudeCode', '#WaitPlay', '#DeveloperTools', '#AI'],
    commentsCount: 342,
    comments: [
      {
        id: 'c1',
        username: 'swyx',
        avatarText: 'SX',
        avatarBg: '#8B5CF6',
        text: 'This companion UX is huge for 30s+ agent latency loops.',
        timeAgo: '1h',
        likes: 42,
      },
      {
        id: 'c2',
        username: 'shadcn',
        avatarText: 'CN',
        avatarBg: '#10B981',
        text: 'Clean typography and layout. Matches native Instagram perfectly.',
        timeAgo: '45m',
        likes: 19,
      },
    ],
  },
  {
    id: 'post-2',
    author: 'cursor.dev',
    avatarText: 'CR',
    avatarBg: '#3B82F6',
    isVerified: true,
    timeAgo: '4h',
    mediaType: 'image',
    mediaGradient: 'linear-gradient(135deg, #090D16 0%, #172554 60%, #1D4ED8 100%)',
    mediaTitle: 'Background Agent Workflows with Zero Tab-Switching',
    mediaBadge: 'SYSTEM ARCHITECTURE',
    likes: 9240,
    isLiked: false,
    isBookmarked: false,
    isFollowing: true,
    caption: 'Research shows tab-switching to Twitter or Slack costs 23 minutes of focus recovery. Keep your context intact with integrated micro-breaks.',
    hashtags: ['#DeepWork', '#Focus', '#Productivity'],
    commentsCount: 188,
    comments: [
      {
        id: 'c3',
        username: 'dan_abramov',
        avatarText: 'DA',
        avatarBg: '#6366F1',
        text: 'Very true about Gloria Mark\'s research on task-switching.',
        timeAgo: '2h',
        likes: 67,
      },
    ],
  },
  {
    id: 'post-3',
    author: 'linear.app',
    avatarText: 'LN',
    avatarBg: '#5B21B6',
    isVerified: true,
    timeAgo: '7h',
    mediaType: 'image',
    mediaGradient: 'linear-gradient(135deg, #18181B 0%, #27272A 70%, #3F3F46 100%)',
    mediaTitle: 'Craft & Precision in Modern Developer Tools',
    mediaBadge: 'DESIGN TOKENS',
    likes: 11450,
    isLiked: false,
    isBookmarked: false,
    isFollowing: false,
    caption: 'Every pixel, margin, and interaction matters. Respecting native design patterns creates instant familiarity.',
    hashtags: ['#DesignSystems', '#Craft', '#UX'],
    commentsCount: 94,
    comments: [
      {
        id: 'c4',
        username: 'paborio',
        avatarText: 'PB',
        avatarBg: '#EC4899',
        text: 'The near-black palette #0C0F12 is spot-on.',
        timeAgo: '3h',
        likes: 14,
      },
    ],
  },
];

const INITIAL_SUGGESTED = [
  { id: 's1', username: 'github', relation: 'Followed by karpathy + 48 others', avatarText: 'GH', avatarBg: '#24292F', isFollowing: false },
  { id: 's2', username: 'openai', relation: 'Followed by sama + 90 others', avatarText: 'OA', avatarBg: '#10A37F', isFollowing: false },
  { id: 's3', username: 'vercel', relation: 'Followed by rauchg + 32 others', avatarText: 'VC', avatarBg: '#000000', isFollowing: false },
  { id: 's4', username: 'supabase', relation: 'Suggested for you', avatarText: 'SB', avatarBg: '#3ECF8E', isFollowing: false },
];

export const InstagramFeed: React.FC<InstagramFeedProps> = ({ onNavigateToReels }) => {
  const [posts, setPosts] = useState<PostData[]>(INITIAL_POSTS);
  const [suggested, setSuggested] = useState(INITIAL_SUGGESTED);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>('post-1');
  const [isMuted, setIsMuted] = useState(true);

  const togglePostLike = (id: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const liked = !p.isLiked;
          return {
            ...p,
            isLiked: liked,
            likes: p.likes + (liked ? 1 : -1),
          };
        }
        return p;
      })
    );
  };

  const togglePostBookmark = (id: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isBookmarked: !p.isBookmarked } : p))
    );
  };

  const toggleFollowPostAuthor = (id: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isFollowing: !p.isFollowing } : p))
    );
  };

  const toggleFollowSuggested = (id: string) => {
    setSuggested((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isFollowing: !s.isFollowing } : s))
    );
  };

  const handleAddComment = (postId: string, text: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
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
            ...p,
            commentsCount: p.commentsCount + 1,
            comments: [newComment, ...p.comments],
          };
        }
        return p;
      })
    );
  };

  const currentCommentPost = posts.find((p) => p.id === activeCommentsPostId);

  return (
    <div className="w-full h-full bg-[#0C0F12] text-zinc-100 flex overflow-hidden font-sans select-none">
      {/* 1. Left Navigation Rail (Desktop Instagram Web Standard) */}
      <aside className="w-[72px] xl:w-[220px] border-r border-[#262626] p-4 flex flex-col justify-between shrink-0 bg-[#0C0F12] z-10 transition-all duration-200">
        <div className="flex flex-col gap-6">
          {/* Instagram Wordmark / Logo */}
          <div className="h-10 flex items-center px-2 cursor-pointer">
            <span className="hidden xl:inline text-xl font-bold font-serif tracking-tight text-white">
              Instagram
            </span>
            <div className="xl:hidden w-8 h-8 rounded-lg bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center font-bold text-white text-xs">
              IG
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5">
            <button className="flex items-center gap-4 p-3 rounded-lg bg-white/10 text-white font-bold text-sm text-left transition-colors">
              <Home size={22} className="shrink-0" />
              <span className="hidden xl:inline">Home</span>
            </button>

            <button className="flex items-center gap-4 p-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm text-left transition-colors">
              <Search size={22} className="shrink-0" />
              <span className="hidden xl:inline">Search</span>
            </button>

            <button className="flex items-center gap-4 p-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm text-left transition-colors">
              <Compass size={22} className="shrink-0" />
              <span className="hidden xl:inline">Explore</span>
            </button>

            <button
              onClick={onNavigateToReels}
              className="flex items-center gap-4 p-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm text-left transition-colors group cursor-pointer"
            >
              <Film size={22} className="shrink-0 group-hover:text-[#0095F6] transition-colors" />
              <div className="hidden xl:flex items-center justify-between flex-1">
                <span>Reels</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#0095F6]/20 text-[#0095F6] font-bold">
                  9:16
                </span>
              </div>
            </button>

            <button className="flex items-center gap-4 p-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm text-left transition-colors">
              <MessageCircle size={22} className="shrink-0" />
              <span className="hidden xl:inline">Messages</span>
            </button>

            <button className="flex items-center gap-4 p-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm text-left transition-colors">
              <Bell size={22} className="shrink-0" />
              <span className="hidden xl:inline">Notifications</span>
            </button>

            <button className="flex items-center gap-4 p-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm text-left transition-colors">
              <PlusSquare size={22} className="shrink-0" />
              <span className="hidden xl:inline">Create</span>
            </button>

            <button className="flex items-center gap-4 p-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm text-left transition-colors">
              <User size={22} className="shrink-0" />
              <span className="hidden xl:inline">Profile</span>
            </button>
          </nav>
        </div>

        {/* Options */}
        <button className="flex items-center gap-4 p-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium text-sm text-left transition-colors">
          <MoreHorizontal size={22} className="shrink-0" />
          <span className="hidden xl:inline">More</span>
        </button>
      </aside>

      {/* 2. Main Scrollable Content Area */}
      <div className="flex-1 h-full overflow-y-auto flex justify-center py-6 px-4 md:px-8">
        <div className="w-full max-w-[620px] flex flex-col gap-6 shrink-0">
          {/* A. Stories Section at Top (spec) */}
          <div className="flex items-center gap-3.5 p-3.5 bg-[#12161A] rounded-2xl border border-[#1E232A] overflow-x-auto no-scrollbar">
            {INITIAL_STORIES.map((story, index) => (
              <button
                key={story.id}
                onClick={() => setActiveStoryIndex(index)}
                className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer focus:outline-none"
              >
                {/* Gradient Story Ring */}
                <div className="w-[62px] h-[62px] rounded-full p-[2.5px] bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-full bg-[#0C0F12] p-[2px] flex items-center justify-center">
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-xs font-bold text-white shadow-inner"
                      style={{ backgroundColor: story.avatarBg }}
                    >
                      {story.avatarText}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[64px] group-hover:text-white">
                  {story.name}
                </span>
              </button>
            ))}
          </div>

          {/* B. Main Feed Posts */}
          <div className="flex flex-col gap-6 pb-12">
            {posts.map((post) => (
              <article
                key={post.id}
                className="bg-[#12161A] border border-[#1E232A] rounded-2xl overflow-hidden shadow-lg flex flex-col"
              >
                {/* Post Header */}
                <div className="p-3.5 flex items-center justify-between border-b border-[#1E232A]/60">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                      style={{ backgroundColor: post.avatarBg }}
                    >
                      {post.avatarText}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white hover:underline cursor-pointer">
                          {post.author}
                        </span>
                        {post.isVerified && (
                          <CheckCircle2 size={13} className="text-[#0095F6] fill-[#0095F6]" />
                        )}
                        <span className="text-zinc-500 text-xs">•</span>
                        <span className="text-zinc-400 text-xs">{post.timeAgo}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleFollowPostAuthor(post.id)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        post.isFollowing
                          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          : 'text-[#0095F6] hover:text-blue-400'
                      }`}
                    >
                      {post.isFollowing ? 'Following' : 'Follow'}
                    </button>
                    <button className="text-zinc-400 hover:text-white p-1">
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </div>

                {/* Post Media (rounded corners approx 5-7px per spec) */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-black flex items-center justify-center">
                  <div
                    className="w-full h-full flex flex-col items-center justify-center p-8 text-center"
                    style={{ background: post.mediaGradient }}
                  >
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase mb-3 bg-white/10 text-white border border-white/20">
                      {post.mediaBadge}
                    </span>
                    <h4 className="text-lg md:text-xl font-bold text-white max-w-sm leading-snug drop-shadow-md">
                      {post.mediaTitle}
                    </h4>

                    {post.mediaType === 'video' && (
                      <button
                        onClick={() =>
                          setPlayingVideoId((prev) => (prev === post.id ? null : post.id))
                        }
                        className="mt-4 p-3 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                      >
                        {playingVideoId === post.id ? <Pause size={20} /> : <Play size={20} />}
                      </button>
                    )}
                  </div>

                  {/* Video Mute Indicator */}
                  {post.mediaType === 'video' && (
                    <button
                      onClick={() => setIsMuted((m) => !m)}
                      className="absolute bottom-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer"
                    >
                      {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                  )}
                </div>

                {/* Engagement Bar */}
                <div className="p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => togglePostLike(post.id)}
                      className="text-zinc-300 hover:text-white transition-transform active:scale-125 cursor-pointer"
                      title="Like"
                    >
                      <Heart
                        size={22}
                        className={
                          post.isLiked
                            ? 'fill-red-500 text-red-500 scale-110 transition-transform'
                            : 'hover:text-red-400'
                        }
                      />
                    </button>
                    <button
                      onClick={() => setActiveCommentsPostId(post.id)}
                      className="text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Comment"
                    >
                      <MessageCircle size={22} />
                    </button>
                    <button
                      className="text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Repost"
                    >
                      <Repeat2 size={22} />
                    </button>
                    <button
                      className="text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Share"
                    >
                      <Send size={20} />
                    </button>
                  </div>

                  <button
                    onClick={() => togglePostBookmark(post.id)}
                    className="text-zinc-300 hover:text-white transition-transform active:scale-110 cursor-pointer"
                    title="Bookmark"
                  >
                    <Bookmark
                      size={22}
                      className={post.isBookmarked ? 'fill-white text-white' : ''}
                    />
                  </button>
                </div>

                {/* Post Information */}
                <div className="px-3.5 pb-4 flex flex-col gap-1.5 text-xs">
                  <span className="font-bold text-white">
                    {post.likes.toLocaleString()} likes
                  </span>

                  <div className="leading-relaxed">
                    <span className="font-bold text-white mr-2">{post.author}</span>
                    <span className="text-zinc-300">{post.caption}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[11px] text-[#0095F6]">
                    {post.hashtags.map((tag, idx) => (
                      <span key={idx} className="hover:underline cursor-pointer">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => setActiveCommentsPostId(post.id)}
                    className="text-zinc-500 text-[11px] font-medium text-left mt-1 hover:text-zinc-300 cursor-pointer"
                  >
                    View all {post.commentsCount} comments
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* 3. Right Sidebar: Suggested Accounts Panel (spec) */}
        <aside className="hidden lg:flex flex-col w-[300px] shrink-0 pl-10 py-2 gap-5 text-xs">
          {/* Logged-In User Profile */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-sm shadow-md">
                WP
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-white text-xs">waitplay.user</span>
                <span className="text-zinc-400 text-[11px]">Developer Companion</span>
              </div>
            </div>
            <button className="text-[#0095F6] font-bold text-xs hover:text-blue-400 transition-colors cursor-pointer">
              Switch
            </button>
          </div>

          {/* Suggested For You Header */}
          <div className="flex items-center justify-between text-zinc-400 font-bold text-xs pt-2">
            <span>Suggested for you</span>
            <button className="text-white hover:text-zinc-300 text-[11px]">See All</button>
          </div>

          {/* Suggested User List */}
          <div className="flex flex-col gap-3.5">
            {suggested.map((user) => (
              <div key={user.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: user.avatarBg }}
                  >
                    {user.avatarText}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-xs hover:underline cursor-pointer">
                      {user.username}
                    </span>
                    <span className="text-zinc-400 text-[10px] truncate max-w-[130px]">
                      {user.relation}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => toggleFollowSuggested(user.id)}
                  className={`text-xs font-bold transition-colors cursor-pointer ${
                    user.isFollowing
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-[#0095F6] hover:text-blue-400'
                  }`}
                >
                  {user.isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>

          {/* Footer Links (spec) */}
          <footer className="pt-4 border-t border-[#1E232A] text-[10px] text-zinc-500 leading-relaxed">
            <p className="flex flex-wrap gap-x-2 gap-y-1 mb-2">
              <span className="hover:underline cursor-pointer">About</span>•
              <span className="hover:underline cursor-pointer">Help</span>•
              <span className="hover:underline cursor-pointer">Press</span>•
              <span className="hover:underline cursor-pointer">API</span>•
              <span className="hover:underline cursor-pointer">Jobs</span>•
              <span className="hover:underline cursor-pointer">Privacy</span>•
              <span className="hover:underline cursor-pointer">Terms</span>
            </p>
            <p>© 2026 WAITPLAY RECREATION FROM INSTAGRAM</p>
          </footer>
        </aside>
      </div>

      {/* Stories Modal */}
      {activeStoryIndex !== null && (
        <InstagramStoryModal
          stories={INITIAL_STORIES}
          initialIndex={activeStoryIndex}
          isOpen={activeStoryIndex !== null}
          onClose={() => setActiveStoryIndex(null)}
        />
      )}

      {/* Comments Drawer Modal */}
      {currentCommentPost && (
        <InstagramCommentsModal
          isOpen={activeCommentsPostId !== null}
          onClose={() => setActiveCommentsPostId(null)}
          postAuthor={currentCommentPost.author}
          postCaption={currentCommentPost.caption}
          comments={currentCommentPost.comments}
          onAddComment={(text) => handleAddComment(currentCommentPost.id, text)}
        />
      )}
    </div>
  );
};
