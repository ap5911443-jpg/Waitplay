import React, { useState, useRef } from "react";
import { Post, getUser, avatar, formatCount } from "./data";
import { useInstagram } from "./store";
import {
  LikeIcon,
  CommentIcon,
  ShareIcon,
  SaveIcon,
  MoreIcon,
  VerifiedIcon,
  ChevronLeft,
  ChevronRight,
} from "./Icons";

interface PostCardProps {
  post: Post;
  onOpenPost: (id: string) => void;
  onOpenProfile: (id: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onOpenPost, onOpenProfile }) => {
  const user = getUser(post.userId);
  const { likedPosts, savedPosts, following, commentsByPost, toggleLike, toggleSave, toggleFollow, addComment, likeCount } =
    useInstagram();

  const liked = likedPosts.has(post.id);
  const saved = savedPosts.has(post.id);
  const isFollowing = following.has(post.userId);
  const comments = commentsByPost[post.id] ?? post.comments;

  const [idx, setIdx] = useState(0);
  const [showHeart, setShowHeart] = useState(false);
  const [draft, setDraft] = useState("");
  const lastTap = useRef(0);

  const handleDouble = () => {
    if (!liked) toggleLike(post.id, post.likes);
    setShowHeart(true);
    window.setTimeout(() => setShowHeart(false), 900);
  };

  const handleImageClick = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) handleDouble();
    lastTap.current = now;
  };

  const submit = () => {
    addComment(post.id, draft);
    setDraft("");
  };

  return (
    <article className="w-full max-w-[470px] mx-auto border-b border-[#dbdbdb] pb-4 mb-3 bg-white">
      {/* Header */}
      <header className="flex items-center gap-3 py-3">
        <button onClick={() => onOpenProfile(post.userId)} className="shrink-0">
          <span className="block w-8 h-8 rounded-full p-[2px] bg-[linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)]">
            <img src={avatar(user.avatarSeed)} alt={user.username} className="w-full h-full rounded-full object-cover border-2 border-white" />
          </span>
        </button>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="flex items-center gap-1 text-[14px]">
            <button onClick={() => onOpenProfile(post.userId)} className="font-semibold text-[#262626] hover:opacity-60">
              {user.username}
            </button>
            {user.verified && <VerifiedIcon size={12} />}
            {post.location && <span className="text-[#262626]">•</span>}
            {!isFollowing && (
              <>
                <span className="text-[#262626]">•</span>
                <button onClick={() => toggleFollow(post.userId)} className="text-[#0095f6] font-semibold text-[14px] hover:text-[#00376b]">
                  Follow
                </button>
              </>
            )}
          </div>
          {post.location && <div className="text-[12px] text-[#262626]">{post.location}</div>}
        </div>
        {post.sponsored && <span className="text-[12px] text-[#8e8e8e] mr-1">Sponsored</span>}
        <button className="text-[#262626] p-1"><MoreIcon /></button>
      </header>

      {/* Media */}
      <div className="relative w-full aspect-square bg-black rounded-sm overflow-hidden select-none" onClick={handleImageClick}>
        <img src={post.images[idx]} alt="" className="w-full h-full object-cover" draggable={false} />

        {post.images.length > 1 && (
          <>
            {idx > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setIdx((i) => i - 1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/70 hover:bg-white text-[#262626] flex items-center justify-center shadow"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {idx < post.images.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setIdx((i) => i + 1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/70 hover:bg-white text-[#262626] flex items-center justify-center shadow"
              >
                <ChevronRight size={18} />
              </button>
            )}
            <div className="absolute top-3 right-3 bg-black/60 text-white text-[12px] font-medium px-2 py-0.5 rounded-full">
              {idx + 1}/{post.images.length}
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
              {post.images.map((_, i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === idx ? "bg-[#0095f6]" : "bg-white/60"}`} />
              ))}
            </div>
          </>
        )}

        {showHeart && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-white drop-shadow-lg animate-[ig-pop_0.9s_ease]">
              <LikeIcon filled size={96} className="text-white" />
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center pt-3 pb-1">
        <div className="flex items-center gap-4 flex-1">
          <button onClick={() => toggleLike(post.id, post.likes)} className={`transition-transform active:scale-90 ${liked ? "text-[#ed4956]" : "text-[#262626] hover:opacity-60"}`}>
            <LikeIcon filled={liked} size={26} />
          </button>
          <button onClick={() => onOpenPost(post.id)} className="text-[#262626] hover:opacity-60"><CommentIcon size={26} /></button>
          <button className="text-[#262626] hover:opacity-60"><ShareIcon size={26} /></button>
        </div>
        <button onClick={() => toggleSave(post.id)} className={`${saved ? "text-[#262626]" : "text-[#262626] hover:opacity-60"}`}>
          <SaveIcon filled={saved} size={26} />
        </button>
      </div>

      {/* Likes */}
      <div className="text-[14px] font-semibold text-[#262626]">{formatCount(likeCount(post.id, post.likes))} likes</div>

      {/* Caption */}
      <div className="text-[14px] text-[#262626] mt-1">
        <button onClick={() => onOpenProfile(post.userId)} className="font-semibold mr-1.5 hover:opacity-60">{user.username}</button>
        <span className="whitespace-pre-line">{post.caption}</span>
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <button onClick={() => onOpenPost(post.id)} className="block text-[14px] text-[#8e8e8e] mt-1 hover:opacity-70">
          View all {comments.length} comments
        </button>
      )}
      {comments.slice(-2).map((c) => {
        const cu = getUser(c.userId);
        return (
          <div key={c.id} className="text-[14px] text-[#262626] mt-0.5">
            <span className="font-semibold mr-1.5">{cu.username}</span>
            <span>{c.text}</span>
          </div>
        );
      })}

      {/* Time */}
      <div className="text-[10px] uppercase tracking-wide text-[#8e8e8e] mt-1.5">{post.time}</div>

      {/* Add comment */}
      <div className="flex items-center gap-2 mt-2 border-t border-[#efefef] pt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Add a comment..."
          className="flex-1 text-[14px] bg-transparent outline-none placeholder:text-[#8e8e8e] text-[#262626]"
        />
        {draft.trim() && (
          <button onClick={submit} className="text-[#0095f6] font-semibold text-[14px] hover:text-[#00376b]">Post</button>
        )}
      </div>
    </article>
  );
};

export default PostCard;
