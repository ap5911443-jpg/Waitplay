import React, { useState } from "react";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Repeat2,
  MoreHorizontal,
  CheckCircle2,
  Volume2,
  VolumeX,
} from "lucide-react";

export interface Story {
  id: string;
  username: string;
  avatar: string;
  hasStory: boolean;
  isLive?: boolean;
  storyImage: string;
  caption: string;
}

export interface Post {
  id: string;
  author: {
    username: string;
    avatar: string;
    verified: boolean;
    isFollowing?: boolean;
  };
  timeAgo: string;
  location?: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  mediaAspect: string; // e.g. '1/1' or '4/5'
  likes: number;
  caption: string;
  commentsCount: number;
  comments: { user: string; text: string; time: string; likes: number }[];
  tags: string[];
}

export interface SuggestedAccount {
  id: string;
  username: string;
  subtitle: string;
  avatar: string;
  isFollowing?: boolean;
}

interface InstagramFeedProps {
  onOpenStory: (story: Story) => void;
  onOpenReels: () => void;
}

export const INITIAL_STORIES: Story[] = [
  {
    id: "s1",
    username: "waitplay.app",
    avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
    hasStory: true,
    isLive: true,
    storyImage: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900&auto=format&fit=crop&q=80",
    caption: "WaitPlay live preview: Instant micro-games during agent reasoning! 🚀",
  },
  {
    id: "s2",
    username: "karpathy",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    hasStory: true,
    storyImage: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&auto=format&fit=crop&q=80",
    caption: "Thinking models test-time compute scaling is genuinely remarkable.",
  },
  {
    id: "s3",
    username: "dan_abramov",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    hasStory: true,
    storyImage: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&auto=format&fit=crop&q=80",
    caption: "Testing React Server Components with concurrent rendering.",
  },
  {
    id: "s4",
    username: "sama",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    hasStory: true,
    storyImage: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&auto=format&fit=crop&q=80",
    caption: "Scaling laws holding strong. The compute frontier is expanding.",
  },
  {
    id: "s5",
    username: "lexfridman",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
    hasStory: true,
    storyImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=900&auto=format&fit=crop&q=80",
    caption: "In the studio with deep thinkers discussing consciousness and code.",
  },
  {
    id: "s6",
    username: "levelsio",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
    hasStory: true,
    storyImage: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=900&auto=format&fit=crop&q=80",
    caption: "Shipping 3 micro-tools in a single weekend from a coffee shop in Lisbon.",
  },
  {
    id: "s7",
    username: "rauchg",
    avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80",
    hasStory: true,
    storyImage: "https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=900&auto=format&fit=crop&q=80",
    caption: "The web is faster than ever. Edge compute + streaming SSR everywhere.",
  },
];

export const INITIAL_POSTS: Post[] = [
  {
    id: "p1",
    author: {
      username: "karpathy",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      verified: true,
      isFollowing: true,
    },
    timeAgo: "2h",
    location: "Stanford, California",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80",
    mediaAspect: "4/3",
    likes: 14820,
    caption: "LLM agents are reshaping how software gets designed and synthesized. But waiting 30-60 seconds for deep reasoning cycles breaks flow state. Turning latency into bite-sized engagement is a brilliant design primitive.",
    tags: ["#ArtificialIntelligence", "#AutonomousAgents", "#DeveloperExperience"],
    commentsCount: 342,
    comments: [
      { user: "sama", text: "Completely agree. Cognitive latency management is essential.", time: "1h", likes: 89 },
      { user: "dan_abramov", text: "Love the micro-interaction while the agent writes code.", time: "45m", likes: 52 },
      { user: "levelsio", text: "Already built 3 apps while waiting for Claude to finish. Huge multiplier!", time: "20m", likes: 31 },
    ],
  },
  {
    id: "p2",
    author: {
      username: "waitplay.app",
      avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
      verified: true,
      isFollowing: false,
    },
    timeAgo: "4h",
    location: "San Francisco, CA",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80",
    mediaAspect: "16/9",
    likes: 8940,
    caption: "Introducing WaitPlay: The desktop companion that turns your terminal wait time into high-energy micro-games, Instagram Reels, and tech video feeds. Edge-docked, lightweight, zero cognitive drain.",
    tags: ["#WaitPlay", "#CodingAgent", "#ProductLaunch", "#DeveloperTools"],
    commentsCount: 188,
    comments: [
      { user: "swyx", text: "This looks super slick. The Wispr Flow docked widget aesthetic is 🔥", time: "3h", likes: 44 },
      { user: "cursor_team", text: "Very cool companion concept for agent workflows!", time: "2h", likes: 38 },
    ],
  },
  {
    id: "p3",
    author: {
      username: "anthropic.ai",
      avatar: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=150&auto=format&fit=crop&q=80",
      verified: true,
      isFollowing: true,
    },
    timeAgo: "6h",
    location: "Anthropic HQ",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80",
    mediaAspect: "1/1",
    likes: 24190,
    caption: "Claude Code CLI now powers thousands of autonomous developer sessions every hour. Multi-step bash execution, recursive debugging, and deep tool calling in real-time.",
    tags: ["#ClaudeCode", "#AI", "#Anthropic"],
    commentsCount: 612,
    comments: [
      { user: "karpathy", text: "The bash loop execution is seamless.", time: "5h", likes: 120 },
      { user: "rauchg", text: "The future of engineering is hybrid human-agent orchestration.", time: "4h", likes: 88 },
    ],
  },
];

