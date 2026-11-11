import { BookOpen, ExternalLink, X } from "lucide-react";
import type { InformationRequest } from "../../types";

export function CategoryBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
      {children}
    </span>
  );
}

export function QualityBadge({ quality }: { quality: InformationRequest["quality"] }) {
  return quality === "good" ? (
    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      Good detail
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
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
        "inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 " +
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
        "inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
    />
  );
}

export function SourceBadge({ source }: { source: InformationRequest["source"] }) {
  if (source === "custom") {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
        Added by you
      </span>
    );
  }
  if (source === "follow-up") {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
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
    <div className="rounded-md border border-slate-200 p-4">
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
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <p className="text-sm font-medium text-slate-900">{request.title}</p>
      <p className="mt-1 text-xs text-slate-500">
        {request.authority} &middot; {request.period}
      </p>
      {request.context && (
        <p className="mt-2 border-l-2 border-orange-200 pl-2 text-xs text-slate-600">
          {request.context}
        </p>
      )}
      {request.basis && (
        <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
          <p className="flex items-center gap-1 font-medium text-slate-700">
            <BookOpen size={12} />
            Why ask for this
          </p>
          <p className="mt-1 italic">&ldquo;{request.basis.quote}&rdquo;</p>
          <a
            href={
              // A browser's PDF viewer opens at the page given after #page=.
              /\.pdf$/i.test(request.basis.url)
                ? `${request.basis.url}#page=${request.basis.page}`
                : request.basis.url
            }
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-blue-700 underline"
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
