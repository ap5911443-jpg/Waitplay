import React from "react";
import { ChevronDown } from "lucide-react";

interface AccordionItemProps {
  id: string;
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

export const AccordionItem: React.FC<AccordionItemProps> = ({
  id,
  question,
  answer,
  isOpen,
  onToggle,
}) => {
  return (
    <div className="border-b border-[rgba(26,26,26,0.12)] py-5 sm:py-6 transition-colors">
      <button
        id={`faq-btn-${id}`}
        aria-expanded={isOpen}
        aria-controls={`faq-panel-${id}`}
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] rounded-lg cursor-pointer"
      >
        <span className="font-sans font-semibold text-[17px] sm:text-[19px] text-[#1A1A1A] group-hover:text-[#034F46] transition-colors pr-6">
          {question}
        </span>
        <span
          className={`flex-shrink-0 w-8 h-8 rounded-full border border-[rgba(26,26,26,0.15)] flex items-center justify-center bg-[#FFFFEB] transition-transform duration-300 ${
            isOpen ? "rotate-180 bg-[#F0D7FF] border-[#E8C4FF]" : "group-hover:border-[rgba(26,26,26,0.3)]"
          }`}
        >
          <ChevronDown className="w-4 h-4 text-[#1A1A1A]" />
        </span>
      </button>

      <div
        id={`faq-panel-${id}`}
        role="region"
        aria-labelledby={`faq-btn-${id}`}
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0 mt-0"
        } overflow-hidden`}
      >
        <div className="overflow-hidden">
          <p className="font-sans text-[15px] sm:text-[16px] text-[#666666] leading-[1.6] max-w-[840px] pl-1">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
};
