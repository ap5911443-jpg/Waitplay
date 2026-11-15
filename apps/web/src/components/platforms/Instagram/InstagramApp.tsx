import React, { useState, useCallback } from "react";
import { InstagramProvider } from "./store";
import { Sidebar, IgView } from "./Sidebar";
import { FeedView } from "./FeedView";
import { ExploreView } from "./ExploreView";
import { ReelsView } from "./ReelsView";
import { ProfileView } from "./ProfileView";
import { StoryViewer } from "./StoryViewer";
import { PostModal, SearchPanel } from "./PostModalAndSearch";
import { CreateIcon, CloseIcon } from "./Icons";
import { CURRENT_USER, POSTS, getUser, avatar } from "./data";

interface InstagramAppProps {
  onClose?: () => void;
}

const NOTIFICATIONS = [
  { userId: "karpathy", text: "liked your photo.", time: "2h", postThumb: POSTS[0].images[0] },
  { userId: "natgeo", text: "started following you.", time: "5h", follow: true },
  { userId: "levelsio", text: "mentioned you in a comment: @you.dev 🔥", time: "8h", postThumb: POSTS[2].images[0] },
  { userId: "figma", text: "liked your comment.", time: "1d", postThumb: POSTS[2].images[0] },
  { userId: "dan", text: "started following you.", time: "1d", follow: true },
];

const InstagramAppInner: React.FC<InstagramAppProps> = () => {
  const [view, setView] = useState<IgView>("home");
  const [profileUser, setProfileUser] = useState<string>(CURRENT_USER.id);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [storyUser, setStoryUser] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const collapsed = searchOpen || notifOpen || view === "reels";

  const navigate = useCallback((v: IgView) => {
    setSearchOpen(false);
    setNotifOpen(false);
    if (v === "profile") setProfileUser(CURRENT_USER.id);
    setView(v);
  }, []);

  const openProfile = useCallback((id: string) => {
    setSearchOpen(false);
    setNotifOpen(false);
    setOpenPost(null);
    setProfileUser(id);
    setView("profile");
  }, []);

  return (
    <div className="relative w-full h-full flex bg-white text-[#262626] font-sans overflow-hidden">
      <Sidebar
        active={view}
        collapsed={collapsed}
        searchActive={searchOpen}
        notificationsActive={notifOpen}
        onNavigate={navigate}
        onOpenSearch={() => { setNotifOpen(false); setSearchOpen((s) => !s); }}
        onOpenNotifications={() => { setSearchOpen(false); setNotifOpen((n) => !n); }}
        onOpenCreate={() => setCreateOpen(true)}
      />

      {/* Main content */}
      <main className="relative flex-1 h-full min-w-0 bg-white">
        {view === "home" && (
          <div className="h-full overflow-y-auto">
            <FeedView onOpenPost={setOpenPost} onOpenStory={setStoryUser} onOpenProfile={openProfile} />
          </div>
        )}
        {view === "explore" && (
          <div className="h-full overflow-y-auto">
            <ExploreView onOpenPost={setOpenPost} onOpenProfile={openProfile} />
          </div>
        )}
        {view === "reels" && (
          <div className="h-full bg-black">
            <ReelsView onOpenProfile={openProfile} />
          </div>
        )}
        {view === "profile" && (
          <div className="h-full overflow-y-auto">
            <ProfileView userId={profileUser} onOpenPost={setOpenPost} onBack={() => navigate("home")} />
          </div>
        )}
      </main>

      {/* Search flyout */}
      {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} onOpenProfile={openProfile} />}

      {/* Notifications flyout */}
      {notifOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0" onClick={() => setNotifOpen(false)} />
          <div className="relative ml-[72px] w-[397px] h-full bg-white border-r border-[#dbdbdb] rounded-r-2xl shadow-xl flex flex-col">
            <h2 className="text-2xl font-bold px-6 pt-6 pb-4">Notifications</h2>
            <div className="px-6 pb-2 text-[15px] font-semibold">This week</div>
            <div className="flex-1 overflow-y-auto">
              {NOTIFICATIONS.map((n, i) => {
                const u = getUser(n.userId);
                return (
                  <div key={i} className="flex items-center gap-3 px-6 py-2 hover:bg-[#fafafa]">
                    <button onClick={() => openProfile(n.userId)}>
                      <img src={avatar(u.avatarSeed)} alt="" className="w-11 h-11 rounded-full object-cover" />
                    </button>
                    <div className="flex-1 text-[14px] leading-snug">
                      <button onClick={() => openProfile(n.userId)} className="font-semibold mr-1">{u.username}</button>
                      <span className="text-[#262626]">{n.text}</span>
                      <span className="text-[#8e8e8e] ml-1">{n.time}</span>
                    </div>
                    {n.follow ? (
                      <button className="bg-[#0095f6] hover:bg-[#1877f2] text-white text-[14px] font-semibold px-4 py-1.5 rounded-lg">Follow</button>
                    ) : (
                      <img src={n.postThumb} alt="" className="w-11 h-11 object-cover rounded" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => setCreateOpen(false)}>
          <div className="w-[500px] max-w-[90%] bg-white rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="relative text-center font-semibold py-3 border-b border-[#dbdbdb]">
              Create new post
              <button onClick={() => setCreateOpen(false)} className="absolute right-3 top-2.5 text-[#262626]"><CloseIcon size={22} /></button>
            </div>
            <div className="h-[360px] flex flex-col items-center justify-center gap-5">
              <CreateIcon size={76} className="text-[#262626]" />
              <div className="text-xl">Drag photos and videos here</div>
              <button className="bg-[#0095f6] hover:bg-[#1877f2] text-white text-[14px] font-semibold px-4 py-1.5 rounded-lg">
                Select from computer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post detail modal */}
      {openPost && <PostModal postId={openPost} onClose={() => setOpenPost(null)} onOpenProfile={openProfile} />}

      {/* Story viewer */}
      {storyUser && <StoryViewer initialUserId={storyUser} onClose={() => setStoryUser(null)} />}
    </div>
  );
};

export const InstagramApp: React.FC<InstagramAppProps> = ({ onClose }) => (
  <InstagramProvider>
    <InstagramAppInner onClose={onClose} />
  </InstagramProvider>
);

export default InstagramApp;
