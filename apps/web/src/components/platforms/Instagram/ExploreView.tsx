import React from "react";
import { EXPLORE, POSTS } from "./data";
import { CarouselIcon, PlayIcon, HeartSolidIcon, CommentIcon } from "./Icons";

export const ExploreView: React.FC<{
  onOpenPost: (id: string) => void;
  onOpenProfile?: (id: string) => void;
}> = ({ onOpenPost }) => {
  return (
    <div className="mx-auto max-w-[935px] py-6 select-none">
      <div className="grid grid-cols-3 gap-1 grid-flow-dense">
        {EXPLORE.map((item, i) => {
          const postId = POSTS[i % POSTS.length].id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenPost(postId)}
              className={`group relative block aspect-square overflow-hidden bg-[#efefef] cursor-pointer ${
                item.tall ? "row-span-2 aspect-auto" : ""
              }`}
            >
              <img
                src={item.image}
                alt=""
                loading="lazy"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />

              {item.type === "carousel" && (
                <span className="absolute right-2 top-2 text-white drop-shadow">
                  <CarouselIcon size={18} />
                </span>
              )}
              {item.type === "video" && (
                <span className="absolute right-2 top-2 text-white drop-shadow">
                  <PlayIcon size={18} />
                </span>
              )}

              <div className="absolute inset-0 flex items-center justify-center gap-5 bg-black/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <span className="flex items-center gap-1.5 font-bold text-white">
                  <HeartSolidIcon size={19} className="text-white" />
                  {item.likes}
                </span>
                <span className="flex items-center gap-1.5 font-bold text-white">
                  <CommentIcon size={19} className="text-white" />
                  {item.comments}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ExploreView;
