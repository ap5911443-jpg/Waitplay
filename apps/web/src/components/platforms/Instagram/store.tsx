import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Comment, POSTS } from "./data";

// Shared interaction state for the Instagram clone: likes, saves, follows,
// comment threads, and like counts — so every surface stays in sync.

interface InstagramState {
  likedPosts: Set<string>;
  savedPosts: Set<string>;
  following: Set<string>;
  likedReels: Set<string>;
  commentsByPost: Record<string, Comment[]>;
  likeCountByPost: Record<string, number>;
  toggleLike: (postId: string, baseLikes: number) => void;
  toggleSave: (postId: string) => void;
  toggleFollow: (userId: string) => void;
  toggleReelLike: (reelId: string) => void;
  addComment: (postId: string, text: string) => void;
  likeCount: (postId: string, baseLikes: number) => number;
}

const InstagramContext = createContext<InstagramState | null>(null);

export const InstagramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set(["karpathy", "natgeo", "nasa", "figma"]));
  const [likedReels, setLikedReels] = useState<Set<string>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>(() => {
    const seed: Record<string, Comment[]> = {};
    for (const p of POSTS) seed[p.id] = [...p.comments];
    return seed;
  });
  const [likeDelta, setLikeDelta] = useState<Record<string, number>>({});

  const toggleLike = useCallback((postId: string, _baseLikes: number) => {
    setLikedPosts((prev) => {
      const next = new Set(prev);
      const nowLiked = !next.has(postId);
      if (nowLiked) next.add(postId);
      else next.delete(postId);
      setLikeDelta((d) => ({ ...d, [postId]: (d[postId] ?? 0) + (nowLiked ? 1 : -1) }));
      return next;
    });
  }, []);

  const toggleSave = useCallback((postId: string) => {
    setSavedPosts((prev) => {
      const next = new Set(prev);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  }, []);

  const toggleFollow = useCallback((userId: string) => {
    setFollowing((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }, []);

  const toggleReelLike = useCallback((reelId: string) => {
    setLikedReels((prev) => {
      const next = new Set(prev);
      next.has(reelId) ? next.delete(reelId) : next.add(reelId);
      return next;
    });
  }, []);

  const addComment = useCallback((postId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const c: Comment = {
      id: `c-${Date.now()}`,
      userId: "you",
      text: trimmed,
      time: "now",
      likes: 0,
    };
    setCommentsByPost((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), c] }));
  }, []);

  const likeCount = useCallback(
    (postId: string, baseLikes: number) => baseLikes + (likeDelta[postId] ?? 0),
    [likeDelta]
  );

  const value = useMemo<InstagramState>(
    () => ({
      likedPosts,
      savedPosts,
      following,
      likedReels,
      commentsByPost,
      likeCountByPost: {},
      toggleLike,
      toggleSave,
      toggleFollow,
      toggleReelLike,
      addComment,
      likeCount,
    }),
    [likedPosts, savedPosts, following, likedReels, commentsByPost, toggleLike, toggleSave, toggleFollow, toggleReelLike, addComment, likeCount]
  );

  return <InstagramContext.Provider value={value}>{children}</InstagramContext.Provider>;
};

export function useInstagram(): InstagramState {
  const ctx = useContext(InstagramContext);
  if (!ctx) throw new Error("useInstagram must be used within InstagramProvider");
  return ctx;
}