export const INITIAL_SUGGESTED: SuggestedAccount[] = [
  {
    id: "sg1",
    username: "cursor.ide",
    subtitle: "Followed by dan_abramov + 38 others",
    avatar: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=150&auto=format&fit=crop&q=80",
    isFollowing: false,
  },
  {
    id: "sg2",
    username: "linear.app",
    subtitle: "Suggested for you",
    avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
    isFollowing: false,
  },
  {
    id: "sg3",
    username: "github",
    subtitle: "Followed by karpathy + 92 others",
    avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80",
    isFollowing: true,
  },
  {
    id: "sg4",
    username: "stripe",
    subtitle: "Followed by levelsio + 19 others",
    avatar: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=150&auto=format&fit=crop&q=80",
    isFollowing: false,
  },
];

export const InstagramFeed: React.FC<InstagramFeedProps> = ({
  onOpenStory,
  onOpenReels,
}) => {
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({ p1: true });
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Record<string, boolean>>({});
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({
    karpathy: true,
    "anthropic.ai": true,
    github: true,
  });
  const [suggested, setSuggested] = useState<SuggestedAccount[]>(INITIAL_SUGGESTED);
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [heartAnimId, setHeartAnimId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);

  const toggleLike = (postId: string) => {
    const isCurrentlyLiked = !!likedPosts[postId];
    setLikedPosts((prev) => ({ ...prev, [postId]: !isCurrentlyLiked }));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, likes: isCurrentlyLiked ? p.likes - 1 : p.likes + 1 }
          : p
      )
    );
    if (!isCurrentlyLiked) {
      setHeartAnimId(postId);
      setTimeout(() => setHeartAnimId(null), 800);
    }
  };

  const toggleBookmark = (postId: string) => {
    setBookmarkedPosts((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  const toggleFollowAuthor = (username: string) => {
    setFollowingMap((prev) => ({ ...prev, [username]: !prev[username] }));
  };

  const toggleSuggestedFollow = (username: string) => {
    setSuggested((prev) =>
      prev.map((s) =>
        s.username === username ? { ...s, isFollowing: !s.isFollowing } : s
      )
    );
  };

  const handleAddComment = (postId: string) => {
    if (!commentInput.trim()) return;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              commentsCount: p.commentsCount + 1,
              comments: [
                ...p.comments,
                { user: "you (waitplay)", text: commentInput.trim(), time: "Just now", likes: 0 },
              ],
            }
          : p
      )
    );
    setCommentInput("");
  };

  return (
    <div className="flex-1 bg-[#0C0F12] text-[#F5F5F5] overflow-y-auto px-4 py-6 font-sans">
      <div className="max-w-[940px] mx-auto flex items-start gap-8 justify-center">
        {/* Center Main Feed Column */}
        <div className="w-full max-w-[530px] flex flex-col space-y-6">
          {/* Stories Horizontal Tray */}
          <div className="bg-[#12161A] border border-[#262A30] rounded-xl px-4 py-3.5 flex items-center gap-4 overflow-x-auto no-scrollbar shadow-xs">
            {INITIAL_STORIES.map((story) => (
              <button
                key={story.id}
                onClick={() => onOpenStory(story)}
                className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-hidden cursor-pointer"
              >
                <div
                  className={`p-[2px] rounded-full transition-transform duration-200 group-hover:scale-105 ${
                    story.isLive
                      ? "bg-gradient-to-tr from-red-600 via-pink-600 to-purple-600 animate-pulse"
                      : "bg-gradient-to-tr from-[#FBAA47] via-[#D91A46] to-[#A60F93]"
                  }`}
                >
                  <div className="p-[2px] bg-[#0C0F12] rounded-full">
                    <img
                      src={story.avatar}
                      alt={story.username}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-zinc-300 font-normal max-w-[64px] truncate">
                    {story.username}
                  </span>
                  {story.isLive && (
                    <span className="text-[9px] font-bold px-1 py-0.5 bg-red-600 text-white rounded-xs uppercase leading-none">
                      Live
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Feed Posts */}
          <div className="flex flex-col space-y-7">
            {posts.map((post) => {
              const isLiked = !!likedPosts[post.id];
              const isBookmarked = !!bookmarkedPosts[post.id];
              const isFollowing = !!followingMap[post.author.username];
              const isExpanded = !!expandedCaptions[post.id];
              const isHeartPopping = heartAnimId === post.id;

              return (
                <article
                  key={post.id}
                  className="bg-[#12161A] border border-[#262A30] rounded-xl overflow-hidden shadow-sm"
                >
                  {/* Post Header */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-[1.5px] rounded-full bg-gradient-to-tr from-[#FBAA47] to-[#D91A46]">
                        <img
                          src={post.author.avatar}
                          alt={post.author.username}
                          className="w-8 h-8 rounded-full object-cover border border-[#0C0F12]"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-white hover:underline cursor-pointer">
                            {post.author.username}
                          </span>
                          {post.author.verified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#0095F6] fill-[#0095F6]/20" />
                          )}
                          <span className="text-zinc-500 text-xs">•</span>
                          <span className="text-zinc-500 text-xs">{post.timeAgo}</span>
                          <span className="text-zinc-500 text-xs">•</span>
                          <button
                            onClick={() => toggleFollowAuthor(post.author.username)}
                            className={`text-xs font-semibold cursor-pointer ${
                              isFollowing ? "text-zinc-400 hover:text-white" : "text-[#0095F6] hover:text-[#1877F2]"
                            }`}
                          >
                            {isFollowing ? "Following" : "Follow"}
                          </button>
                        </div>
                        {post.location && (
                          <p className="text-[10px] text-zinc-400 leading-tight">
                            {post.location}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      className="text-zinc-400 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
                      title="More options"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Post Media with Double-Click Heart */}
                  <div
                    className="relative bg-black select-none cursor-pointer overflow-hidden flex items-center justify-center"
                    onDoubleClick={() => toggleLike(post.id)}
                  >
                    <img
                      src={post.mediaUrl}
                      alt={post.caption}
                      className="w-full max-h-[580px] object-cover rounded-sm transition-transform duration-300"
                    />

                    {/* Mute indicator overlay */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMuted(!isMuted);
                      }}
                      className="absolute bottom-3 right-3 p-1.5 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 backdrop-blur-xs transition-colors"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    {/* Double-click animated heart pop */}
                    {isHeartPopping && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-in zoom-in-50 duration-300">
                        <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-xl animate-pulse" />
                      </div>
                    )}
                  </div>

                  {/* Engagement Action Bar */}
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => toggleLike(post.id)}
                          className="hover:opacity-70 transition-transform active:scale-125 cursor-pointer"
                          title="Like"
                        >
                          <Heart
                            className={`w-6 h-6 transition-colors ${
                              isLiked ? "text-[#ED4956] fill-[#ED4956]" : "text-white"
                            }`}
                          />
                        </button>
                        <button
                          onClick={() =>
                            setActiveCommentsPostId(
                              activeCommentsPostId === post.id ? null : post.id
                            )
                          }
                          className="text-white hover:opacity-70 transition-transform active:scale-125 cursor-pointer"
                          title="Comment"
                        >
                          <MessageCircle className="w-6 h-6" />
                        </button>
                        <button
                          onClick={onOpenReels}
                          className="text-white hover:opacity-70 transition-transform active:scale-125 cursor-pointer"
                          title="Remix / Reels"
                        >
                          <Repeat2 className="w-6 h-6" />
                        </button>
                        <button
                          className="text-white hover:opacity-70 transition-transform active:scale-125 cursor-pointer"
                          title="Share"
                        >
                          <Send className="w-5 h-5 -rotate-12" />
                        </button>
                      </div>

                      <button
                        onClick={() => toggleBookmark(post.id)}
                        className="hover:opacity-70 transition-transform active:scale-125 cursor-pointer"
                        title="Save"
                      >
                        <Bookmark
                          className={`w-6 h-6 transition-colors ${
                            isBookmarked ? "text-white fill-white" : "text-white"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Likes Count */}
                    <div className="mt-2.5">
                      <span className="text-xs font-bold text-white">
                        {post.likes.toLocaleString()} likes
                      </span>
                    </div>

                    {/* Caption */}
                    <div className="mt-1.5 text-xs text-zinc-200 leading-relaxed">
                      <span className="font-semibold text-white mr-1.5">
                        {post.author.username}
                      </span>
                      {isExpanded ? (
                        <>
                          <span>{post.caption}</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {post.tags.map((tag) => (
                              <span key={tag} className="text-[#0095F6] hover:underline cursor-pointer">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <span>
                            {post.caption.slice(0, 95)}
                            {post.caption.length > 95 && "..."}
                          </span>
                          {post.caption.length > 95 && (
                            <button
                              onClick={() =>
                                setExpandedCaptions((prev) => ({
                                  ...prev,
                                  [post.id]: true,
                                }))
                              }
                              className="text-zinc-400 hover:text-white ml-1 font-medium cursor-pointer"
                            >
                              more
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* View Comments Trigger */}
                    <button
                      onClick={() =>
                        setActiveCommentsPostId(
                          activeCommentsPostId === post.id ? null : post.id
                        )
                      }
                      className="mt-1.5 text-xs text-zinc-400 hover:text-zinc-300 block cursor-pointer"
                    >
                      View all {post.commentsCount} comments
                    </button>

                    {/* Expanded Comments Drawer */}
                    {activeCommentsPostId === post.id && (
                      <div className="mt-3 pt-3 border-t border-[#262A30] space-y-2">
                        {post.comments.map((c, i) => (
                          <div key={i} className="text-xs flex items-start justify-between">
                            <div>
                              <span className="font-semibold text-white mr-1.5">
                                {c.user}
                              </span>
                              <span className="text-zinc-300">{c.text}</span>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                                <span>{c.time}</span>
                                {c.likes > 0 && <span>{c.likes} likes</span>}
                                <button className="hover:underline">Reply</button>
                              </div>
                            </div>
                            <Heart className="w-3 h-3 text-zinc-500 hover:text-red-500 cursor-pointer" />
                          </div>
                        ))}

                        {/* Add Comment Input */}
                        <div className="mt-2 flex items-center gap-2 pt-2 border-t border-[#262A30]/60">
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={commentInput}
                            onChange={(e) => setCommentInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddComment(post.id);
                            }}
                            className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-hidden"
                          />
                          {commentInput.trim() && (
                            <button
                              onClick={() => handleAddComment(post.id)}
                              className="text-xs font-semibold text-[#0095F6] hover:text-[#1877F2] cursor-pointer"
                            >
                              Post
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar — Suggested Accounts & Profile Info */}
        <aside className="hidden lg:block w-[310px] shrink-0 sticky top-6 space-y-6">
          {/* User Profile Card */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-md">
                WP
              </div>
              <div>
                <p className="text-xs font-semibold text-white">waitplay_user</p>
                <p className="text-[11px] text-zinc-400">Developer Companion</p>
              </div>
            </div>
            <button className="text-xs font-semibold text-[#0095F6] hover:text-[#1877F2] cursor-pointer">
              Switch
            </button>
          </div>

          {/* Suggestions Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-zinc-400">Suggested for you</span>
              <button className="text-zinc-200 hover:text-white cursor-pointer">
                See All
              </button>
            </div>

            {/* Suggested List */}
            <div className="space-y-3">
              {suggested.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={item.avatar}
                      alt={item.username}
                      className="w-9 h-9 rounded-full object-cover border border-[#262A30]"
                    />
                    <div>
                      <p className="text-xs font-semibold text-white hover:underline cursor-pointer">
                        {item.username}
                      </p>
                      <p className="text-[10px] text-zinc-400 max-w-[170px] truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleSuggestedFollow(item.username)}
                    className={`text-xs font-semibold cursor-pointer ${
                      item.isFollowing
                        ? "text-zinc-400 hover:text-white"
                        : "text-[#0095F6] hover:text-[#1877F2]"
                    }`}
                  >
                    {item.isFollowing ? "Following" : "Follow"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Official Instagram Desktop Footer */}
          <footer className="text-[10px] text-zinc-500 space-y-3 pt-3 border-t border-[#262A30]/60">
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <a href="#about" className="hover:underline">About</a>
              <span>•</span>
              <a href="#help" className="hover:underline">Help</a>
              <span>•</span>
              <a href="#press" className="hover:underline">Press</a>
              <span>•</span>
              <a href="#api" className="hover:underline">API</a>
              <span>•</span>
              <a href="#jobs" className="hover:underline">Jobs</a>
              <span>•</span>
              <a href="#privacy" className="hover:underline">Privacy</a>
              <span>•</span>
              <a href="#terms" className="hover:underline">Terms</a>
              <span>•</span>
              <a href="#locations" className="hover:underline">Locations</a>
              <span>•</span>
              <a href="#language" className="hover:underline">Language</a>
            </div>
            <p className="text-[11px] text-zinc-500">
              © 2026 INSTAGRAM FROM META • WAITPLAY COMPANION
            </p>
          </footer>
        </aside>
      </div>
    </div>
  );
};
