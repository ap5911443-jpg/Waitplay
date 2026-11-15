import React, { useState } from "react";
import { avatar, photo, getUser, POSTS, EXPLORE, CURRENT_USER } from "./data";
import { useInstagram } from "./store";
import { VerifiedIcon, MoreIcon, GridIcon, ReelsIcon, TaggedIcon, HeartSolidIcon, CommentIcon } from "./Icons";

type Tab = "posts" | "reels" | "tagged";

interface Tile {
  image: string;
  postId: string;
  likes: string;
  comments: string;
}

const HIGHLIGHTS = ["Travel", "Food", "Work", "2024", "Pets"];

export const ProfileView: React.FC<{
  userId: string;
  onOpenPost: (id: string) => void;
  onBack?: () => void;
}> = ({ userId, onOpenPost }) => {
  const user = getUser(userId);
  const { following, toggleFollow } = useInstagram();
  const [activeTab, setActiveTab] = useState<Tab>("posts");

  const isSelf = user.id === CURRENT_USER.id;
  const isFollowing = following.has(user.id);

  // Build ~12 tiles: posts first, then explore imagery to fill.
  const tiles: Tile[] = [];
  for (let i = 0; i < 12; i++) {
    const post = POSTS[i % POSTS.length];
    if (i < POSTS.length) {
      tiles.push({
        image: post.images[0],
        postId: post.id,
        likes: formatCompact(post.likes),
        comments: String(post.comments.length),
      });
    } else {
      const ex = EXPLORE[i % EXPLORE.length];
      tiles.push({
        image: ex.image,
        postId: POSTS[i % POSTS.length].id,
        likes: ex.likes,
        comments: ex.comments,
      });
    }
  }

  const tabs: { key: Tab; label: string; Icon: React.FC<{ size?: number; className?: string }> }[] = [
    { key: "posts", label: "Posts", Icon: GridIcon },
    { key: "reels", label: "Reels", Icon: ReelsIcon },
    { key: "tagged", label: "Tagged", Icon: TaggedIcon },
  ];

  return (
    <div className="mx-auto max-w-[935px] px-4 py-8 text-[#262626] select-none">
      {/* Header */}
      <header className="flex items-start">
        <div className="mr-8 flex shrink-0 justify-center md:mr-24 md:ml-8">
          <img
            src={avatar(user.avatarSeed)}
            alt={user.username}
            className="h-[150px] w-[150px] rounded-full object-cover"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5 pt-2">
          {/* Row 1: username + actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-normal">{user.username}</span>
              {user.verified && <VerifiedIcon size={18} className="text-[#0095f6]" />}
            </div>

            {isSelf ? (
              <>
                <button className="rounded-lg bg-[#efefef] px-4 py-1.5 text-[14px] font-semibold text-[#262626] transition-colors hover:bg-[#dbdbdb] cursor-pointer">
                  Edit profile
                </button>
                <button className="rounded-lg bg-[#efefef] px-4 py-1.5 text-[14px] font-semibold text-[#262626] transition-colors hover:bg-[#dbdbdb] cursor-pointer">
                  View archive
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => toggleFollow(user.id)}
                  className={
                    isFollowing
                      ? "rounded-lg bg-[#efefef] px-6 py-1.5 text-[14px] font-semibold text-[#262626] transition-colors hover:bg-[#dbdbdb] cursor-pointer"
                      : "rounded-lg bg-[#0095f6] px-6 py-1.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#1877f2] cursor-pointer"
                  }
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
                <button className="rounded-lg bg-[#efefef] px-4 py-1.5 text-[14px] font-semibold text-[#262626] transition-colors hover:bg-[#dbdbdb] cursor-pointer">
                  Message
                </button>
                <button className="rounded-lg p-1.5 text-[#262626] transition-colors hover:bg-[#f2f2f2] cursor-pointer">
                  <MoreIcon size={20} />
                </button>
              </>
            )}
          </div>

          {/* Row 2: stats */}
          <div className="flex items-center gap-10 text-[16px]">
            <span>
              <span className="font-semibold">{user.postsCount ?? "0"}</span> posts
            </span>
            <span>
              <span className="font-semibold">{user.followers ?? "0"}</span> followers
            </span>
            <span>
              <span className="font-semibold">{user.following ?? "0"}</span> following
            </span>
          </div>

          {/* Row 3: name */}
          <div className="text-[14px] font-semibold">{user.name}</div>

          {/* Row 4: bio */}
          {user.bio && <div className="whitespace-pre-line text-[14px] leading-tight">{user.bio}</div>}
        </div>
      </header>

      {/* Highlights */}
      <div className="mt-10 flex gap-10 overflow-x-auto pb-2">
        {HIGHLIGHTS.map((label, i) => (
          <button key={label} className="flex shrink-0 flex-col items-center gap-2 cursor-pointer">
            <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full border border-[#dbdbdb] p-[3px]">
              <img
                src={photo("hl-" + i, 160, 160)}
                alt={label}
                className="h-full w-full rounded-full object-cover"
              />
            </span>
            <span className="text-[12px] font-medium text-[#262626]">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab bar */}
      <nav className="mt-6 flex items-center justify-center border-t border-[#dbdbdb]">
        {tabs.map(({ key, label, Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={
                "-mt-px flex items-center gap-1.5 px-4 py-4 text-[12px] font-semibold uppercase tracking-wide transition-colors cursor-pointer " +
                (active
                  ? "border-t border-[#262626] text-[#262626]"
                  : "border-t border-transparent text-[#8e8e8e]")
              }
            >
              <Icon size={12} className={active ? "text-[#262626]" : "text-[#8e8e8e]"} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-1">
        {tiles.map((tile, i) => (
          <button
            key={i}
            onClick={() => onOpenPost(tile.postId)}
            className="group relative aspect-square overflow-hidden bg-[#efefef] cursor-pointer"
          >
            <img src={tile.image} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-6 bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-white">
                <HeartSolidIcon size={19} className="text-white" />
                {tile.likes}
              </span>
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-white">
                <CommentIcon size={19} className="text-white" />
                {tile.comments}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export default ProfileView;
