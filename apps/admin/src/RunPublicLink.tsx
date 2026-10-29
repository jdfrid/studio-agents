import { useState } from "react";

const SITE = "https://reelmino.com";

export function publicRunUrl(runId: string): string {
  return `${SITE}/runs/${runId}`;
}

/** The same run page a user opens from their job list. */
export function RunPublicLink({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false);
  const url = publicRunUrl(runId);

  return (
    <span className="run-public-url" onClick={(event) => event.stopPropagation()}>
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "הועתק" : "העתק"}
      </button>
    </span>
  );
}
