import React from "react";
import {
  HomeIcon,
  SearchIcon,
  ExploreIcon,
  ReelsIcon,
  MessengerIcon,
  NotificationsIcon,
  CreateIcon,
  MenuIcon,
  ThreadsIcon,
} from "./Icons";
import { CURRENT_USER, avatar } from "./data";

export type IgView = "home" | "explore" | "reels" | "profile";

interface SidebarProps {
  active: IgView;
  collapsed: boolean; // real IG collapses the rail to icons when Search/Notifications open
  onNavigate: (v: IgView) => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  onOpenCreate: () => void;
  searchActive: boolean;
  notificationsActive: boolean;
}

interface NavItemProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  collapsed: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, icon, active, collapsed, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={`group flex items-center gap-4 w-full rounded-lg px-3 py-3 my-1 hover:bg-[#f2f2f2] transition-colors cursor-pointer ${
      collapsed ? "justify-center" : ""
    }`}
  >
    <span className="shrink-0 text-[#262626] group-active:scale-90 transition-transform">{icon}</span>
    {!collapsed && (
      <span className={`text-[16px] leading-none text-[#262626] ${active ? "font-bold" : "font-normal"}`}>
        {label}
      </span>
    )}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  collapsed,
  onNavigate,
  onOpenSearch,
  onOpenNotifications,
  onOpenCreate,
  searchActive,
  notificationsActive,
}) => {
  const isHome = active === "home" && !searchActive && !notificationsActive;
  const isProfile = active === "profile" && !searchActive && !notificationsActive;

  return (
    <aside
      className={`shrink-0 h-full border-r border-[#dbdbdb] bg-white flex flex-col py-5 px-3 transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-[245px]"
      }`}
    >
      {/* Logo */}
      <div className={`px-2 mb-6 mt-2 h-10 flex items-center ${collapsed ? "justify-center" : ""}`}>
        {collapsed ? (
          <svg width="24" height="24" viewBox="0 0 24 24" className="text-[#262626]" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="6" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        ) : (
          <span
            className="text-[#262626] text-[28px] leading-none"
            style={{ fontFamily: '"Grand Hotel", cursive' }}
          >
            Instagram
          </span>
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex-1 flex flex-col">
        <NavItem collapsed={collapsed} label="Home" active={isHome} onClick={() => onNavigate("home")}
          icon={<HomeIcon filled={isHome} />} />
        <NavItem collapsed={collapsed} label="Search" active={searchActive} onClick={onOpenSearch}
          icon={<SearchIcon filled={searchActive} />} />
        <NavItem collapsed={collapsed} label="Explore" active={active === "explore"} onClick={() => onNavigate("explore")}
          icon={<ExploreIcon filled={active === "explore"} />} />
        <NavItem collapsed={collapsed} label="Reels" active={active === "reels"} onClick={() => onNavigate("reels")}
          icon={<ReelsIcon filled={active === "reels"} />} />
        <NavItem collapsed={collapsed} label="Messages" onClick={() => {}}
          icon={<MessengerIcon />} />
        <NavItem collapsed={collapsed} label="Notifications" active={notificationsActive} onClick={onOpenNotifications}
          icon={<NotificationsIcon filled={notificationsActive} />} />
        <NavItem collapsed={collapsed} label="Create" onClick={onOpenCreate}
          icon={<CreateIcon />} />
        <NavItem collapsed={collapsed} label="Profile" active={isProfile} onClick={() => onNavigate("profile")}
          icon={
            <span className={`block w-6 h-6 rounded-full overflow-hidden ring-2 ${isProfile ? "ring-[#262626]" : "ring-transparent"}`}>
              <img src={avatar(CURRENT_USER.avatarSeed)} alt="" className="w-full h-full object-cover" />
            </span>
          } />
      </nav>

      {/* Bottom cluster */}
      <div className="mt-auto">
        <NavItem collapsed={collapsed} label="Threads" onClick={() => {}} icon={<ThreadsIcon size={24} />} />
        <NavItem collapsed={collapsed} label="More" onClick={() => {}} icon={<MenuIcon />} />
      </div>
    </aside>
  );
};

export default Sidebar;
