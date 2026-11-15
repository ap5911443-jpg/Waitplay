import React from "react";

// Instagram glyphs recreated as inline SVGs so the clone matches the real
// desktop web app. Each accepts size/className/filled where relevant.

interface IconProps {
  size?: number;
  className?: string;
  filled?: boolean;
  strokeWidth?: number;
}

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const HomeIcon: React.FC<IconProps> = ({ size = 24, className, filled, strokeWidth = 2 }) =>
  filled ? (
    <svg {...base(size)} className={className} fill="currentColor" stroke="none">
      <path d="M9.005 16.545a2.997 2.997 0 0 1 2.997-2.997h0A2.997 2.997 0 0 1 15 16.545V22h7V11.543L12 2 2 11.543V22h7.005Z" />
    </svg>
  ) : (
    <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
      <path d="M22 23h-6.001a1 1 0 0 1-1-1v-5.455a2.997 2.997 0 1 0-5.993 0V22a1 1 0 0 1-1 1H2.001a1 1 0 0 1-1-1V11.543a1.002 1.002 0 0 1 .31-.724l10-9.543a1.001 1.001 0 0 1 1.38 0l10 9.543a1.002 1.002 0 0 1 .31.724V22a1 1 0 0 1-1 1Z" />
    </svg>
  );

