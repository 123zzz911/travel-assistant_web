import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { components } from "../../shared/api-contracts";
import { AssistantApiError, sendAssistantMessage } from "./api";
import type { AssistantResponse } from "./api";
import "./assistant-panel.css";

type AssistantEvidence = components["schemas"]["AssistantEvidence"];
type CandidatePatch = components["schemas"]["CandidatePatch"];
type ChatMessage = components["schemas"]["ChatMessage"];
type DisplayTurn = {
  id: number;
  role: "user" | "assistant";
  text: string;
  response?: AssistantResponse;
  tripContext?: components["schemas"]["TripContext"];
  evidenceIds?: string[];
};

type AssistantPanelProps = {
  destinationName: string;
  startDate: string;
  endDate: string;
  evidence?: AssistantEvidence[];
  fetchImpl?: typeof fetch;
  onResponse?: (response: AssistantResponse) => void;
};

const PATCH_LABELS: Record<keyof CandidatePatch, string> = {
  destination: "目的地",
  start_date: "开始日期",
  end_date: "结束日期",
  travelers: "出行人数",
  budget_fen: "整趟总预算",
  interests: "兴趣偏好",
  pace: "出行节奏",
  transport_mode: "交通偏好",
};

function patchValue(key: keyof CandidatePatch, value: unknown): string {
  if (key === "budget_fen" && typeof value === "number") return `${(value / 100).toFixed(2)} 元`;
  if (key === "pace") return ({ relaxed: "轻松", balanced: "均衡", full: "紧凑" } as Record<string, string>)[String(value)] ?? String(value);
  if (key === "transport_mode") return ({ any: "不限", flight: "飞机", rail: "铁路", high_speed: "高铁" } as Record<string, string>)[String(value)] ?? String(value);
  if (Array.isArray(value)) return value.join("、");
  return String(value);
}

function patchRows(patch: CandidatePatch, context: components["schemas"]["TripContext"] | undefined) {
  return (Object.keys(patch) as (keyof CandidatePatch)[]).map((key) => {
    const proposed = patch[key];
    const current = context?.[key];
    return {
      key,
      label: PATCH_LABELS[key],
      current: current === undefined || current === null ? "未提供" : patchValue(key, current),
      proposed: proposed === undefined || proposed === null ? "未提供" : patchValue(key, proposed),
    };
  });
}

