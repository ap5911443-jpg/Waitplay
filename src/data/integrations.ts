import { IntegrationAgent } from "../types";

export const INTEGRATIONS: IntegrationAgent[] = [
  {
    name: "Claude Code",
    description: "Session notification & pre_tool_use hooks",
    status: "native",
    hookType: "CLI Lifecycle Hook",
    iconName: "Terminal",
  },
  {
    name: "Cursor",
    description: "IDE state and background reasoning hooks",
    status: "native",
    hookType: "Editor Extension",
    iconName: "Code2",
  },
  {
    name: "OpenAI Codex",
    description: "Turn notification script & real-time watcher",
    status: "verified",
    hookType: "Process Watcher",
    iconName: "Cpu",
  },
  {
    name: "Oh-My-Pi (OMP)",
    description: "Direct socket event watcher & extension",
    status: "native",
    hookType: "Socket Dispatcher",
    iconName: "Zap",
  },
  {
    name: "Windsurf",
    description: "Cascade agent event pipeline",
    status: "verified",
    hookType: "LSP Event Stream",
    iconName: "Layers",
  },
  {
    name: "Cline",
    description: "Real-time task state and bash watcher",
    status: "verified",
    hookType: "Background Daemon",
    iconName: "Bot",
  },
  {
    name: "Google Antigravity",
    description: "Task dispatcher & execution watcher",
    status: "verified",
    hookType: "Process Hook",
    iconName: "Shield",
  },
  {
    name: "OpenCode",
    description: "JSON-RPC bridge watcher & event stream",
    status: "verified",
    hookType: "JSON-RPC Bridge",
    iconName: "Radio",
  },
];