export const SearchIcon: React.FC<IconProps> = ({ size = 24, className, filled, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={filled ? 2.5 : strokeWidth}>
    <circle cx="10.5" cy="10.5" r="8" />
    <line x1="16.5" y1="16.5" x2="22" y2="22" strokeWidth={filled ? 3 : strokeWidth} />
  </svg>
);

export const ExploreIcon: React.FC<IconProps> = ({ size = 24, className, filled, strokeWidth = 2 }) =>
  filled ? (
    <svg {...base(size)} className={className} fill="currentColor" stroke="none">
      <path d="M12 1C5.935 1 1 5.935 1 12s4.935 11 11 11 11-4.935 11-11S18.065 1 12 1Zm5.123 5.898-2.906 6.653a1 1 0 0 1-.513.513L7.05 16.97a.25.25 0 0 1-.33-.33l2.906-6.653a1 1 0 0 1 .513-.513l6.654-2.906a.25.25 0 0 1 .33.33ZM12 13.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
    </svg>
  ) : (
    <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="10.5" />
      <path d="m13.918 10.082 1.991-5.33a.25.25 0 0 0-.33-.33l-5.33 1.991a1 1 0 0 0-.588.589l-1.99 5.33a.25.25 0 0 0 .33.33l5.329-1.991a1 1 0 0 0 .588-.588Z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );

export const ReelsIcon: React.FC<IconProps> = ({ size = 24, className, filled, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <path d="m6.5 2 3 6M12 2l3 6" strokeWidth={strokeWidth} />
    <line x1="2" y1="8" x2="22" y2="8" />
    <path d={filled ? "M10 10.5v5l4.5-2.5-4.5-2.5Z" : "m10 10.5 4.5 2.5L10 15.5v-5Z"} fill={filled ? "currentColor" : "currentColor"} stroke="currentColor" />
  </svg>
);

export const MessengerIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <path d="M22 12.5a9.5 8.5 0 1 1-4.2-7.05" />
    <path d="M2.5 9.5 11 15l3-3 6 3-8.5 3.5-3-3-6 3" fill="none" />
  </svg>
);

export const NotificationsIcon: React.FC<IconProps> = ({ size = 24, className, filled, strokeWidth = 2 }) =>
  filled ? (
    <svg {...base(size)} className={className} fill="currentColor" stroke="none">
      <path d="M12 21.5 3.6 13a5.5 5.5 0 0 1 7.78-7.78L12 5.84l.62-.62A5.5 5.5 0 0 1 20.4 13Z" />
    </svg>
  ) : (
    <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
      <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938Z" />
    </svg>
  );

export const CreateIcon: React.FC<IconProps> = ({ size = 24, className, filled, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <rect x="2" y="2" width="20" height="20" rx="5" fill={filled ? "currentColor" : "none"} stroke="currentColor" />
    <line x1="12" y1="7" x2="12" y2="17" stroke={filled ? "#fff" : "currentColor"} />
    <line x1="7" y1="12" x2="17" y2="12" stroke={filled ? "#fff" : "currentColor"} />
  </svg>
);

export const MenuIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <line x1="3" y1="7" x2="21" y2="7" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="17" x2="15" y2="17" />
  </svg>
);

export const ThreadsIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 192 192" fill="currentColor" className={className}>
    <path d="M141 88c-.7-.3-1.4-.6-2.1-.9-1.2-22.6-13.6-35.5-34.4-35.6h-.3c-12.5 0-22.8 5.3-29.2 15l11.5 7.9c4.7-7.2 12.2-8.7 17.7-8.7h.2c6.9 0 12.1 2 15.4 5.9 2.5 2.9 4.1 6.8 5 11.8-6.7-1.1-13.9-1.5-21.6-1-21.7 1.3-35.6 13.9-34.7 31.5.5 8.9 4.9 16.6 12.5 21.6 6.4 4.3 14.7 6.3 23.3 5.9 11.4-.6 20.3-5 26.6-12.9 4.8-6 7.8-13.8 9.2-23.6 5.6 3.4 9.8 7.9 12.1 13.3 3.9 9.2 4.1 24.3-8.2 36.6-10.8 10.8-23.8 15.5-43.4 15.6-21.8-.2-38.2-7.2-48.9-20.8C25.5 155.6 20 137.3 19.8 114c.2-23.3 5.7-41.6 16.3-54.4C46.8 46 63.2 39 85 38.8c21.9.2 38.6 7.2 49.7 20.9 5.4 6.7 9.5 15.2 12.2 25.1l13.5-3.6c-3.2-12.2-8.4-22.8-15.4-31.5C137.5 32.8 116.6 24.1 90 24h-.1C63.4 24.1 42.4 32.8 28.3 50 15.8 65.2 9.4 86.5 9.2 113.6v.7c.2 27.1 6.6 48.4 19.1 63.6 14.1 17.2 35.1 25.9 61.7 26h.1c23.4-.2 39.8-6.3 53.4-19.8 17.8-17.7 17.3-40 11.4-53.8-4.2-9.9-12.3-18-23.2-23.5zM101.2 128c-9.5.5-19.4-3.7-19.9-13-.4-6.9 4.9-14.5 20.3-15.4 1.8-.1 3.5-.2 5.2-.2 5.6 0 10.8.5 15.6 1.6-1.8 22.4-12.3 26.5-21.2 27z" />
  </svg>
);

export const VerifiedIcon: React.FC<IconProps> = ({ size = 12, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
    <path
      d="M12 1.5 14.6 4l3.6-.2.9 3.5 3.2 1.7-1.6 3.2 1.6 3.2-3.2 1.7-.9 3.5-3.6-.2L12 22.5 9.4 20l-3.6.2-.9-3.5-3.2-1.7 1.6-3.2-1.6-3.2 3.2-1.7.9-3.5 3.6.2L12 1.5Z"
      fill="#0095F6"
    />
    <path d="m8.2 12.3 2.5 2.5 5-5.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LikeIcon: React.FC<IconProps> = ({ size = 24, className, filled, strokeWidth = 2 }) =>
  filled ? (
    <svg {...base(size)} className={className} fill="#ed4956" stroke="none">
      <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938Z" />
    </svg>
  ) : (
    <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
      <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938Z" />
    </svg>
  );

export const CommentIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" />
  </svg>
);

export const ShareIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <line x1="22" y1="3" x2="9.218" y2="10.083" />
    <polygon points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" fill="none" />
  </svg>
);

export const SaveIcon: React.FC<IconProps> = ({ size = 24, className, filled, strokeWidth = 2 }) =>
  filled ? (
    <svg {...base(size)} className={className} fill="currentColor" stroke="currentColor">
      <polygon points="20 21 12 13.44 4 21 4 3 20 3 20 21" />
    </svg>
  ) : (
    <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
      <polygon points="20 21 12 13.44 4 21 4 3 20 3 20 21" fill="none" />
    </svg>
  );

export const MoreIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 1.6 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const MuteIcon: React.FC<IconProps> = ({ size = 20, className, filled }) => (
  <svg {...base(size)} className={className} strokeWidth={2}>
    {filled ? (
      <>
        <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" />
        <line x1="22" y1="9" x2="16" y2="15" />
        <line x1="16" y1="9" x2="22" y2="15" />
      </>
    ) : (
      <>
        <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M18.07 5.93a9 9 0 0 1 0 12.73" />
      </>
    )}
  </svg>
);

export const AudioIcon: React.FC<IconProps> = ({ size = 14, className }) => (
  <svg {...base(size)} className={className} strokeWidth={2}>
    <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none" />
    <circle cx="18" cy="16" r="3" fill="currentColor" stroke="none" />
    <path d="M9 18V6l12-2v12" />
  </svg>
);

export const ChevronLeft: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export const ChevronRight: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const GridIcon: React.FC<IconProps> = ({ size = 12, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
  </svg>
);

export const TaggedIcon: React.FC<IconProps> = ({ size = 12, className, strokeWidth = 2 }) => (
  <svg {...base(size)} className={className} strokeWidth={strokeWidth}>
    <path d="M21 9 12 3 3 9v12h18V9Z" />
    <circle cx="12" cy="11" r="2.4" />
    <path d="M8.5 18a3.5 3.5 0 0 1 7 0" />
  </svg>
);

export const CarouselIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M19 2H9a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3Zm1 13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1Z" />
    <path d="M3 8a1 1 0 0 0-1 1v10a3 3 0 0 0 3 3h10a1 1 0 0 0 0-2H5a1 1 0 0 1-1-1V9a1 1 0 0 0-1-1Z" />
  </svg>
);

export const PlayIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

// Solid heart that inherits currentColor — used for white hover-stat overlays
// on Explore/Profile grids (distinct from the red "liked" LikeIcon).
export const HeartSolidIcon: React.FC<IconProps> = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938Z" />
  </svg>
);
