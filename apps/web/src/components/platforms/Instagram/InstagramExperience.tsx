import React from "react";
import { InstagramContainer } from "../InstagramContainer";

interface InstagramExperienceProps {
  initialScreen?: "feed" | "reels";
  onClose?: () => void;
}

export const InstagramExperience: React.FC<InstagramExperienceProps> = ({ onClose }) => {
  return <InstagramContainer onClose={onClose} />;
};
