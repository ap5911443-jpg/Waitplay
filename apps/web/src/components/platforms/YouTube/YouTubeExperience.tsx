import React from "react";
import { YouTubeContainer } from "../YouTubeContainer";

interface YouTubeExperienceProps {
  onClose?: () => void;
}

export const YouTubeExperience: React.FC<YouTubeExperienceProps> = ({ onClose }) => {
  return <YouTubeContainer onClose={onClose} />;
};
