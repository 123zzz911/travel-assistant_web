import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { fetchWeatherForecast, WeatherApiError, type WeatherQuery } from "./features/weather/api";
import { WeatherPanel, WeatherSignalCard, type WeatherPanelState } from "./features/weather/WeatherPanel";
import { BudgetPanel } from "./features/budget/BudgetPanel";
import { TransportPanel } from "./features/transport/TransportPanel";
import { ItineraryPanel } from "./features/itinerary/ItineraryPanel";
import { AssistantPanel } from "./features/assistant/AssistantPanel";
import { ChecklistPanel } from "./features/checklist/ChecklistPanel";
import { NotesPanel } from "./features/notes/NotesPanel";
import type { PlaceRef } from "./features/transport/api";
import type { components } from "./shared/api-contracts";
import "./app.css";

type CityOption = {
  id: WeatherQuery["city_id"];
  name: string;
  province: string;
};

const CITY_OPTIONS: CityOption[] = [
  { id: "shanghai", name: "上海", province: "上海市" },
  { id: "suzhou", name: "苏州", province: "江苏省" },
  { id: "wuxi", name: "无锡", province: "江苏省" },
  { id: "jiaxing", name: "嘉兴", province: "浙江省" },
  { id: "hangzhou", name: "杭州", province: "浙江省" },
];

function formatBeijingDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function beijingDateInputValue(): string {
  return formatBeijingDate(new Date());
}

