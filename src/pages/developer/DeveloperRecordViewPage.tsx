import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useCropRecordDetail } from '@/hooks/useRecordsNotebook';
import { MarkdownContent } from '@/components/records/MarkdownContent';
import { Button } from '@/components/ui/button';

function sourceBadge(source: 'company' | 'developer') {
  if (source === 'developer') {
    return <span className="fv-badge text-[11px] bg-primary/10 text-primary border-primary/40">Developer note</span>;
  }
  return <span className="fv-badge text-[11px] bg-emerald-50 text-emerald-700 border-emerald-300">Company note</span>;
}

export default function DeveloperRecordViewPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCropRecordDetail(recordId);

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

      {isLoading ? (
        <div className="fv-card p-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !data ? (
        <div className="fv-card p-8 text-sm text-red-500">
          Failed to load record. It may have been deleted.
        </div>
      ) : (
        <>
          <header className="space-y-3 border-b pb-4">
            <h1 className="text-2xl font-bold text-foreground">{data.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded bg-muted">
                {data.crop_name}
              </span>
              {sourceBadge(data.source_type)}
              {data.company_name && (
                <span className="px-2 py-0.5 rounded bg-muted/70">
                  {data.company_name}
                </span>
              )}
              {data.created_at && (
                <span>Created {new Date(data.created_at).toLocaleString()}</span>
              )}
              {data.updated_at && data.updated_at !== data.created_at && (
                <span>Updated {new Date(data.updated_at).toLocaleString()}</span>
              )}
            </div>
          </header>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Note</h2>
            <div className="fv-card p-4">
              <MarkdownContent content={data.content || '*No content provided*'} className="mx-auto" />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
            {data.attachments.length === 0 ? (
              <div className="fv-card p-4 text-xs text-muted-foreground">
                No attachments for this note.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.attachments.map((att) => {
                  const isImage = (att.file_type ?? '').startsWith('image/');
                  return (
                    <a
                      key={att.id}
                      href={att.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="fv-card p-3 flex gap-3 items-start hover:border-primary/30 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={att.file_url} alt={att.file_name ?? 'Attachment'} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs text-muted-foreground">FILE</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {att.file_name || 'Attachment'}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {att.file_type || 'File'}
                        </div>
                        {att.created_at && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Added {new Date(att.created_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>

          <div className="pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
            >
              Back to records
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

