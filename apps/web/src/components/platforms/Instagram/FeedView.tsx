import React from "react";
import { POSTS } from "./data";
import { StoriesTray } from "./StoriesTray";
import { PostCard } from "./PostCard";
import { RightSidebar } from "./RightSidebar";

interface FeedViewProps {
  onOpenPost: (id: string) => void;
  onOpenStory: (userId: string) => void;
  onOpenProfile: (id: string) => void;
}

export const FeedView: React.FC<FeedViewProps> = ({ onOpenPost, onOpenStory, onOpenProfile }) => {
  return (
    <div className="w-full flex justify-center gap-8 px-4 pt-6 pb-16">
      {/* Feed column */}
      <div className="w-full max-w-[470px]">
        <StoriesTray onOpenStory={onOpenStory} />
        {POSTS.map((post) => (
          <PostCard key={post.id} post={post} onOpenPost={onOpenPost} onOpenProfile={onOpenProfile} />
        ))}
        <div className="text-center text-[13px] text-[#8e8e8e] py-10">
          <div className="w-10 h-10 rounded-full border border-[#dbdbdb] mx-auto mb-3 flex items-center justify-center">✓</div>
          You're all caught up
        </div>
      </div>

      {/* Right rail */}
      <RightSidebar onOpenProfile={onOpenProfile} />
    </div>
  );
};

export default FeedView;
