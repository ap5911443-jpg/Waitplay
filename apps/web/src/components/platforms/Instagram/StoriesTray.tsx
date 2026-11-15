import React, { useRef, useState } from "react";
import { STORIES, getUser, avatar, CURRENT_USER } from "./data";
import { ChevronLeft, ChevronRight } from "./Icons";

interface StoriesTrayProps {
  onOpenStory: (userId: string) => void;
}

export const StoriesTray: React.FC<StoriesTrayProps> = ({ onOpenStory }) => {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  const scrollBy = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  return (
    <div className="relative w-full max-w-[470px] mx-auto mb-4">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex gap-4 overflow-x-auto py-3 px-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] scroll-smooth"
      >
        {STORIES.map((story) => {
          const user = getUser(story.userId);
          const isYou = story.userId === CURRENT_USER.id;
          return (
            <button key={story.id} onClick={() => onOpenStory(story.userId)} className="flex flex-col items-center gap-1 shrink-0 w-[66px]">
              <span
                className={`relative block w-[62px] h-[62px] rounded-full p-[2.5px] ${
                  story.seen
                    ? "bg-[#dbdbdb]"
                    : "bg-[linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)]"
                }`}
              >
                <img src={avatar(user.avatarSeed)} alt={user.username} className="w-full h-full rounded-full object-cover border-2 border-white" />
                {isYou && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#0095f6] border-2 border-white text-white flex items-center justify-center text-[14px] leading-none">
                    +
                  </span>
                )}
              </span>
              <span className="text-[12px] text-[#262626] truncate w-full text-center">
                {isYou ? "Your story" : user.username}
              </span>
            </button>
          );
        })}
      </div>

      {!atStart && (
        <button onClick={() => scrollBy(-1)} className="absolute left-0 top-[30px] w-6 h-6 rounded-full bg-white shadow-md border border-[#dbdbdb] flex items-center justify-center text-[#262626]">
          <ChevronLeft size={16} />
        </button>
      )}
      {!atEnd && (
        <button onClick={() => scrollBy(1)} className="absolute right-0 top-[30px] w-6 h-6 rounded-full bg-white shadow-md border border-[#dbdbdb] flex items-center justify-center text-[#262626]">
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
};

export default StoriesTray;
