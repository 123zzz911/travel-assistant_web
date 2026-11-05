import type { components } from "../../shared/api-contracts";
import { WeatherApiError } from "./api";
import "./weather-panel.css";

type WeatherResult = components["schemas"]["WeatherResult"];
type WeatherDay = components["schemas"]["WeatherDay"];
type ResultState = components["schemas"]["ResultState"];

export type WeatherPanelState =
  | { status: "unconfigured" }
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: WeatherResult }
  | { status: "error"; error: WeatherApiError };

type WeatherPanelProps = { cityName: string; state: WeatherPanelState };

const weatherLabels: Record<number, string> = {
  0: "晴", 1: "大部晴朗", 2: "局部多云", 3: "阴", 45: "雾", 48: "雾凇",
  51: "小毛毛雨", 53: "毛毛雨", 55: "强毛毛雨", 61: "小雨", 63: "中雨",
  56: "冻毛毛雨", 57: "强冻毛毛雨", 65: "大雨", 66: "冻雨", 67: "强冻雨",
  71: "小雪", 73: "中雪", 75: "大雪", 77: "雪粒", 80: "小阵雨",
  81: "中阵雨", 82: "强阵雨", 85: "小阵雪", 86: "强阵雪", 95: "雷暴",
  96: "雷暴伴小冰雹", 99: "雷暴伴大冰雹",
};

const resultStateLabels: Record<ResultState, string> = {
  live: "预报数据已就绪", partial: "部分日期已覆盖", empty: "服务返回空数据",
  demo: "测试数据已载入", unconfigured: "天气服务尚未配置", no_coverage: "请求日期暂无覆盖",
  rate_limited: "查询暂受额度限制", unavailable: "天气服务暂不可用", policy_unavailable: "服务权限暂不可用",
};

function formatDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short", day: "numeric", weekday: "short", timeZone: "Asia/Shanghai",
  }).format(parsed);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai",
  }).format(parsed);
}

function metric(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? "暂无" : `${value}${unit}`;
}

function dayLabel(day: WeatherDay): string {
  if (day.weather_code === null || day.weather_code === undefined) return "天气现象待识别";
  return weatherLabels[day.weather_code] ?? `天气现象待识别（${day.weather_code}）`;
}

function coverageText(data: WeatherResult): string | null {
  const missing = data.coverage?.missing ?? [];
  if (missing.length === 0) return null;
  const dates = missing.map((range) => range.start === range.end
    ? formatDate(range.start)
    : `${formatDate(range.start)}至${formatDate(range.end)}`);
  return `以下日期暂无预报：${dates.join("、")}`;
}

function requestedRangeText(data: WeatherResult): string | null {
  const range = data.coverage?.requested;
  return range ? `查询范围：${formatDate(range.start)}至${formatDate(range.end)}` : null;
}

function successStateMessage(data: WeatherResult): string {
  if (data.state === "demo" && (data.coverage?.missing?.length ?? 0) > 0) {
    return "测试数据 · 部分日期已覆盖";
  }
  return resultStateLabels[data.state];
}

function stateMessage(state: WeatherPanelState): string {
  switch (state.status) {
    case "unconfigured": return resultStateLabels.unconfigured;
    case "idle": return "尚未查询天气";
    case "loading": return "正在读取天气预报";
    case "error": return state.error.message;
    case "success": return successStateMessage(state.data);
  }
}

function emptyResultMessage(data: WeatherResult): string {
  switch (data.state) {
    case "unconfigured": return "当前页面不会用演示数据或旧数据填补天气预报。";
    case "no_coverage": return "请求日期暂无可用天气预报，页面不会用历史或邻城数据补齐。";
    case "rate_limited": return "天气查询暂受额度限制，请稍后重试。";
    case "policy_unavailable": return "天气服务权限或政策暂不可用，请稍后再试。";
    case "unavailable": return "天气服务暂不可用，请稍后重试。";
    case "empty": return "天气服务未返回可展示的逐日记录。";
    default: return data.message || "暂无可展示的天气记录。";
  }
}

