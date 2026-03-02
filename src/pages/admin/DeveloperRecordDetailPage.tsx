import React from 'react';
import { useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { LibraryRecord, CompanyRecord } from '@/types';
import { MarkdownContent } from '@/components/records/MarkdownContent';
import { Chips } from '@/components/records/Chips';

type DeveloperRecordLocationState =
  | { kind: 'library'; record: LibraryRecord }
  | { kind: 'company'; record: CompanyRecord };

function getCropEmojiFromId(cropId?: string): string | null {
  if (!cropId) return null;
  const emojis: Record<string, string> = {
    tomatoes: '🍅',
    'french-beans': '🫛',
    capsicum: '🌶️',
    maize: '🌽',
    watermelons: '🍉',
    rice: '🌾',
  };
  return emojis[cropId] || '🌱';
}

export default function DeveloperRecordDetailPage() {
  const navigate = useNavigate();
  const { cropId } = useParams<{ cropId: string }>();
  const location = useLocation();
  const state = location.state as DeveloperRecordLocationState | undefined;

  if (!state) {
    // If user hard-refreshed and we lost state, send back to crop records.
    if (!cropId) return <Navigate to="/developer/records" replace />;
    return <Navigate to={`/developer/records/${cropId}`} replace />;
  }

  const record = state.record;
  const cropEmoji = getCropEmojiFromId(record.cropId ?? cropId);

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          {cropEmoji && (
            <span className="text-2xl" aria-hidden>
              {cropEmoji}
            </span>
          )}
          <span>{record.title}</span>
        </h1>
        <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
          <span className="fv-badge text-xs capitalize">{record.category}</span>
          {state.kind === 'company' && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded">
              Company record
            </span>
          )}
        </div>
      </div>

      {record.highlights?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-1">Highlights</h2>
          <Chips items={record.highlights} variant="highlight" />
        </div>
      )}

      {record.tags?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-1">Tags</h2>
          <Chips items={record.tags} />
        </div>
      )}

      <div className="fv-card p-4">
        <MarkdownContent content={record.content} />
      </div>
    </div>
  );
}

