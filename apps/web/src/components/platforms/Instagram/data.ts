// Instagram clone — shared data model and mock content.
// Imagery uses deterministic public sources so the clone looks realistic
// without bundling assets: pravatar for faces, Unsplash for photos.

export const avatar = (seed: number): string =>
  `https://i.pravatar.cc/150?img=${((seed - 1) % 70) + 1}`;

// Curated pool of stable Unsplash photo IDs (portraits, nature, tech, space,
// food, travel) — verified to load. A seed string maps deterministically to one.
const PHOTO_IDS = [
  "1506744038136-46273834b3fb", "1441974231531-c6227db76b6e", "1470071459604-3b5ec3a7fe05",
  "1465146344425-f00d5f5c8f07", "1501785888041-af3ef285b470", "1506905925346-21bda4d32df4",
  "1472214103451-9374bd1c798e", "1447752875215-b2761acb3c5d", "1498050108023-c5249f4df085",
  "1461749280684-dccba630e2f6", "1504384308090-c894fdcc538d", "1517694712202-14dd9538aa97",
  "1555066931-4365d14bab8c", "1419242902214-272b3f66ee7a", "1446776811953-b23d57bd21aa",
  "1451187580459-43490279c0fa", "1502134249126-9f3755a50d78", "1504674900247-0877df9cc836",
  "1476224203421-9ac39bcb3327", "1540553016722-983e48a2cd10", "1493246507139-91e8fad9978e",
  "1534528741775-53994a69daeb", "1506794778202-cad84cf45f1d", "1441986300917-64674bd600d8",
  "1523275335684-37898b6baf30", "1518770660439-4636190af475", "1469474968028-56623f02e42e",
  "1426604966848-d7adac402bff", "1509316785289-025f5b846b35", "1532274402911-5a369e4c4bb5",
  "1444492417251-9c84a5fa18e0", "1487958449943-2429e8be8625", "1518791841217-8f162f1e1131",
  "1533106418989-88406c7cc8ca", "1530569673472-307dc017a82d",
];