export function WeatherPanel({ cityName, state }: WeatherPanelProps) {
  const data = state.status === "success" ? state.data : null;
  const source = data?.sources?.[0];
  const missingText = data ? coverageText(data) : null;
  const requestedText = data ? requestedRangeText(data) : null;
  const items = data?.items ?? [];
  const displayStatus = state.status === "success" ? state.data.state : state.status;

  return (
    <section className="weather-panel" aria-labelledby="weather-panel-title" aria-busy={state.status === "loading"}>
      <div className="weather-panel__heading">
        <div>
          <p className="weather-panel__eyebrow">DAILY FORECAST</p>
          <h2 id="weather-panel-title">天气预报</h2>
          <p className="weather-panel__subtitle">{cityName} · 按北京时间展示</p>
        </div>
        <span className={`weather-panel__state weather-panel__state--${displayStatus}`} role="status" aria-live="polite">
          <span className="weather-panel__state-dot" aria-hidden="true" />
          {stateMessage(state)}
        </span>
      </div>

      {state.status === "loading" && (
        <div className="weather-panel__empty" aria-label="正在加载天气预报">
          <span className="weather-panel__loading-bar" aria-hidden="true" />
          <p>正在准备天气信息，请稍候。</p>
        </div>
      )}
      {state.status === "unconfigured" && (
        <div className="weather-panel__empty">
          <p className="weather-panel__empty-title">天气服务尚未配置</p>
          <p>当前页面不会用演示数据或旧数据填补天气预报。</p>
        </div>
      )}
      {state.status === "idle" && (
        <div className="weather-panel__empty">
          <p className="weather-panel__empty-title">等待天气查询</p>
          <p>调整日期后，请提交查询；页面不会保留与当前条件不一致的旧结果。</p>
        </div>
      )}
      {state.status === "error" && (
        <div className="weather-panel__empty weather-panel__empty--error" role="alert">
          <p className="weather-panel__empty-title">暂时无法读取天气</p>
          <p>{state.error.message}</p>
          {state.error.requestId && <small>请求编号：{state.error.requestId}</small>}
        </div>
      )}
      {state.status === "success" && data && (
        <>
          {requestedText && <p className="weather-panel__range">{requestedText}</p>}
          {missingText && <p className="weather-panel__coverage">{missingText}</p>}
          {items.length > 0 ? (
            <div className="weather-panel__days" aria-label={`${cityName}逐日天气`}>
              {items.map((day) => {
                const headingId = `weather-day-${day.date}`;
                return (
                  <article className="weather-day" key={day.date} aria-labelledby={headingId}>
                    <div className="weather-day__topline">
                      <time dateTime={day.date}>{formatDate(day.date)}</time>
                      <span className="weather-day__code">{day.weather_code ?? "—"}</span>
                    </div>
                    <h3 id={headingId}>{dayLabel(day)}</h3>
                    <div className="weather-day__temperature">
                      <strong>{metric(day.temperature_max_c, "°")}</strong>
                      <span> / {metric(day.temperature_min_c, "°")}</span>
                    </div>
                    <dl className="weather-day__metrics">
                      <div><dt>降水概率</dt><dd>{metric(day.precipitation_probability_max_pct, "%")}</dd></div>
                      <div><dt>降水量</dt><dd>{metric(day.precipitation_sum_mm, " mm")}</dd></div>
                      <div><dt>最大风速</dt><dd>{metric(day.wind_speed_10m_max_kmh, " km/h")}</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="weather-panel__empty weather-panel__empty--result" role="note">
              <p className="weather-panel__empty-title">{resultStateLabels[data.state]}</p>
              <p>{emptyResultMessage(data)}</p>
            </div>
          )}
          {source && (
            <p className="weather-panel__source">
              来源：{source.display_name}
              {source.evidence_state === "demo" ? "（测试 fixture）" : ""}
              {source.url && <>{" · "}<a href={source.url} target="_blank" rel="noreferrer">查看来源</a></>}
              {" · "}取数时间：{formatDateTime(source.retrieved_at)}
              {source.attribution ? ` · ${source.attribution}` : ""}
              {source.source_id === "open-meteo.forecast" && <>{" · "}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 许可</a></>}
            </p>
          )}
        </>
      )}
    </section>
  );
}

type WeatherSignalCardProps = {
  cityName: string;
  date: string;
  state: WeatherPanelState;
};

export function WeatherSignalCard({ cityName, date, state }: WeatherSignalCardProps) {
  const day = state.status === "success"
    ? state.data.items?.find((item) => item.date === date)
    : undefined;
  const title = state.status === "loading"
    ? "正在查询当天的天气…"
    : state.status === "error"
      ? "当天天气暂不可用"
      : state.status === "unconfigured"
        ? "等待选择目的城市"
        : day
          ? dayLabel(day)
          : "当天暂无预报";

  return (
    <aside className="hero__signal" aria-label={`${cityName}当天的天气摘要`} aria-busy={state.status === "loading"}>
      <span className="hero__signal-frame" aria-hidden="true" />
      <span className="hero__signal-tape" aria-hidden="true" />
      <div className="signal-card__topline">
        <span className="signal-card__label">{cityName} · 今日天气</span>
        <span className="signal-card__index" aria-hidden="true">{state.status === "success" ? (state.data.state === "demo" ? "测试" : "LIVE") : "01"}</span>
      </div>
      <p className="signal-card__quote" aria-live="polite">{title}</p>
      <p className="signal-card__date">{formatDate(date)} · 按北京时间</p>
      <div className="signal-card__rows">
        <div><span>最高 / 最低</span><strong>{metric(day?.temperature_max_c, "°")} / {metric(day?.temperature_min_c, "°")}</strong></div>
        <div><span>降水量 / 概率</span><strong>{metric(day?.precipitation_sum_mm, " mm")} / {metric(day?.precipitation_probability_max_pct, "%")}</strong></div>
        <div><span>最大风速</span><strong>{metric(day?.wind_speed_10m_max_kmh, " km/h")}</strong></div>
      </div>
      <p className="signal-card__note">
        {state.status === "error" ? state.error.message : day
          ? "天气数据来自当日预报；暂无的指标不会以零值代替。"
          : state.status === "loading"
            ? "正在读取所选城市的当天预报。"
            : "当天数据暂缺时会明确显示，不以其他日期或演示数据替代。"}
      </p>
    </aside>
  );
}


