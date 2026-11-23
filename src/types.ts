export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export interface TestimonialItem {
  id: string;
  quote: string;
  author: string;
  role: string;
  company: string;
  avatar?: string;
  stats?: {
    value: string;
    label: string;
  };
}

export interface IntegrationAgent {
  name: string;
  description: string;
  status: "verified" | "native" | "community";
  hookType: string;
  iconName: string;
}

export type SimulatorState = "idle" | "thinking" | "game_active" | "completed";