export function AssistantPanel({
  destinationName,
  startDate,
  endDate,
  evidence = [],
  fetchImpl = fetch,
  onResponse,
}: AssistantPanelProps) {
  const [turns, setTurns] = useState<DisplayTurn[]>([]);
  const [input, setInput] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const sequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const lastUserTurn = [...turns].reverse().find((turn) => turn.role === "user");

  useEffect(() => () => {
    sequence.current += 1;
    requestController.current?.abort();
  }, []);

  function toggleEvidence(id: string) {
    setSelectedEvidence((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  }

  async function sendMessage(message: string, retry = false) {
    const trimmed = message.trim();
    if (!trimmed || loading) return;
    const requestNumber = ++sequence.current;
    const contextEnabled = retry ? Boolean(lastUserTurn?.tripContext) : includeContext;
    const selectedIds = retry ? lastUserTurn?.evidenceIds ?? [] : selectedEvidence;
    const previousMessages: ChatMessage[] = turns
      .filter((turn) => !(retry && turn.id === lastUserTurn?.id))
      .map(({ role, text }) => ({ role, content: text }));
    const turnId = Date.now() + requestNumber;
    if (!retry) {
      const tripContext = contextEnabled
        ? {
          destination: destinationName,
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
        }
        : undefined;
      setTurns((current) => [...current, {
        id: turnId,
        role: "user",
        text: trimmed,
        tripContext,
        evidenceIds: [...selectedIds],
      }]);
      setInput("");
      setSelectedEvidence([]);
    }
    setError(null);
    setLoading(true);
    setUnconfigured(false);
    setIncludeContext(false);
    const controller = new AbortController();
    requestController.current = controller;
    const selectedForTurn = evidence.filter((item) => selectedIds.includes(item.evidence_id));
    try {
      const response = await sendAssistantMessage({
        message: trimmed,
        history: previousMessages,
        include_trip_context: contextEnabled,
        ...(contextEnabled ? { trip_context: {
          destination: destinationName,
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
        } } : {}),
        ...(selectedForTurn.length ? {
          evidence: selectedForTurn.map((item) => ({
            ...item,
            source: { ...item.source, evidence_state: "user_provided" as const },
          })),
        } : {}),
      }, fetchImpl, controller.signal);
      if (requestNumber !== sequence.current || controller.signal.aborted) return;
      if (response.state === "unconfigured") {
        setUnconfigured(true);
        setTurns((current) => current.filter((turn) => turn.id !== turnId));
        setInput(trimmed);
      } else {
        setTurns((current) => [...current, {
          id: turnId + 1,
          role: "assistant",
          text: response.state === "live" ? response.reply : response.message,
          response,
        }]);
        if (response.state !== "live") setError(response.message || "AI 助手请求失败。");
        onResponse?.(response);
      }
    } catch (reason) {
      if (requestNumber !== sequence.current || controller.signal.aborted) return;
      setError(reason instanceof AssistantApiError ? reason.message : "AI 助手请求失败，请检查连接后重试。");
      setInput(trimmed);
    } finally {
      if (requestNumber === sequence.current) {
        setLoading(false);
        requestController.current = null;
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <section className="assistant-page" aria-labelledby="assistant-title">
      <header className="assistant-heading">
        <div>
          <p className="assistant-eyebrow">TRAVEL ASSISTANT / 01</p>
          <h1 id="assistant-title">AI 旅行助手</h1>
          <p>回答旅行规划问题，或整理待确认的条件建议。</p>
        </div>
        <span className="assistant-session-note">对话仅保留在当前页面</span>
      </header>

      <div className="assistant-layout">
        <section className="assistant-conversation" aria-label="对话">
          {turns.length === 0 ? (
            <div className="assistant-empty">
              <span className="assistant-empty__index" aria-hidden="true">A1</span>
              <h2>今天想怎么规划？</h2>
              <p>可以询问路线安排、行程节奏或预算取舍。实时天气、班次和报价仅能依据已选择的数据回答。</p>
            </div>
          ) : (
            <ol className="assistant-turns" aria-live="polite">
              {turns.map((turn) => (
                <li className={`assistant-turn assistant-turn--${turn.role}`} key={turn.id}>
                  <span className="assistant-turn__label">{turn.role === "user" ? "你" : "行旅助手"}</span>
                  <p>{turn.text}</p>
                  {turn.response?.candidate_patch && (
                    <section className="assistant-patch" aria-label="待确认的条件建议">
                      <h3>待确认的条件建议</h3>
                      <dl>
                        {patchRows(turn.response.candidate_patch, turns.find((item) => item.role === "user" && item.id === turn.id - 1)?.tripContext).map((row) => (
                          <div key={row.key}>
                            <dt>{row.label}</dt>
                            <dd><span>{row.current}</span><span aria-hidden="true">→</span><strong>{row.proposed}</strong></dd>
                          </div>
                        ))}
                      </dl>
                      <p>建议尚未应用到行程。</p>
                    </section>
                  )}
                </li>
              ))}
            </ol>
          )}
          {loading && <p className="assistant-loading" role="status">正在整理回答…</p>}
          {unconfigured && <p className="assistant-state assistant-state--notice" role="status">AI 服务尚未配置，其他旅行工具仍可使用。</p>}
          {error && <div className="assistant-state assistant-state--error" role="alert"><span>{error}</span>{lastUserTurn && <button type="button" onClick={() => void sendMessage(lastUserTurn.text, true)} disabled={loading}>重试</button>}</div>}
        </section>

        <aside className="assistant-controls" aria-label="本轮发送设置">
          <label className="assistant-toggle">
            <input type="checkbox" checked={includeContext} onChange={(event) => setIncludeContext(event.target.checked)} />
            <span><strong>将当前行程条件用于本次回答</strong><small>{destinationName} · {startDate} 至 {endDate}</small></span>
          </label>
          {evidence.length > 0 && (
            <fieldset className="assistant-evidence">
              <legend>可附带的查询资料（发送后仍待核实）</legend>
              {evidence.map((item) => (
                <label key={item.evidence_id}>
                  <input type="checkbox" checked={selectedEvidence.includes(item.evidence_id)} onChange={() => toggleEvidence(item.evidence_id)} />
                  <span><strong>{item.source.display_name} · 用户提供，未核实</strong><small>{item.summary}</small></span>
                </label>
              ))}
            </fieldset>
          )}
          <section className="assistant-guide" aria-labelledby="assistant-guide-title">
            <h3 id="assistant-guide-title">助手口径</h3>
            <ul>
              <li><strong>只依据本轮信息</strong><span>未提供的天气、班次与报价不会自动补全。</span></li>
              <li><strong>建议不自动应用</strong><span>条件建议需要你另行确认。</span></li>
              <li><strong>仅当前页面</strong><span>对话与选择不会跨刷新保存。</span></li>
            </ul>
          </section>
        </aside>

        <form className="assistant-composer" onSubmit={submit}>
          <label htmlFor="assistant-message">发送给 AI 助手</label>
          <textarea
            id="assistant-message"
            value={input}
            maxLength={2_000}
            rows={3}
            placeholder="例如：两天行程怎样安排得轻松一些？"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            aria-describedby="assistant-input-help"
          />
          <div className="assistant-composer__footer">
            <p id="assistant-input-help">Enter 发送 · Shift+Enter 换行 · {input.length}/2000</p>
            {loading
              ? <button type="button" className="assistant-send assistant-send--secondary" onClick={() => requestController.current?.abort()}>取消等待</button>
              : <button type="submit" className="assistant-send" disabled={!input.trim()}>发送问题 <span aria-hidden="true">→</span></button>}
          </div>
        </form>
      </div>
    </section>
  );
}
