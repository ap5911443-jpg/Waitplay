import React, { useState } from "react";
import { POSTS, USERS, getUser, formatCount, avatar } from "./data";
import { useInstagram } from "./store";
import {
  CloseIcon,
  ChevronLeft,
  ChevronRight,
  LikeIcon,
  CommentIcon,
  ShareIcon,
  SaveIcon,
  MoreIcon,
  VerifiedIcon,
  SearchIcon,
} from "./Icons";

export const PostModal: React.FC<{
  postId: string;
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
}> = ({ postId, onClose, onOpenProfile }) => {
  const {
    commentsByPost,
    likedPosts,
    savedPosts,
    toggleLike,
    toggleSave,
    addComment,
    likeCount,
  } = useInstagram();
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [heart, setHeart] = useState(false);

  const post = POSTS.find((p) => p.id === postId);
  if (!post) return null;

  const author = getUser(post.userId);
  const comments = commentsByPost[postId] ?? [];
  const liked = likedPosts.has(postId);
  const saved = savedPosts.has(postId);
  const count = likeCount(postId, post.likes);

  const prev = () => setIdx((i) => (i > 0 ? i - 1 : i));
  const next = () => setIdx((i) => (i < post.images.length - 1 ? i + 1 : i));

  const doLike = () => {
    if (!liked) toggleLike(postId, post.likes);
  };
  const onDoubleClick = () => {
    doLike();
    setHeart(true);
    window.setTimeout(() => setHeart(false), 800);
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    addComment(postId, t);
    setText("");
  };

  const openProfile = (id: string) => {
    onOpenProfile?.(id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white p-1"
        onClick={onClose}
        aria-label="Close"
      >
        <CloseIcon size={28} />
      </button>

      <div
        className="bg-white rounded max-h-[90vh] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT: media */}
        <div className="relative bg-black flex items-center justify-center w-[min(60vh,600px)] aspect-square select-none">
          <img
            src={post.images[idx]}
            alt=""
            className="w-full h-full object-contain"
            onDoubleClick={onDoubleClick}
            draggable={false}
          />

          {heart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="animate-[ping_0.7s_ease-out_1]">
                <LikeIcon size={90} filled className="text-white drop-shadow-lg" />
              </span>
            </div>
          )}

          {post.images.length > 1 && (
            <>
              {idx > 0 && (
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-7 h-7 flex items-center justify-center text-gray-800 shadow"
                  onClick={prev}
                  aria-label="Previous"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              {idx < post.images.length - 1 && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-7 h-7 flex items-center justify-center text-gray-800 shadow"
                  onClick={next}
                  aria-label="Next"
                >
                  <ChevronRight size={18} />
                </button>
              )}
              <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
                {post.images.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${
                      i === idx ? "bg-[#0095f6]" : "bg-white/60"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: thread */}
        <div className="w-[405px] flex flex-col">
          {/* header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#dbdbdb]">
            <img
              src={avatar(author.avatarSeed)}
              alt=""
              className="w-8 h-8 rounded-full object-cover cursor-pointer"
              onClick={() => openProfile(author.id)}
            />
            <div className="flex-1 min-w-0 leading-tight">
              <div className="flex items-center gap-1">
                <button
                  className="text-sm font-semibold hover:opacity-60"
                  onClick={() => openProfile(author.id)}
                >
                  {author.username}
                </button>
                {author.verified && (
                  <VerifiedIcon size={12} className="text-[#0095f6]" />
                )}
              </div>
              {post.location && (
                <div className="text-xs text-gray-900">{post.location}</div>
              )}
            </div>
            <button className="text-gray-900" aria-label="More options">
              <MoreIcon size={20} />
            </button>
          </div>

          {/* thread */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* caption as first row */}
            <div className="flex gap-3">
              <img
                src={avatar(author.avatarSeed)}
                alt=""
                className="w-8 h-8 rounded-full object-cover flex-shrink-0 cursor-pointer"
                onClick={() => openProfile(author.id)}
              />
              <div className="min-w-0 text-sm">
                <span>
                  <button
                    className="font-semibold mr-1.5 hover:opacity-60"
                    onClick={() => openProfile(author.id)}
                  >
                    {author.username}
                  </button>
                  {post.caption}
                </span>
                <div className="mt-1 text-xs text-gray-500">{post.timeShort}</div>
              </div>
            </div>

            {comments.map((c) => {
              const u = getUser(c.userId);
              return (
                <div key={c.id} className="flex gap-3">
                  <img
                    src={avatar(u.avatarSeed)}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 cursor-pointer"
                    onClick={() => openProfile(u.id)}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <span>
                      <button
                        className="font-semibold mr-1.5 hover:opacity-60"
                        onClick={() => openProfile(u.id)}
                      >
                        {u.username}
                      </button>
                      {c.text}
                    </span>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span>{c.time}</span>
                      {c.likes > 0 && (
                        <span className="font-semibold">
                          {formatCount(c.likes)} likes
                        </span>
                      )}
                      <button className="font-semibold hover:text-gray-700">
                        Reply
                      </button>
                    </div>
                  </div>
                  <button
                    className="text-gray-400 hover:text-gray-700 mt-1"
                    aria-label="Like comment"
                  >
                    <LikeIcon size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* action bar */}
          <div className="border-t border-[#dbdbdb] px-4 pt-3">
            <div className="flex items-center gap-4">
              <button onClick={doLike} aria-label="Like">
                <LikeIcon
                  size={24}
                  filled={liked}
                  className={liked ? "text-[#ed4956]" : "text-gray-900 hover:text-gray-500"}
                />
              </button>
              <button aria-label="Comment">
                <CommentIcon size={24} className="text-gray-900 hover:text-gray-500" />
              </button>
              <button aria-label="Share">
                <ShareIcon size={24} className="text-gray-900 hover:text-gray-500" />
              </button>
              <button
                className="ml-auto"
                onClick={() => toggleSave(postId)}
                aria-label="Save"
              >
                <SaveIcon
                  size={24}
                  filled={saved}
                  className="text-gray-900 hover:text-gray-500"
                />
              </button>
            </div>

            <div className="mt-2 text-sm font-semibold">
              {formatCount(count)} likes
            </div>
            <div className="mt-1 mb-2 text-[10px] uppercase tracking-wide text-gray-500">
              {post.time}
            </div>
          </div>

          {/* add comment */}
          <div className="flex items-center gap-2 border-t border-[#dbdbdb] px-4 py-2">
            <button className="text-xl leading-none" aria-label="Emoji">
              😊
            </button>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="Add a comment..."
              className="flex-1 text-sm outline-none bg-transparent placeholder-gray-500"
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              className={`text-sm font-semibold ${
                text.trim()
                  ? "text-[#0095f6] hover:text-[#00376b]"
                  : "text-[#0095f6]/40 cursor-default"
              }`}
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SearchPanel: React.FC<{
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
}> = ({ onClose, onOpenProfile }) => {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const users = Object.values(USERS).filter((u) => {
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    );
  });

  const open = (id: string) => {
    onOpenProfile?.(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[397px] h-full bg-white border-r border-[#dbdbdb] rounded-r-2xl shadow-xl flex flex-col">
        <div className="px-6 pt-6 pb-5 border-b border-[#dbdbdb]">
          <h2 className="text-2xl font-semibold mb-6">Search</h2>
          <div className="flex items-center gap-2 bg-[#efefef] rounded-lg px-3 py-2">
            <SearchIcon size={16} className="text-gray-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="flex-1 bg-transparent text-sm outline-none placeholder-gray-500"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Clear"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-3">
          <span className="text-sm font-semibold">Recent</span>
          <button className="text-sm font-semibold text-[#0095f6] hover:text-[#00376b]">
            Clear all
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {users.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              No results found.
            </div>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => open(u.id)}
                className="w-full flex items-center gap-3 px-6 py-2 hover:bg-[#fafafa] text-left"
              >
                <img
                  src={avatar(u.avatarSeed)}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover"
                />
                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold truncate">
                      {u.username}
                    </span>
                    {u.verified && (
                      <VerifiedIcon size={12} className="text-[#0095f6]" />
                    )}
                  </div>
                  <div className="text-sm text-gray-500 truncate">{u.name}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
