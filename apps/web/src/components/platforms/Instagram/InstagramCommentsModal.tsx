import React, { useState } from 'react';
import { X, Heart, Smile } from 'lucide-react';

export interface CommentItem {
  id: string;
  username: string;
  avatarText: string;
  avatarBg: string;
  text: string;
  timeAgo: string;
  likes: number;
  isLiked?: boolean;
}

interface InstagramCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  postAuthor: string;
  postCaption: string;
  comments: CommentItem[];
  onAddComment: (text: string) => void;
}

export const InstagramCommentsModal: React.FC<InstagramCommentsModalProps> = ({
  isOpen,
  onClose,
  postAuthor,
  postCaption,
  comments,
  onAddComment,
}) => {
  const [inputText, setInputText] = useState('');
  const [localComments, setLocalComments] = useState(comments);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newComment: CommentItem = {
      id: Date.now().toString(),
      username: 'you',
      avatarText: 'ME',
      avatarBg: '#0095F6',
      text: inputText.trim(),
      timeAgo: 'Just now',
      likes: 0,
      isLiked: false,
    };

    setLocalComments([newComment, ...localComments]);
    onAddComment(inputText.trim());
    setInputText('');
  };

  const toggleCommentLike = (id: string) => {
    setLocalComments((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const liked = !c.isLiked;
          return { ...c, isLiked: liked, likes: c.likes + (liked ? 1 : -1) };
        }
        return c;
      })
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#14181E] border border-[#262B34] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#262B34] flex items-center justify-between">
          <span className="text-sm font-bold">Comments</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Original Post Context */}
        <div className="p-4 border-b border-[#262B34] flex items-start gap-3 bg-[#0C0F12]/40">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {postAuthor.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-xs leading-relaxed">
            <span className="font-bold mr-2 text-white">{postAuthor}</span>
            <span className="text-zinc-300">{postCaption}</span>
          </div>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {localComments.map((comment) => (
            <div key={comment.id} className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: comment.avatarBg }}
                >
                  {comment.avatarText}
                </div>
                <div>
                  <div className="text-xs">
                    <span className="font-semibold text-white mr-2">{comment.username}</span>
                    <span className="text-zinc-300">{comment.text}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
                    <span>{comment.timeAgo}</span>
                    {comment.likes > 0 && <span>{comment.likes} {comment.likes === 1 ? 'like' : 'likes'}</span>}
                    <button className="font-semibold hover:text-zinc-300 transition-colors">Reply</button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => toggleCommentLike(comment.id)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Heart
                  size={14}
                  className={comment.isLiked ? 'fill-red-500 text-red-500' : 'text-zinc-500'}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-[#262B34] flex items-center gap-2 bg-[#12161D]">
          <button type="button" className="text-zinc-400 hover:text-zinc-200 p-1">
            <Smile size={20} />
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="text-xs font-bold text-[#0095F6] disabled:opacity-40 hover:text-blue-400 transition-colors cursor-pointer"
          >
            Post
          </button>
        </form>
      </div>
    </div>
  );
};
