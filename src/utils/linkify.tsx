import React from "react";

// Matches URLs starting with http:// or https://
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

export function renderTextWithLinks(text: string): React.ReactNode {
  if (!text) return text;

  const parts = text.split(URL_REGEX);
  
  return parts.map((part, i) => {
    if (part.match(URL_REGEX)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          title={part}
          onClick={e => e.stopPropagation()}
          className="text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 underline decoration-sky-500/30 hover:decoration-sky-400 transition-colors"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
