import React from "react";
import { CURRENT_USER, SUGGESTIONS, getUser, avatar } from "./data";
import { useInstagram } from "./store";
import { VerifiedIcon } from "./Icons";

interface RightSidebarProps {
  onOpenProfile: (id: string) => void;
}

const FOOTER_LINKS = [
  "About", "Help", "Press", "API", "Jobs", "Privacy", "Terms", "Locations", "Language", "Meta Verified",
];

export const RightSidebar: React.FC<RightSidebarProps> = ({ onOpenProfile }) => {
  const { following, toggleFollow } = useInstagram();

  return (
    <aside className="hidden lg:block w-[319px] shrink-0 pl-16 pt-9">
      {/* Current user */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => onOpenProfile(CURRENT_USER.id)}>
          <img src={avatar(CURRENT_USER.avatarSeed)} alt="" className="w-11 h-11 rounded-full object-cover" />
        </button>
        <div className="flex-1 min-w-0 leading-tight">
          <button onClick={() => onOpenProfile(CURRENT_USER.id)} className="block font-semibold text-[14px] text-[#262626] truncate hover:opacity-70">
            {CURRENT_USER.username}
          </button>
          <div className="text-[14px] text-[#8e8e8e] truncate">{CURRENT_USER.name}</div>
        </div>
        <button className="text-[12px] font-semibold text-[#0095f6] hover:text-[#00376b]">Switch</button>
      </div>

      {/* Suggestions header */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[14px] font-semibold text-[#8e8e8e]">Suggested for you</span>
        <button className="text-[12px] font-semibold text-[#262626] hover:opacity-70">See All</button>
      </div>

      {/* Suggestions list */}
      <div className="flex flex-col gap-2.5">
        {SUGGESTIONS.map(({ userId, reason }) => {
          const user = getUser(userId);
          const isFollowing = following.has(userId);
          return (
            <div key={userId} className="flex items-center gap-3">
              <button onClick={() => onOpenProfile(userId)}>
                <img src={avatar(user.avatarSeed)} alt="" className="w-8 h-8 rounded-full object-cover" />
              </button>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="flex items-center gap-1">
                  <button onClick={() => onOpenProfile(userId)} className="font-semibold text-[13px] text-[#262626] truncate hover:opacity-70">
                    {user.username}
                  </button>
                  {user.verified && <VerifiedIcon size={11} />}
                </div>
                <div className="text-[12px] text-[#8e8e8e] truncate">{reason}</div>
              </div>
              <button
                onClick={() => toggleFollow(userId)}
                className={`text-[12px] font-semibold ${isFollowing ? "text-[#262626] hover:opacity-70" : "text-[#0095f6] hover:text-[#00376b]"}`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-6 text-[11px] text-[#c7c7c7] leading-5">
        <div className="flex flex-wrap gap-x-1">
          {FOOTER_LINKS.map((l, i) => (
            <React.Fragment key={l}>
              <button className="hover:underline">{l}</button>
              {i < FOOTER_LINKS.length - 1 && <span>·</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 uppercase">© 2026 Instagram from Meta</div>
      </div>
    </aside>
  );
};

export default RightSidebar;
