import React, { useState } from "react";
import {
  Home,
  Film,
  Compass,
  MessageCircle,
  Heart,
  PlusSquare,
  Search,
  User,
  Menu,
} from "lucide-react";
import { InstagramFeed, Story, INITIAL_STORIES } from "./InstagramFeed";
import { InstagramReelsView } from "./InstagramReelsView";
import { InstagramStoryModal } from "./InstagramStoryModal";

interface InstagramContainerProps {
  onClose?: () => void;
}

export const InstagramContainer: React.FC<InstagramContainerProps> = ({ onClose }) => {
  const [currentTab, setCurrentTab] = useState<"feed" | "reels">("feed");
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);

  const handleOpenStory = (story: Story) => {
    const idx = INITIAL_STORIES.findIndex((s) => s.id === story.id);
    setStoryIndex(idx >= 0 ? idx : 0);
    setActiveStory(story);
  };

  const handleNextStory = () => {
    if (storyIndex < INITIAL_STORIES.length - 1) {
      const nextIdx = storyIndex + 1;
      setStoryIndex(nextIdx);
      setActiveStory(INITIAL_STORIES[nextIdx]);
    } else {
      setActiveStory(null);
    }
  };

  const handlePrevStory = () => {
    if (storyIndex > 0) {
      const prevIdx = storyIndex - 1;
      setStoryIndex(prevIdx);
      setActiveStory(INITIAL_STORIES[prevIdx]);
    }
  };

  return (
    <div className="w-full h-full flex bg-[#0C0F12] text-[#F5F5F5] overflow-hidden select-none font-sans">
      {/* Left Navigation Rail (Standard Instagram Desktop Web Sidebar) */}
      <aside className="w-16 xl:w-60 border-r border-[#262A30] p-3 xl:p-5 flex flex-col justify-between shrink-0 bg-[#0C0F12] z-30 transition-all">
        <div className="space-y-7">
          {/* Logo / Brand Header */}
          <div className="pt-2 px-2 cursor-pointer" onClick={() => setCurrentTab("feed")}>
            {/* Desktop Full Logo */}
            <h1 className="hidden xl:block text-2xl font-black tracking-tight text-white font-serif">
              Instagram
            </h1>
            {/* Mobile/Compact Icon */}
            <div className="xl:hidden w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FBAA47] via-[#D91A46] to-[#A60F93] flex items-center justify-center text-white shadow-md mx-auto">
              <span className="font-extrabold text-sm">IG</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setCurrentTab("feed")}
              className={`w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                currentTab === "feed"
                  ? "bg-[#1A1F26] text-white"
                  : "text-zinc-300 hover:bg-[#161A20] hover:text-white"
              }`}
            >
              <Home className={`w-6 h-6 shrink-0 ${currentTab === "feed" ? "stroke-[2.5]" : ""}`} />
              <span className="hidden xl:inline">Home</span>
            </button>

            <button
              onClick={() => setCurrentTab("reels")}
              title="Reels"
              aria-label="Reels"
              className={`w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                currentTab === "reels"
                  ? "bg-[#1A1F26] text-white"
                  : "text-zinc-300 hover:bg-[#161A20] hover:text-white"
              }`}
            >
              <Film className={`w-6 h-6 shrink-0 ${currentTab === "reels" ? "stroke-[2.5]" : ""}`} />
              <span className="hidden xl:inline">Reels</span>
            </button>

            <button className="w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-[#161A20] hover:text-white transition-colors cursor-pointer">
              <Search className="w-6 h-6 shrink-0" />
              <span className="hidden xl:inline">Search</span>
            </button>

            <button className="w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-[#161A20] hover:text-white transition-colors cursor-pointer">
              <Compass className="w-6 h-6 shrink-0" />
              <span className="hidden xl:inline">Explore</span>
            </button>

            <button className="w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-[#161A20] hover:text-white transition-colors cursor-pointer">
              <MessageCircle className="w-6 h-6 shrink-0" />
              <span className="hidden xl:inline">Messages</span>
            </button>

            <button className="w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-[#161A20] hover:text-white transition-colors cursor-pointer">
              <Heart className="w-6 h-6 shrink-0" />
              <span className="hidden xl:inline">Notifications</span>
            </button>

            <button className="w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-[#161A20] hover:text-white transition-colors cursor-pointer">
              <PlusSquare className="w-6 h-6 shrink-0" />
              <span className="hidden xl:inline">Create</span>
            </button>

            <button className="w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-[#161A20] hover:text-white transition-colors cursor-pointer">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                WP
              </div>
              <span className="hidden xl:inline">Profile</span>
            </button>
          </nav>
        </div>

        {/* Bottom Options */}
        <div className="space-y-1">
          <button className="w-full flex items-center gap-4 px-3 py-3 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-[#161A20] hover:text-white transition-colors cursor-pointer">
            <Menu className="w-6 h-6 shrink-0" />
            <span className="hidden xl:inline">More</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {currentTab === "feed" ? (
          <InstagramFeed
            onOpenStory={handleOpenStory}
            onOpenReels={() => setCurrentTab("reels")}
          />
        ) : (
          <InstagramReelsView
            onClose={onClose}
            onNavigateToFeed={() => setCurrentTab("feed")}
          />
        )}
      </main>

      {/* Story Modal View */}
      {activeStory && (
        <InstagramStoryModal
          story={activeStory}
          onClose={() => setActiveStory(null)}
          onNextStory={handleNextStory}
          onPrevStory={handlePrevStory}
        />
      )}
    </div>
  );
};
