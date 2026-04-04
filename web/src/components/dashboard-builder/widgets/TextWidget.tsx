'use client';

import type { WidgetConfig } from '@/types/dashboard';

interface TextWidgetProps {
  config: WidgetConfig;
  isEditing?: boolean;
  onContentChange?: (content: string) => void;
}

export default function TextWidget({ config, isEditing, onContentChange }: TextWidgetProps) {
  const content = config.content || '';

  // Determine heading level based on widget height (heuristic)
  const isHeading = content.length < 80;

  if (isEditing && onContentChange) {
    return (
      <div className="h-full flex items-center px-4 py-2">
        <input
          type="text"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Enter text..."
          className={`w-full bg-transparent border-none outline-none text-[var(--db-text)] placeholder:text-[var(--db-text)]/30 ${
            isHeading ? 'text-lg font-bold' : 'text-sm'
          }`}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex items-center px-4 py-2">
      {isHeading ? (
        <h3 className="text-lg font-bold text-[var(--db-text)] truncate w-full">
          {content || 'Untitled'}
        </h3>
      ) : (
        <p className="text-sm text-[var(--db-text)]/70 w-full line-clamp-4">
          {content || 'Enter text...'}
        </p>
      )}
    </div>
  );
}