function requestedDays(startDate: string, endDate: string): number | null {
  const start = new Date(`${startDate}T00:00:00+08:00`);
  const end = new Date(`${endDate}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function safeWeatherError(error: unknown): WeatherApiError {
  if (error instanceof WeatherApiError) return error;
  return new WeatherApiError("天气服务暂不可用。", {
    code: "PROVIDER_UNAVAILABLE",
    retryable: true,
    status: 0,
  });
}

export function App() {
  const [activeView, setActiveView] = useState<"weather" | "budget" | "transport" | "itinerary" | "checklist" | "notes" | "assistant">("weather");
  const [selectedDestinationId, setSelectedDestinationId] = useState("");
  const [selectedOriginId, setSelectedOriginId] = useState("current");
  const [customOrigin, setCustomOrigin] = useState("");
  const [originPlace, setOriginPlace] = useState<PlaceRef>({
    display_name: "当前位置",
    coordinate_system: "WGS84",
  });
  const [originLocationStatus, setOriginLocationStatus] = useState<"idle" | "loading" | "resolved" | "error">("idle");
  const [destination, setDestination] = useState<CityOption | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [showDestinationDialog, setShowDestinationDialog] = useState(false);
  const [destinationDialogAction, setDestinationDialogAction] = useState<"change" | "return">("change");
  const destinationDialogRef = useRef<HTMLDialogElement>(null);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const defaultStartDate = useMemo(() => beijingDateInputValue(), []);
  const activeRequest = useRef(0);
  const originRequest = useRef(0);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultStartDate);
  const [formError, setFormError] = useState<string | null>(null);
  const [weatherState, setWeatherState] = useState<WeatherPanelState>({ status: "unconfigured" });
  const [todayWeatherState, setTodayWeatherState] = useState<WeatherPanelState>({ status: "unconfigured" });

  const rangeDays = requestedDays(startDate, endDate);
  const assistantEvidence: components["schemas"]["AssistantEvidence"][] =
    weatherState.status === "success" &&
    (weatherState.data.state === "live" || weatherState.data.state === "partial")
      ? (weatherState.data.sources ?? [])
        .filter((source) => source.evidence_state === "verified")
        .map((source) => ({
          evidence_id: `weather:${weatherState.data.request_id}:${source.source_id}`,
          kind: "weather" as const,
          state: weatherState.data.state as "live" | "partial",
          summary: (weatherState.data.items ?? []).map((day) =>
            `${day.date}: ${day.weather_code === null ? "天气现象待识别" : `天气代码 ${day.weather_code}`}，` +
            `最高 ${day.temperature_max_c ?? "暂无"}°C，最低 ${day.temperature_min_c ?? "暂无"}°C，` +
            `降水 ${day.precipitation_sum_mm ?? "暂无"} mm`,
          ).join("；").slice(0, 2_000),
          source,
        }))
      : [];

  useEffect(() => {
    const dialog = destinationDialogRef.current;
    if (!dialog) return;
    if (showDestinationDialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!showDestinationDialog && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [showDestinationDialog]);

  useEffect(() => {
    if (!destination) return;
    const requestNumber = ++activeRequest.current;
    void fetchWeatherForecast({
      city_id: destination.id,
      start_date: defaultStartDate,
      end_date: defaultStartDate,
    }).then((data) => {
      if (activeRequest.current === requestNumber) {
        setWeatherState({ status: "success", data });
        setTodayWeatherState({ status: "success", data });
      }
    }).catch((error: unknown) => {
      if (activeRequest.current === requestNumber) {
        const safeError = safeWeatherError(error);
        setWeatherState({ status: "error", error: safeError });
        setTodayWeatherState({ status: "error", error: safeError });
      }
    });
  }, [destination, defaultStartDate]);

  function locateCurrentOrigin() {
    const requestNumber = ++originRequest.current;
    setOriginLocationStatus("loading");
    setOriginPlace({ display_name: "当前位置", coordinate_system: "WGS84" });
    if (!navigator.geolocation) {
      setOriginLocationStatus("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (originRequest.current !== requestNumber) return;
        setOriginPlace({
          display_name: "当前位置",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          coordinate_system: "WGS84",
        });
        setOriginLocationStatus("resolved");
      },
      () => {
        if (originRequest.current !== requestNumber) return;
        setOriginLocationStatus("error");
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  }

  function startWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = CITY_OPTIONS.find((city) => city.id === selectedDestinationId);
    if (!selected) {
      setDestinationError("请选择目的城市。");
      return;
    }
    const selectedOrigin = CITY_OPTIONS.find((city) => city.id === selectedOriginId);
    if (selectedOriginId === "custom" && !customOrigin.trim()) {
      setDestinationError("请输入出发地点，或选择当前位置和已登记城市。");
      return;
    }
    originRequest.current += 1;
    if (selectedOriginId === "current") {
      setOriginPlace({ display_name: "当前位置", coordinate_system: "WGS84" });
      locateCurrentOrigin();
    } else if (selectedOrigin) {
      setOriginPlace({ display_name: selectedOrigin.name, coordinate_system: "WGS84" });
      setOriginLocationStatus("idle");
    } else {
      setOriginPlace({ display_name: customOrigin.trim(), coordinate_system: "WGS84" });
      setOriginLocationStatus("idle");
    }
    setWeatherState({ status: "loading" });
    setTodayWeatherState({ status: "loading" });
    setDestination(selected);
    setDestinationError(null);
  }

  function resetWorkspaceState() {
    activeRequest.current += 1;
    originRequest.current += 1;
    setWorkspaceKey((key) => key + 1);
    setStartDate(defaultStartDate);
    setEndDate(defaultStartDate);
    setWeatherState({ status: "unconfigured" });
    setFormError(null);
    setActiveView("weather");
    setShowDestinationDialog(false);
    setDestinationError(null);
  }

  function confirmDestinationAction() {
    if (destinationDialogAction === "return") {
      resetWorkspaceState();
      setSelectedDestinationId("");
      setDestination(null);
      return;
    }
    const selected = CITY_OPTIONS.find((city) => city.id === selectedDestinationId);
    if (!selected) {
      setDestinationError("请选择目的城市。");
      return;
    }
    const selectedOrigin = CITY_OPTIONS.find((city) => city.id === selectedOriginId);
    if (selectedOriginId === "custom" && !customOrigin.trim()) {
      setDestinationError("请输入出发地点，或选择当前位置和已登记城市。");
      return;
    }
    originRequest.current += 1;
    if (selectedOriginId === "current") {
      setOriginPlace({ display_name: "当前位置", coordinate_system: "WGS84" });
      setOriginLocationStatus("idle");
    } else if (selectedOrigin) {
      setOriginPlace({ display_name: selectedOrigin.name, coordinate_system: "WGS84" });
      setOriginLocationStatus("idle");
    } else {
      setOriginPlace({ display_name: customOrigin.trim(), coordinate_system: "WGS84" });
      setOriginLocationStatus("idle");
    }
    setTodayWeatherState({ status: "loading" });
    setDestination(selected);
    resetWorkspaceState();
    setWeatherState({ status: "loading" });
    if (selectedOriginId === "current") locateCurrentOrigin();
  }

  function clearPreviousForecast() {
    activeRequest.current += 1;
    setFormError(null);
    setWeatherState({ status: "idle" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestNumber = ++activeRequest.current;
    setFormError(null);
    setWeatherState({ status: "idle" });

    if (!startDate || !endDate) {
      setFormError("请选择开始日期和结束日期。");
      return;
    }
    if (rangeDays === null) {
      setFormError("请输入有效的日期范围。");
      return;
    }
    if (rangeDays < 1) {
      setFormError("结束日期不能早于开始日期。");
      return;
    }
    if (rangeDays > 16) {
      setFormError("单次最多查询 16 个当地日，请缩短日期范围。");
      return;
    }

    const query: WeatherQuery = {
      city_id: destination!.id,
      start_date: startDate,
      end_date: endDate,
    };

    setWeatherState({ status: "loading" });
    try {
      const data = await fetchWeatherForecast(query);
      if (activeRequest.current === requestNumber) {
        setWeatherState({ status: "success", data });
      }
    } catch (error) {
      if (activeRequest.current === requestNumber) {
        setWeatherState({ status: "error", error: safeWeatherError(error) });
      }
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#app-content">跳转到主要内容</a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="行旅智能旅游助手首页">
          <span className="brand__mark" aria-hidden="true">行</span>
          <span>
            <span className="brand__name">行旅</span>
            <span className="brand__tagline">智能旅游助手</span>
          </span>
        </a>
        <div className="header-note">
          <span className="header-note__dot" aria-hidden="true" />
          本地开发预览
        </div>
      </header>

      <main className="app-main" id="app-content">
        {!destination ? (
          <section className="destination-setup" aria-labelledby="destination-setup-title">
            <div className="destination-setup__intro">
              <p className="eyebrow">TRAVEL WORKSPACE / SETUP</p>
              <h1 id="destination-setup-title">先选好目的地与出发地</h1>
              <p className="destination-setup__copy">出发地默认尝试使用当前位置，也可以改选城市或输入地点。</p>
              <ol className="destination-setup__steps" aria-label="开始流程">
                <li><span>01</span><strong>选择城市</strong></li>
                <li><span>02</span><strong>确认出发地</strong></li>
                <li><span>03</span><strong>进入工作区</strong></li>
              </ol>
            </div>
            <form className="destination-setup__form" onSubmit={startWorkspace}>
              <label className="field">
                <span className="field__label">目的城市</span>
                <select value={selectedDestinationId} onChange={(event) => { setSelectedDestinationId(event.target.value); setDestinationError(null); }} aria-describedby={destinationError ? "destination-error" : undefined}>
                  <option value="">请选择</option>
                  {CITY_OPTIONS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">出发地点</span>
                <select value={selectedOriginId} onChange={(event) => {
                  setSelectedOriginId(event.target.value);
                  setDestinationError(null);
                }}>
                  <option value="current">当前位置（默认）</option>
                  {CITY_OPTIONS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                  <option value="custom">自定义地点</option>
                </select>
              </label>
              {selectedOriginId === "custom" && <label className="field">
                <span className="field__label">自定义出发地点</span>
                <input value={customOrigin} maxLength={240} onChange={(event) => setCustomOrigin(event.target.value)} placeholder="例如：上海虹桥站" />
              </label>}
              {selectedOriginId === "current" && <p className="form-help">开始规划时会请求浏览器定位权限；拒绝定位后，可在交通查询中手动填写起点。</p>}
              {destinationError && <p id="destination-error" className="form-error" role="alert">{destinationError}</p>}
              <button className="primary-button" type="submit">开始规划 <span aria-hidden="true">→</span></button>
            </form>
            <aside className="destination-index" aria-label="已登记城市目录">
              <header className="destination-index__head">
                <span className="destination-index__kicker">CITY INDEX</span>
                <span className="destination-index__count">05 个已登记城市</span>
              </header>
              <ul>
                {CITY_OPTIONS.map((city, index) => (
                  <li key={city.id}>
                    <span className="destination-index__no">{String(index + 1).padStart(2, "0")}</span>
                    <strong>{city.name}</strong>
                    <span className="destination-index__province">{city.province}</span>
                  </li>
                ))}
              </ul>
              <p className="destination-index__note">天气、交通与预算仅按已登记城市查询，未登记地点暂不开放。</p>
            </aside>
            <section className="destination-setup__modules" aria-labelledby="setup-modules-title">
              <div className="destination-setup__modules-head">
                <div>
                  <p className="eyebrow">WORKSPACE / 07 MODULES</p>
                  <h2 id="setup-modules-title">进入工作区后可以做什么</h2>
                </div>
                <p>所有模块共用同一目的地与日期，切换工具不会重复请求数据。</p>
              </div>
              <ul className="module-grid">
                <li>
                  <span className="module-card__no">01</span>
                  <strong>天气</strong>
                  <p>查询已登记城市的逐日预报，缺失日期会明确标注，不用演示数据补齐。</p>
                </li>
                <li>
                  <span className="module-card__no">02</span>
                  <strong>预算</strong>
                  <p>用整趟总额与费用明细计算结余；留空表示待核实，不等于 0 元。</p>
                </li>
                <li>
                  <span className="module-card__no">03</span>
                  <strong>交通</strong>
                  <p>班次票价与市内路线分开查询，未知金额与未核实路线保持待核实状态。</p>
                </li>
                <li>
                  <span className="module-card__no">04</span>
                  <strong>行程</strong>
                  <p>按天添加安排并可锁定，草稿只保存在当前页面，不连接订票或地图服务。</p>
                </li>
                <li>
                  <span className="module-card__no">05</span>
                  <strong>清单</strong>
                  <p>按证件、衣物、电子与应急分类勾选，进度只保存在当前页面。</p>
                </li>
                <li>
                  <span className="module-card__no">06</span>
                  <strong>笔记</strong>
                  <p>随手记录想法与待确认信息，笔记不会上传，也不会跨刷新保留。</p>
                </li>
                <li>
                  <span className="module-card__no">07</span>
                  <strong>AI 助手</strong>
                  <p>只依据本轮明确提供的信息回答，条件建议需要你另行确认后才会应用。</p>
                </li>
              </ul>
            </section>
          </section>
        ) : (
          <>
            <section className="workspace-bar" aria-label="当前旅行工作区">
              <div className="workspace-bar__route">
                <div className="workspace-chip">
                  <span className="workspace-chip__label">出发地</span>
                  <strong className="workspace-origin">{originPlace.display_name}</strong>
                  {originLocationStatus !== "idle" && (
                    <span className="workspace-origin__status" aria-live="polite">{originLocationStatus === "loading" ? "正在定位" : originLocationStatus === "error" ? "定位失败，可手动修改" : "定位完成"}</span>
                  )}
                </div>
                <span className="workspace-bar__arrow" aria-hidden="true">→</span>
                <div className="workspace-chip">
                  <span className="workspace-chip__label">目的地</span>
                  <strong className="workspace-destination">{destination.name}</strong>
                  <span className="workspace-chip__meta">{destination.province}</span>
                </div>
              </div>
              <div className="workspace-bar__meta">
                <span className="workspace-bar__range">{startDate} → {endDate}</span>
                <span className="workspace-bar__days">{rangeDays !== null && rangeDays > 0 ? `${rangeDays} 天` : "日期待确认"}</span>
              </div>
              <div className="workspace-bar__actions">
                <button type="button" className="workspace-change" onClick={() => { setDestinationDialogAction("change"); setSelectedDestinationId(destination.id); setShowDestinationDialog(true); }}>更换目的地</button>
                <button type="button" className="workspace-change" onClick={() => { setDestinationDialogAction("return"); setSelectedDestinationId(""); setShowDestinationDialog(true); }}>返回选择城市</button>
              </div>
            </section>
            <div className="workspace-hint">
              <span className="workspace-hint__tag">当前工作区</span>
              <span className="workspace-hint__text">{destination.name} · {startDate} 至 {endDate}{rangeDays !== null && rangeDays > 0 ? ` · ${rangeDays} 天` : ""}</span>
              <span className="workspace-hint__note">七个模块共享同一目的地与日期；切换工具不会重复请求数据。</span>
            </div>
            <div className="feature-nav__bar">
              <nav className="feature-nav" aria-label="旅行工具">
                <button type="button" aria-pressed={activeView === "weather"} onClick={() => setActiveView("weather")}>
                  <span className="feature-nav__icon" aria-hidden="true">☁</span>
                  <span className="feature-nav__text"><strong>天气</strong><small aria-hidden="true">WEATHER</small></span>
                </button>
                <button type="button" aria-pressed={activeView === "budget"} onClick={() => setActiveView("budget")}>
                  <span className="feature-nav__icon" aria-hidden="true">¥</span>
                  <span className="feature-nav__text"><strong>预算</strong><small aria-hidden="true">BUDGET</small></span>
                </button>
                <button type="button" aria-pressed={activeView === "transport"} onClick={() => setActiveView("transport")}>
                  <span className="feature-nav__icon" aria-hidden="true">⇄</span>
                  <span className="feature-nav__text"><strong>交通</strong><small aria-hidden="true">TRANSPORT</small></span>
                </button>
                <button type="button" aria-pressed={activeView === "itinerary"} onClick={() => setActiveView("itinerary")}>
                  <span className="feature-nav__icon" aria-hidden="true">☰</span>
                  <span className="feature-nav__text"><strong>行程</strong><small aria-hidden="true">ITINERARY</small></span>
                </button>
                <button type="button" aria-pressed={activeView === "checklist"} onClick={() => setActiveView("checklist")}>
                  <span className="feature-nav__icon" aria-hidden="true">✓</span>
                  <span className="feature-nav__text"><strong>清单</strong><small aria-hidden="true">CHECKLIST</small></span>
                </button>
                <button type="button" aria-pressed={activeView === "notes"} onClick={() => setActiveView("notes")}>
                  <span className="feature-nav__icon" aria-hidden="true">✎</span>
                  <span className="feature-nav__text"><strong>笔记</strong><small aria-hidden="true">NOTES</small></span>
                </button>
                <button type="button" aria-pressed={activeView === "assistant"} onClick={() => setActiveView("assistant")}>
                  <span className="feature-nav__icon" aria-hidden="true">✦</span>
                  <span className="feature-nav__text"><strong>AI 助手</strong><small aria-hidden="true">ASSISTANT</small></span>
                </button>
              </nav>
              <p className="feature-nav__caption">WORKSPACE / 07 MODULES</p>
            </div>
            <dialog
              ref={destinationDialogRef}
              className="destination-dialog"
              aria-modal="true"
              aria-labelledby="destination-dialog-title"
              aria-describedby="destination-dialog-description"
              onCancel={(event) => { event.preventDefault(); setShowDestinationDialog(false); setDestinationError(null); }}
            >
                  <h2 id="destination-dialog-title">{destinationDialogAction === "return" ? "返回选择城市？" : "更换目的地？"}</h2>
                  <p id="destination-dialog-description">确认后将清除本页预算草稿、天气查询条件与结果，以及交通、清单与笔记状态。</p>
                  {destinationDialogAction === "change" && <label className="field">
                    <span className="field__label">新目的城市</span>
                    <select autoFocus value={selectedDestinationId} onChange={(event) => { setSelectedDestinationId(event.target.value); setDestinationError(null); }}>
                      {CITY_OPTIONS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </label>}
                  {destinationError && <p className="form-error" role="alert">{destinationError}</p>}
                  <div className="destination-dialog__actions">
                    <button type="button" className="workspace-change" onClick={() => { setShowDestinationDialog(false); setDestinationError(null); }}>取消</button>
                    <button type="button" className="primary-button" onClick={confirmDestinationAction}>{destinationDialogAction === "return" ? "确认返回" : "确认更换"}</button>
                  </div>
            </dialog>
            <div className="workspace-view" hidden={activeView !== "weather"}>
        <section className="hero" aria-labelledby="page-title">
          <div className="hero__copy">
            <p className="eyebrow">TRAVEL WEATHER / 01</p>
            <h1 id="page-title">从一座城市，开始规划一段旅程。</h1>
            <p className="hero__description">
              先确认出发日的天气节奏，再决定路线的轻重缓急。这里展示的是可追溯的逐日预报，不用演示数据掩盖未知。
            </p>
            <div className="hero__facts" aria-label="天气查询能力说明">
              <span><strong>5</strong> 个已注册城市</span>
              <span><strong>16</strong> 天单次上限</span>
              <span>北京时间展示</span>
            </div>
          </div>
          <WeatherSignalCard cityName={destination.name} date={defaultStartDate} state={todayWeatherState} />
        </section>

        <section className="query-card" id="weather-query" aria-labelledby="weather-query-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">01 / QUERY</p>
              <h2 id="weather-query-title">查询一段天气</h2>
            </div>
            <p className="section-heading__aside">单城 · 明确日期 · 不自动补齐</p>
          </div>

          <form className="query-form" onSubmit={handleSubmit} noValidate>
            <div className="query-form__fields">
              <label className="field">
                <span className="field__label">开始日期</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    clearPreviousForecast();
                  }}
                  aria-describedby="date-help"
                />
              </label>
              <label className="field">
                <span className="field__label">结束日期</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    clearPreviousForecast();
                  }}
                  aria-describedby="date-help"
                />
              </label>
            </div>
            <div className="query-form__footer">
              <p id="date-help" className="form-help">
                最多查询 16 个当地日 · 以 Asia/Shanghai 解释业务日期
                {rangeDays !== null && rangeDays > 0 && rangeDays <= 16 ? ` · 当前 ${rangeDays} 天` : ""}
              </p>
              <button className="primary-button" type="submit" disabled={weatherState.status === "loading"}>
                <span>{weatherState.status === "loading" ? "正在查询" : "查询天气"}</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
          </form>
        </section>

        <section className="weather-notes" aria-labelledby="weather-notes-title">
          <div className="weather-notes__head">
            <div>
              <p className="section-kicker">02 / READ THE DATA</p>
              <h2 id="weather-notes-title">读预报前先确认三件事</h2>
            </div>
            <p className="weather-notes__aside">结果随查询条件更新，不保留旧日期</p>
          </div>
          <div className="weather-notes__grid">
            <div className="weather-note">
              <span className="weather-note__no">A</span>
              <strong>覆盖范围</strong>
              <p>只展示已返回的实际日期；缺失日期会在结果中标注，不用演示数据补齐。</p>
            </div>
            <div className="weather-note">
              <span className="weather-note__no">B</span>
              <strong>查询上限</strong>
              <p>单次最多 16 个当地日；超过上限会提示缩短日期范围。</p>
            </div>
            <div className="weather-note">
              <span className="weather-note__no">C</span>
              <strong>时区口径</strong>
              <p>业务日期统一按 Asia/Shanghai 解释，页面展示的是当地日期。</p>
            </div>
          </div>
        </section>

          <WeatherPanel cityName={destination.name} state={weatherState} />
            </div>
            <div className="workspace-view" hidden={activeView !== "budget"} key={`budget-${workspaceKey}`}><BudgetPanel destinationName={destination.name} /></div>
            <div className="workspace-view" hidden={activeView !== "transport"} key={`transport-${workspaceKey}`}><TransportPanel key={workspaceKey} initialDestination={destination.name} initialOrigin={originPlace} originLocationStatus={originLocationStatus} /></div>
            <div className="workspace-view" hidden={activeView !== "itinerary"} key={`itinerary-${workspaceKey}`}><ItineraryPanel destinationName={destination.name} startDate={startDate} endDate={endDate} /></div>
            <div className="workspace-view" hidden={activeView !== "checklist"} key={`checklist-${workspaceKey}`}><ChecklistPanel destinationName={destination.name} startDate={startDate} endDate={endDate} /></div>
            <div className="workspace-view" hidden={activeView !== "notes"} key={`notes-${workspaceKey}`}><NotesPanel destinationName={destination.name} startDate={startDate} endDate={endDate} /></div>
            <div className="workspace-view" hidden={activeView !== "assistant"} key={`assistant-${workspaceKey}`}><AssistantPanel destinationName={destination.name} startDate={startDate} endDate={endDate} evidence={assistantEvidence} /></div>
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="site-footer__brand">
          <span className="site-footer__mark" aria-hidden="true">行</span>
          <div>
            <strong>行旅 · 智能旅游助手</strong>
            <span>WAYFINDER FIELD NOTES</span>
          </div>
        </div>
        <p className="site-footer__note">
          {!destination || activeView === "weather"
            ? "天气模块仅展示已返回的实际日期覆盖"
            : activeView === "budget"
              ? "预算金额仅在本页计算，不连接报价平台"
              : activeView === "transport"
                ? "交通服务未配置时不会显示演示班次或路线"
                : activeView === "itinerary"
                  ? "行程草稿仅保存在当前页面，不连接订票或地图服务"
                  : activeView === "checklist"
                    ? "行前清单仅保存在当前页面，刷新后不会保留"
                    : activeView === "notes"
                      ? "旅行笔记仅保存在当前页面，不会上传或跨刷新保留"
                      : "AI 回答仅依据本轮明确提供的信息，条件建议不会自动应用"}
        </p>
        <span className="site-footer__meta">LOCAL PREVIEW · {defaultStartDate}</span>
      </footer>
    </div>
  );
}
