import { BookOpen, ExternalLink, X } from "lucide-react";
import type { InformationRequest } from "../../types";

export function CategoryBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-ink-blue-wash px-2.5 py-0.5 text-xs font-semibold text-ink-blue">
      {children}
    </span>
  );
}

export function QualityBadge({ quality }: { quality: InformationRequest["quality"] }) {
  return quality === "good" ? (
    <span className="inline-flex items-center rounded-full bg-[#e6f6ec] px-2.5 py-0.5 text-xs font-semibold text-leaf">
      Good detail
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-[#fff1d6] px-2.5 py-0.5 text-xs font-semibold text-[#8a4b08]">
      Needs detail
    </span>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink-blue px-5 text-[15px] font-semibold text-white transition-colors enabled:hover:bg-ink-blue-deep disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink px-5 text-[15px] font-medium text-ink transition-colors enabled:hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
    />
  );
}

export function SourceBadge({ source }: { source: InformationRequest["source"] }) {
  if (source === "custom") {
    return (
      <span className="inline-flex items-center rounded-full bg-[#f5ecd9] px-2.5 py-0.5 text-xs font-semibold text-brown">
        Added by you
      </span>
    );
  }
  if (source === "inspection") {
    return (
      <span className="inline-flex items-center rounded-full bg-[#e6f6ec] px-2.5 py-0.5 text-xs font-semibold text-leaf">
        Section 2(j)
      </span>
    );
  }
  if (source === "follow-up") {
    return (
      <span className="inline-flex items-center rounded-full bg-[#fdecea] px-2.5 py-0.5 text-xs font-semibold text-stamp">
        Follow-up
      </span>
    );
  }
  return null;
}

export function RequestCard({
  request,
  rightSlot,
  onRemove,
  children,
}: {
  request: InformationRequest;
  rightSlot?: React.ReactNode;
  onRemove?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-edge bg-card p-4 sm:p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge>{request.category}</CategoryBadge>
          <QualityBadge quality={request.quality} />
          <SourceBadge source={request.source} />
          {rightSlot}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove "${request.title}"`}
            className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-faint hover:bg-ink/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <p className="font-serif text-[15.5px] font-semibold leading-snug text-ink">{request.title}</p>
      <p className="mt-1.5 text-xs text-muted">
        {request.authority} &middot; {request.period}
      </p>
      {request.context && (
        <p className="mt-2.5 border-l-2 border-khaki pl-2.5 text-[13px] text-ink-3">
          {request.context}
        </p>
      )}
      {request.basis && (
        <div className="mt-3 rounded-md bg-paper-light p-3 text-[13px] text-ink-3">
          <p className="flex items-center gap-1.5 font-mono text-[11.5px] font-semibold uppercase tracking-[0.1em] text-brown">
            <BookOpen size={12} />
            Why ask for this
          </p>
          <p className="mt-1.5 font-serif italic leading-relaxed text-ink-2">&ldquo;{request.basis.quote}&rdquo;</p>
          <a
            href={
              // A browser's PDF viewer opens at the page given after #page=.
              /\.pdf$/i.test(request.basis.url)
                ? `${request.basis.url}#page=${request.basis.page}`
                : request.basis.url
            }
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 font-medium text-ink-blue underline underline-offset-2"
          >
            {request.basis.sourceTitle}, PDF page {request.basis.page}
            <ExternalLink size={11} />
          </a>
        </div>
      )}
      {children}
    </div>
  );
}