const hashSeed = (seed: string): number => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export const photo = (seed: string, w = 640, h = 640): string => {
  const id = PHOTO_IDS[hashSeed(seed) % PHOTO_IDS.length];
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&crop=entropy&auto=format&q=70`;
};

export interface User {
  id: string;
  username: string;
  name: string;
  avatarSeed: number;
  verified?: boolean;
  bio?: string;
  followers?: string;
  following?: string;
  postsCount?: string;
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  time: string;
  likes: number;
}

export interface Post {
  id: string;
  userId: string;
  location?: string;
  images: string[]; // 1 = single, >1 = carousel
  caption: string;
  likes: number;
  time: string; // e.g. "3 hours ago"
  timeShort: string; // e.g. "3h"
  comments: Comment[];
  sponsored?: boolean;
}

export interface Reel {
  id: string;
  userId: string;
  video: string;
  poster: string;
  caption: string;
  audio: string;
  likes: string;
  comments: string;
  shares: string;
}

export interface Story {
  id: string;
  userId: string;
  images: string[];
  seen?: boolean;
  closeFriend?: boolean;
}

export const USERS: Record<string, User> = {
  you: {
    id: "you",
    username: "you.dev",
    name: "You",
    avatarSeed: 12,
    bio: "building things while the agent thinks ⚡",
    followers: "1,204",
    following: "389",
    postsCount: "42",
  },
  karpathy: {
    id: "karpathy",
    username: "karpathy",
    name: "Andrej Karpathy",
    avatarSeed: 13,
    verified: true,
    bio: "Neural nets, cars, and the occasional sunset. Stanford.",
    followers: "892k",
    following: "214",
    postsCount: "318",
  },
  sama: {
    id: "sama",
    username: "sama",
    name: "Sam",
    avatarSeed: 51,
    verified: true,
    bio: "optimistic about the future",
    followers: "2.1m",
    following: "97",
    postsCount: "126",
  },
  lexfridman: {
    id: "lexfridman",
    username: "lexfridman",
    name: "Lex Fridman",
    avatarSeed: 33,
    verified: true,
    bio: "Love is the answer. Podcast + AI research.",
    followers: "3.4m",
    following: "501",
    postsCount: "742",
  },
  natgeo: {
    id: "natgeo",
    username: "natgeo",
    name: "National Geographic",
    avatarSeed: 25,
    verified: true,
    bio: "Experience the world through the eyes of our photographers.",
    followers: "283m",
    following: "157",
    postsCount: "29,412",
  },
  levelsio: {
    id: "levelsio",
    username: "levelsio",
    name: "Pieter Levels",
    avatarSeed: 60,
    verified: true,
    bio: "Indie maker. 12 startups in 12 months.",
    followers: "412k",
    following: "88",
    postsCount: "1,204",
  },
  figma: {
    id: "figma",
    username: "figma",
    name: "Figma",
    avatarSeed: 45,
    verified: true,
    bio: "Nothing great is made alone.",
    followers: "1.1m",
    following: "42",
    postsCount: "2,318",
  },
  nasa: {
    id: "nasa",
    username: "nasa",
    name: "NASA",
    avatarSeed: 68,
    verified: true,
    bio: "Explore the universe and discover our home planet.",
    followers: "97.2m",
    following: "78",
    postsCount: "4,102",
  },
  vercel: {
    id: "vercel",
    username: "vercel",
    name: "Vercel",
    avatarSeed: 8,
    verified: true,
    bio: "Develop. Preview. Ship.",
    followers: "208k",
    following: "31",
    postsCount: "912",
  },
  cursor: {
    id: "cursor",
    username: "cursor",
    name: "Cursor",
    avatarSeed: 19,
    verified: true,
    bio: "The AI code editor.",
    followers: "96k",
    following: "12",
    postsCount: "214",
  },
  emma: {
    id: "emma",
    username: "emma.codes",
    name: "Emma Rivera",
    avatarSeed: 5,
    bio: "frontend @ somewhere · coffee · cats",
    followers: "8,921",
    following: "612",
    postsCount: "188",
  },
  dan: {
    id: "dan",
    username: "dan_abram",
    name: "Dan Abramov",
    avatarSeed: 11,
    verified: true,
    bio: "react things",
    followers: "612k",
    following: "203",
    postsCount: "421",
  },
};

export const CURRENT_USER = USERS.you;

export const POSTS: Post[] = [
  {
    id: "p1",
    userId: "karpathy",
    location: "Stanford, California",
    images: [photo("ig-karpathy-1", 1080, 1080), photo("ig-karpathy-2", 1080, 1080), photo("ig-karpathy-3", 1080, 1080)],
    caption:
      "spent the weekend training a tiny model from scratch. there is something deeply calming about watching the loss curve go down 📉",
    likes: 48213,
    time: "3 hours ago",
    timeShort: "3h",
    comments: [
      { id: "c1", userId: "lexfridman", text: "beautiful. the loss curve is the new sunset 🌅", time: "2h", likes: 1204 },
      { id: "c2", userId: "emma", text: "what did you use for the dataset?", time: "1h", likes: 44 },
      { id: "c3", userId: "levelsio", text: "ship it 🚀", time: "58m", likes: 210 },
    ],
  },
  {
    id: "p2",
    userId: "natgeo",
    location: "Patagonia, Argentina",
    images: [photo("ig-natgeo-1", 1080, 1350)],
    caption:
      "Photo by @karpathy | First light over the Fitz Roy massif. Temperatures dropped to -14°C overnight, but the reward was this sky. #nature #patagonia",
    likes: 1283942,
    time: "5 hours ago",
    timeShort: "5h",
    comments: [
      { id: "c4", userId: "nasa", text: "Stunning. Looks almost like another planet 🌍", time: "4h", likes: 8821 },
      { id: "c5", userId: "you", text: "adding this to my bucket list", time: "3h", likes: 12 },
    ],
  },
  {
    id: "p3",
    userId: "figma",
    images: [photo("ig-figma-1", 1080, 1080), photo("ig-figma-2", 1080, 1080)],
    caption: "Auto layout, but make it ✨effortless✨. New spacing controls are rolling out this week.",
    likes: 20491,
    time: "8 hours ago",
    timeShort: "8h",
    comments: [
      { id: "c6", userId: "emma", text: "FINALLY 🙌", time: "7h", likes: 302 },
      { id: "c7", userId: "vercel", text: "clean.", time: "6h", likes: 88 },
    ],
  },
  {
    id: "p4",
    userId: "cursor",
    location: "San Francisco, California",
    sponsored: true,
    images: [photo("ig-cursor-1", 1080, 1080)],
    caption: "Tab, tab, tab. Your coding agent just got faster. Try the new composer — link in bio.",
    likes: 9123,
    time: "1 day ago",
    timeShort: "1d",
    comments: [{ id: "c8", userId: "dan", text: "the multi-file edits are wild", time: "22h", likes: 540 }],
  },
  {
    id: "p5",
    userId: "nasa",
    images: [photo("ig-nasa-1", 1080, 1080), photo("ig-nasa-2", 1080, 1080), photo("ig-nasa-3", 1080, 1080), photo("ig-nasa-4", 1080, 1080)],
    caption:
      "A cosmic cliffside. Captured in infrared, these are the edges of a nearby star-forming region some 7,600 light-years away. 🔭✨",
    likes: 2910433,
    time: "1 day ago",
    timeShort: "1d",
    comments: [
      { id: "c9", userId: "lexfridman", text: "we are so small 🤍", time: "20h", likes: 14022 },
      { id: "c10", userId: "karpathy", text: "nature's own diffusion model", time: "19h", likes: 9201 },
    ],
  },
  {
    id: "p6",
    userId: "levelsio",
    location: "Bali, Indonesia",
    images: [photo("ig-levels-1", 1080, 1350)],
    caption: "day 214 of building in public. revenue up, stress up, but the view helps 🌴",
    likes: 18422,
    time: "2 days ago",
    timeShort: "2d",
    comments: [{ id: "c11", userId: "emma", text: "the dream 😍", time: "1d", likes: 120 }],
  },
];

export const STORIES: Story[] = [
  { id: "s0", userId: "you", images: [photo("st-you-1", 1080, 1920)] },
  { id: "s1", userId: "karpathy", images: [photo("st-k-1", 1080, 1920), photo("st-k-2", 1080, 1920)] },
  { id: "s2", userId: "sama", images: [photo("st-s-1", 1080, 1920)] },
  { id: "s3", userId: "lexfridman", images: [photo("st-l-1", 1080, 1920), photo("st-l-2", 1080, 1920)], closeFriend: true },
  { id: "s4", userId: "natgeo", images: [photo("st-n-1", 1080, 1920)] },
  { id: "s5", userId: "levelsio", images: [photo("st-lv-1", 1080, 1920)] },
  { id: "s6", userId: "figma", images: [photo("st-f-1", 1080, 1920)] },
  { id: "s7", userId: "nasa", images: [photo("st-na-1", 1080, 1920)], seen: true },
  { id: "s8", userId: "vercel", images: [photo("st-v-1", 1080, 1920)], seen: true },
  { id: "s9", userId: "emma", images: [photo("st-e-1", 1080, 1920)] },
  { id: "s10", userId: "dan", images: [photo("st-d-1", 1080, 1920)], seen: true },
];

// Public sample videos verified to load in-browser. Rendered object-cover (9:16).
const SAMPLE_VIDEOS = [
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
  "https://filesamples.com/samples/video/mp4/sample_640x360.mp4",
  "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
];

export const REELS: Reel[] = [
  { id: "r1", userId: "natgeo", video: SAMPLE_VIDEOS[0], poster: photo("reel-1", 1080, 1920), caption: "Golden hour over the savanna 🦁 #wildlife", audio: "natgeo · Original audio", likes: "1.2M", comments: "8,402", shares: "44.1K" },
  { id: "r2", userId: "levelsio", video: SAMPLE_VIDEOS[1], poster: photo("reel-2", 1080, 1920), caption: "how I ship a product in a weekend 👇", audio: "levelsio · Original audio", likes: "92.1K", comments: "1,204", shares: "9,120" },
  { id: "r3", userId: "figma", video: SAMPLE_VIDEOS[2], poster: photo("reel-3", 1080, 1920), caption: "Design tip: use auto layout for everything ✨", audio: "figma · Original audio", likes: "210K", comments: "3,021", shares: "18.2K" },
  { id: "r4", userId: "nasa", video: SAMPLE_VIDEOS[3], poster: photo("reel-4", 1080, 1920), caption: "Launch, in slow motion 🚀🔥", audio: "NASA · Original audio", likes: "3.1M", comments: "22,104", shares: "120K" },
  { id: "r5", userId: "karpathy", video: SAMPLE_VIDEOS[4], poster: photo("reel-5", 1080, 1920), caption: "explaining backprop with a whiteboard 🧠", audio: "karpathy · Original audio", likes: "480K", comments: "6,210", shares: "40.2K" },
  { id: "r6", userId: "cursor", video: SAMPLE_VIDEOS[5], poster: photo("reel-6", 1080, 1920), caption: "refactor an entire file with one prompt ⚡", audio: "cursor · Original audio", likes: "121K", comments: "2,004", shares: "11.9K" },
];

export interface ExploreItem {
  id: string;
  image: string;
  type: "image" | "video" | "carousel";
  likes: string;
  comments: string;
  tall?: boolean;
  wide?: boolean;
}

export const EXPLORE: ExploreItem[] = Array.from({ length: 30 }).map((_, i) => {
  const type: ExploreItem["type"] = i % 7 === 0 ? "video" : i % 5 === 0 ? "carousel" : "image";
  // Every 10th tile is a 2x2 feature tile, matching Instagram's explore mosaic.
  const feature = i % 10 === 2;
  return {
    id: `e${i}`,
    image: photo(`explore-${i}`, feature ? 900 : 600, feature ? 900 : 600),
    type,
    likes: `${(Math.floor(Math.random() * 90) + 1)}.${Math.floor(Math.random() * 9)}K`,
    comments: `${Math.floor(Math.random() * 900) + 10}`,
    tall: feature,
    wide: false,
  };
});

export const SUGGESTIONS: Array<{ userId: string; reason: string }> = [
  { userId: "dan", reason: "Followed by karpathy + 92 others" },
  { userId: "cursor", reason: "Followed by levelsio + 38 others" },
  { userId: "vercel", reason: "Suggested for you" },
  { userId: "figma", reason: "Followed by emma.codes + 12 others" },
  { userId: "emma", reason: "New to Instagram" },
];

export function getUser(id: string): User {
  return USERS[id] ?? CURRENT_USER;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("en-US");
}
