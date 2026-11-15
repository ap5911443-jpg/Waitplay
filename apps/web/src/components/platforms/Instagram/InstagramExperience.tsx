import React from "react";
import { InstagramApp } from "./InstagramApp";

interface InstagramExperienceProps {
  initialScreen?: "feed" | "reels";
  onClose?: () => void;
}

export const InstagramExperience: React.FC<InstagramExperienceProps> = ({ onClose }) => {
  return <InstagramApp onClose={onClose} />;
};

export default InstagramExperience;
