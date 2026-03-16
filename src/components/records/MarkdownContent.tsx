import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-3xl',
        'prose-p:my-3 prose-ul:my-2 prose-ol:my-2',
        'prose-blockquote:border-l-4 prose-blockquote:border-primary/60 prose-blockquote:bg-muted/30 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:rounded-r',
        'prose-strong:font-semibold',
        'leading-7 whitespace-pre-wrap',
        className
      )}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
