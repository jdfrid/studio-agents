import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./api.js";

type NetworkView = {
  network: string;
  authKind: string;
  configured: boolean;
  missingEnv: string[];
  oauthCallbackUrl?: string | null;
};

type ConnectionView = {
  id: string;
  network: string;
  displayName: string;
  handle: string | null;
  status: string;
};

type DestinationView = {
  id: string;
  connectionId: string;
  network: string;
  kind: string;
  name: string;
  handle: string | null;
  isDefault: boolean;
  status: string;
};

type JobView = {
  id: string;
  destinationName?: string;
  network?: string;
  status: string;
  remoteUrl: string | null;
  lastError: string | null;
  createdAt: string;
};

type RuleView = {
  enabled: boolean;
  destinationIds: string[];
  requireApproval: boolean;
};

type RunSummary = { id: string; title: string; status: string };

function oauthPathNetwork(): string | null {
  const path = window.location.pathname.replace(/\/+$/, "");
  const match = path.match(/^\/distribution\/oauth\/([^/]+)\/callback$/);
  return match?.[1] ?? null;
}

function clearDistributionQuery(): void {
  window.history.replaceState({}, "", "/distribution");
}

function oauthResultMessage(
  t: (key: string, options?: { error?: string; network?: string }) => string,
  error: string | null,
  connected: string | null
): string {
  if (error === "oauth_retry" || error === "missing_code") return t("distribution.oauthRetry");
  if (error === "access_denied") return t("distribution.oauthDenied");
  if (error && /redirect_uri/i.test(error)) return t("distribution.oauthRedirectMismatch");
  if (error) return t("distribution.oauthError", { error });
  if (connected) return t("distribution.oauthOk", { network: connected });
  return "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function DistributionPage() {
  const { t } = useTranslation();
  const [networks, setNetworks] = useState<NetworkView[]>([]);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [destinations, setDestinations] = useState<DestinationView[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [rule, setRule] = useState<RuleView>({ enabled: false, destinationIds: [], requireApproval: true });
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [telegramConnectionId, setTelegramConnectionId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [link, setLink] = useState("");
  const [runId, setRunId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([]);
  const [mode, setMode] = useState<"now" | "schedule" | "draft">("now");
  const [confirmLossy, setConfirmLossy] = useState(false);
  const [previews, setPreviews] = useState<Array<{ destination: DestinationView; preview: { accepted: boolean; lossy: boolean; warnings: string[]; errors: string[]; nativeCopy: { caption?: string; title?: string } } }>>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const oauthHandled = useRef(false);

  const refresh = useCallback(async () => {
    const [n, c, d, j, r, ruleRow] = await Promise.all([
      apiGet<NetworkView[]>("/distribution/networks"),
      apiGet<ConnectionView[]>("/distribution/connections"),
      apiGet<DestinationView[]>("/distribution/destinations"),
      apiGet<JobView[]>("/distribution/jobs"),
      apiGet<RunSummary[]>("/runs").catch(() => []),
      apiGet<RuleView>("/distribution/rules")
    ]);
    setNetworks(n);
    setConnections(c);
    setDestinations(d);
    setJobs(j);
    setRuns(r.filter((item) => item.status === "COMPLETED"));
    setRule(ruleRow);
    const telegram = c.find((item) => item.network === "telegram");
    if (telegram) setTelegramConnectionId(telegram.id);
  }, []);

  useEffect(() => {
    void refresh().catch((err) => setMessage((err as Error).message));
    if (oauthHandled.current) return;
    oauthHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const pathNetwork = oauthPathNetwork();
    if (pathNetwork && code && state) {
      void apiPost(`/distribution/oauth/${pathNetwork}/complete`, { code, state })
        .then(async () => {
          clearDistributionQuery();
          setMessage(t("distribution.oauthOk", { network: pathNetwork }));
          await refresh();
        })
        .catch((err) => setMessage((err as Error).message));
      return;
    }
    const next = oauthResultMessage(t, params.get("error"), params.get("connected"));
    if (next) {
      setMessage(next);
      clearDistributionQuery();
    }
  }, [refresh, t]);

  async function connectOAuth(network: string) {
    setBusy(network);
    try {
      const { authorizeUrl } = await apiPost<{ authorizeUrl: string }>(`/distribution/connections/${network}/start`);
      window.location.href = authorizeUrl;
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function connectTelegram() {
    setBusy("telegram");
    try {
      await apiPost("/distribution/connections/telegram", { botToken });
      setBotToken("");
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function addTelegramChat() {
    if (!telegramConnectionId || !chatId) return;
    setBusy("chat");
    try {
      await apiPost(`/distribution/connections/${telegramConnectionId}/telegram/chats`, { chatId });
      setChatId("");
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function preview() {
    setBusy("preview");
    try {
      const media = file
        ? [
            {
              kind: file.type.startsWith("video/") ? "video" : "image",
              gcsPath: `local/${file.name}`,
              mimeType: file.type || "application/octet-stream",
              filename: file.name,
              sizeBytes: file.size
            }
          ]
        : [];
      const result = await apiPost<typeof previews>("/distribution/packages/preview", {
        destinationIds: selectedDestinations,
        copy: {
          title,
          body,
          hashtags: hashtags.split(",").map((tag) => tag.trim()).filter(Boolean),
          link: link || undefined
        },
        media
      });
      setPreviews(result);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    setBusy("publish");
    try {
      const media = [];
      if (file) {
        media.push({
          base64: await fileToBase64(file),
          filename: file.name,
          mimeType: file.type || "application/octet-stream"
        });
      }
      await apiPost("/distribution/packages", {
        source: "manual",
        runId: runId || undefined,
        destinationIds: selectedDestinations,
        mode,
        confirmLossy,
        copy: {
          title,
          body,
          hashtags: hashtags.split(",").map((tag) => tag.trim()).filter(Boolean),
          link: link || undefined
        },
        media
      });
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  function toggleDestination(id: string) {
    setSelectedDestinations((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="distribution-page">
      <header className="page-heading">
        <p className="eyebrow">{t("distribution.eyebrow")}</p>
        <h1>{t("distribution.title")}</h1>
        <p className="muted">{t("distribution.description")}</p>
      </header>
      {message ? <p className="warn-inline">{message}</p> : null}

      <section className="panel">
        <h2>{t("distribution.networks")}</h2>
        <div className="distribution-grid">
          {networks.map((network) => (
            <article key={network.network} className="stage-card">
              <strong>{network.network}</strong>
              <small className="muted">{network.authKind}</small>
              {network.network === "telegram" ? (
                <>
                  <input
                    type="password"
                    placeholder={t("distribution.botToken")}
                    value={botToken}
                    onChange={(event) => setBotToken(event.target.value)}
                  />
                  <button type="button" className="primary" disabled={busy === "telegram"} onClick={() => void connectTelegram()}>
                    {t("distribution.saveBot")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="primary"
                    disabled={!network.configured || Boolean(busy)}
                    onClick={() => void connectOAuth(network.network)}
                  >
                    {network.configured ? t("distribution.connect") : t("distribution.notConfigured")}
                  </button>
                  {network.configured && network.oauthCallbackUrl ? (
                    <p className="muted" style={{ marginTop: 8, wordBreak: "break-all" }}>
                      {t("distribution.oauthCallbackHint")}
                      <br />
                      <code>{network.oauthCallbackUrl}</code>
                    </p>
                  ) : null}
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>{t("distribution.connections")}</h2>
        {connections.length === 0 ? <p className="muted">{t("distribution.noConnections")}</p> : null}
        <ul className="distribution-list">
          {connections.map((connection) => (
            <li key={connection.id}>
              <span>
                <strong>{connection.displayName}</strong> · {connection.network} · {connection.status}
              </span>
              <span className="stage-actions">
                <button type="button" onClick={() => void apiPost(`/distribution/connections/${connection.id}/sync`).then(refresh)}>
                  {t("distribution.sync")}
                </button>
                <button
                  type="button"
                  onClick={() => void apiDelete(`/distribution/connections/${connection.id}`).then(refresh)}
                >
                  {t("distribution.disconnect")}
                </button>
              </span>
            </li>
          ))}
        </ul>
        {telegramConnectionId ? (
          <div className="stage-actions" style={{ marginTop: 12 }}>
            <input
              placeholder={t("distribution.chatId")}
              value={chatId}
              onChange={(event) => setChatId(event.target.value)}
            />
            <button type="button" onClick={() => void addTelegramChat()}>
              {t("distribution.addChat")}
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>{t("distribution.destinations")}</h2>
        {destinations.length === 0 ? <p className="muted">{t("distribution.noDestinations")}</p> : null}
        <ul className="distribution-list">
          {destinations.map((destination) => (
            <li key={destination.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedDestinations.includes(destination.id)}
                  onChange={() => toggleDestination(destination.id)}
                />{" "}
                {destination.name} · {destination.network}/{destination.kind}
                {destination.isDefault ? ` · ${t("distribution.default")}` : ""}
              </label>
              <button
                type="button"
                onClick={() =>
                  void apiPatch(`/distribution/destinations/${destination.id}`, {
                    status: destination.status === "paused" ? "active" : "paused"
                  }).then(refresh)
                }
              >
                {destination.status === "paused" ? t("distribution.resume") : t("distribution.pause")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>{t("distribution.compose")}</h2>
        <div className="new-run-form">
          <label>
            {t("distribution.titleLabel")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            {t("distribution.bodyLabel")}
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} />
          </label>
          <label>
            {t("distribution.hashtags")}
            <input value={hashtags} onChange={(event) => setHashtags(event.target.value)} />
          </label>
          <label>
            {t("distribution.link")}
            <input value={link} onChange={(event) => setLink(event.target.value)} />
          </label>
          <label>
            {t("distribution.fromRun")}
            <select value={runId} onChange={(event) => setRunId(event.target.value)}>
              <option value="">{t("distribution.none")}</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("distribution.media")}
            <input type="file" accept="video/*,image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label>
            {t("distribution.mode")}
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="now">{t("distribution.now")}</option>
              <option value="draft">{t("distribution.draft")}</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={confirmLossy} onChange={(event) => setConfirmLossy(event.target.checked)} />{" "}
            {t("distribution.confirmLossy")}
          </label>
          <div className="stage-actions">
            <button type="button" disabled={!selectedDestinations.length || Boolean(busy)} onClick={() => void preview()}>
              {t("distribution.preview")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!selectedDestinations.length || Boolean(busy)}
              onClick={() => void publish()}
            >
              {t("distribution.publish")}
            </button>
          </div>
        </div>
        {previews.length ? (
          <ul className="distribution-list">
            {previews.map((item) => (
              <li key={item.destination.id}>
                <span>
                  {item.destination.name}: {item.preview.accepted ? "ok" : item.preview.errors.join(", ")}
                  {item.preview.lossy ? " · lossy" : ""}
                  <br />
                  <small>{item.preview.nativeCopy.title || item.preview.nativeCopy.caption}</small>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel">
        <h2>{t("distribution.automation")}</h2>
        <label>
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(event) => setRule((current) => ({ ...current, enabled: event.target.checked }))}
          />{" "}
          {t("distribution.autoEnable")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={rule.requireApproval}
            onChange={(event) => setRule((current) => ({ ...current, requireApproval: event.target.checked }))}
          />{" "}
          {t("distribution.requireApproval")}
        </label>
        <p className="muted">{t("distribution.selectDestinations")}</p>
        <button
          type="button"
          onClick={() =>
            void apiPut("/distribution/rules", {
              ...rule,
              destinationIds: selectedDestinations
            }).then((row) => setRule(row as RuleView))
          }
        >
          {t("distribution.saveRule")}
        </button>
      </section>

      <section className="panel">
        <h2>{t("distribution.jobs")}</h2>
        <ul className="distribution-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <span>
                {job.destinationName || job.id} · {job.network} · {job.status}
                {job.lastError ? ` · ${job.lastError}` : ""}
                {job.remoteUrl ? (
                  <>
                    {" "}
                    <a href={job.remoteUrl} target="_blank" rel="noreferrer">
                      link
                    </a>
                  </>
                ) : null}
              </span>
              <span className="stage-actions">
                {job.status === "needs_review" ? (
                  <button type="button" onClick={() => void apiPost(`/distribution/jobs/${job.id}/confirm`).then(refresh)}>
                    {t("distribution.confirm")}
                  </button>
                ) : null}
                {job.status === "failed" ? (
                  <button type="button" onClick={() => void apiPost(`/distribution/jobs/${job.id}/retry`).then(refresh)}>
                    {t("distribution.retry")}
                  </button>
                ) : null}
                {job.status === "queued" || job.status === "needs_review" ? (
                  <button type="button" onClick={() => void apiPost(`/distribution/jobs/${job.id}/cancel`).then(refresh)}>
                    {t("distribution.cancel")}
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
