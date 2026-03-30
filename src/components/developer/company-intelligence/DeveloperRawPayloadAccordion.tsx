import React, { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

async function copyToClipboard(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

export function DeveloperRawPayloadAccordion({
  payload,
  title = 'Raw Payload',
  defaultOpen = false,
}: {
  payload: unknown;
  title?: string;
  defaultOpen?: boolean;
}) {
  const hasPayload = payload !== undefined && payload !== null;
  const json = useMemo(() => (hasPayload ? safeStringify(payload) : ''), [hasPayload, payload]);
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 px-4">
      <Accordion type="single" collapsible defaultValue={defaultOpen ? 'raw' : undefined}>
        <AccordionItem value="raw" className="border-b-0">
          <AccordionTrigger className="py-3 text-sm">
            <span className="font-semibold">{title}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-3">
            {hasPayload ? (
              <>
                <div className="flex items-center justify-end pb-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => void copyToClipboard(json)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy JSON
                  </Button>
                </div>
                <pre className="max-h-[320px] overflow-auto rounded-xl border border-border/60 bg-muted/20 p-4 text-[11px] leading-relaxed text-foreground">
                  {json}
                </pre>
              </>
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
                No payload available.
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

