import { NotebookImageTourOverlay } from "@/components/records/notebook-image/NotebookImageTourOverlay";
import { cn } from "@/lib/utils";

type Props = {
  url: string;
  previewName: string;
  tourVisible: boolean;
  className?: string;
  imageStyle?: React.CSSProperties;
  onImageKeyDown: (e: React.KeyboardEvent<HTMLImageElement>) => void;
};

/**
 * Inline notebook image preview: optional first-run tips overlay + accessible image.
 */
export function NotebookImageBlock({ url, previewName, tourVisible, className, imageStyle, onImageKeyDown }: Props) {
  return (
    <>
      {tourVisible ? <NotebookImageTourOverlay /> : null}
      <img
        src={url}
        alt={previewName}
        draggable={false}
        decoding="async"
        loading="lazy"
        tabIndex={0}
        className={cn("fv-attachment-preview-img", className)}
        style={imageStyle}
        onKeyDown={onImageKeyDown}
        title="View image"
        aria-label={`View ${previewName}`}
      />
    </>
  );
}
