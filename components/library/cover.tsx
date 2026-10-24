import { MediaTypeIcon } from "@/components/library/media-type-icon";
import type { MediaType } from "@/lib/media-types";
import { cn } from "@/lib/utils";

type Props = {
  url: string | null;
  title: string;
  type: MediaType;
  /** Shared-element name so the cover morphs between list and detail. */
  transitionName?: string;
  className?: string;
  eager?: boolean;
  /** Overlays drawn on top of the art (e.g. a progress bar). */
  children?: React.ReactNode;
};

/** Cover art (presigned S3 URL) or a typed placeholder. Books are 2:3, others 16:9. */
export function Cover({ url, title, type, transitionName, className, eager, children }: Props) {
  const aspect = type === "book" || type === "game" ? "aspect-[2/3]" : "aspect-video";
  return (
    <div
      className={cn("relative overflow-hidden rounded-lg bg-muted", aspect, className)}
      style={transitionName ? { viewTransitionName: transitionName } : undefined}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-muted to-secondary p-3 text-center">
          <div className="grid justify-items-center gap-2 text-muted-foreground">
            <MediaTypeIcon type={type} className="size-8" />
            <span className="line-clamp-3 text-xs font-medium">{title}</span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
