import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { components } from "../../shared/api-contracts";
import {
  fetchTransportFares,
  fetchTransportRoute,
  TransportApiError,
  type FareQuery,
  type FareResponse,
  type PlaceRef,
  type RouteMode,
  type RouteResponse,
} from "./api";
import "./transport-panel.css";

type ResultState = components["schemas"]["ResultState"];
type EvidenceState = components["schemas"]["EvidenceState"];
type FareOffer = components["schemas"]["FareOffer"];
type RouteOption = components["schemas"]["RouteOption"];
const EMPTY_PLACE: PlaceRef = { display_name: "", coordinate_system: "WGS84" };
const IATA_PATTERN = /^[A-Za-z]{3}$/;

type QueryState<T> =
  | { status: "unconfigured" }
  | { status: "idle" }
  | { status: "loading" }
  | { status: "result"; data: T }
  | { status: "error"; error: TransportApiError };

const ROUTE_MODES: { id: RouteMode; label: string; shortLabel: string }[] = [
  { id: "transit", label: "公交 / 地铁", shortLabel: "公交·地铁" },
  { id: "walking", label: "步行", shortLabel: "步行" },
  { id: "taxi", label: "出租车 / 驾车", shortLabel: "出租车" },
];

const RESULT_LABELS: Record<ResultState, string> = {
  live: "已返回来源数据",
  partial: "部分信息待核实",
  empty: "本次查询无结果",
  demo: "测试数据",
  unconfigured: "服务尚未配置",
  no_coverage: "当前条件未覆盖",
  rate_limited: "查询受额度限制",
  unavailable: "服务暂不可用",
  policy_unavailable: "服务权限暂不可用",
};

const EVIDENCE_LABELS: Record<EvidenceState, string> = {
  verified: "来源已核实",
  unverified: "来源待核实",
  user_provided: "用户提供",
  estimate: "估算",
  demo: "测试 fixture",
  unknown: "来源状态未知",
};

function safeTransportError(error: unknown): TransportApiError {
  if (error instanceof TransportApiError) return error;
  return new TransportApiError("交通服务暂不可用，请稍后重试。", {
    code: "PROVIDER_UNAVAILABLE",
    retryable: true,
    status: 0,
  });
}

function formatMoney(amountFen: number | null | undefined): string {
  if (amountFen === null || amountFen === undefined) return "金额待核实";
  if (!Number.isSafeInteger(amountFen) || amountFen < 0) return "金额超出安全展示范围";
  const cents = BigInt(amountFen);
  const yuanText = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(cents / 100n);
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `¥${yuanText}.${fraction}`;
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "余量未知";
  return `${value} 个`;
}

function formatDistance(value: number | null | undefined): string {
  if (value === null || value === undefined) return "距离待核实";
  if (value < 1000) return `${value} 米`;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value / 1000)} 千米`;
}

function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined) return "耗时待核实";
  if (value < 60) return `${value} 秒`;
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} 小时` : `${hours} 小时 ${remainingMinutes} 分钟`;
}

function formatBeijingDateTime(value: string | null | undefined): string {
  if (!value) return "查询时间待核实";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "查询时间待核实";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(parsed);
}

function formatServiceTime(value: string | null | undefined, timezone: string | null | undefined): string {
  if (!value) return "时刻待核实";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "时刻待核实";
  const zone = timezone || "UTC";
  try {
    const formatted = new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: zone,
    }).format(parsed);
    return `${formatted} · ${zone}`;
  } catch {
    return `${parsed.toISOString()} · UTC`;
  }
}

function priceBasisLabel(offer: FareOffer): string {
  switch (offer.price_basis) {
    case "per_passenger": return "单人价";
    case "party_total": return `${offer.passenger_count ?? "所选"} 人合计`;
    case "unknown": return "计价人数基准待核实";
  }
}

function priceScopeLabel(offer: FareOffer): string {
  switch (offer.price_scope) {
    case "entire_journey": return "全程报价";
    case "single_segment": return `单段报价 · ${offer.price_segment_id ?? "分段待核实"}`;
    case "unknown": return "报价覆盖范围待核实";
  }
}

function inclusionLabel(state: string): string {
  if (state === "included") return "已包含";
  if (state === "excluded") return "未包含";
  return "包含状态待核实";
}

function routeFareBasisLabel(basis: RouteOption["fare_basis"]): string {
  switch (basis) {
    case "per_route": return "每条路线";
    case "per_passenger": return "每位乘客";
    case "meter_estimate": return "计价估算";
    case "unknown": return "计价基准待核实";
  }
}

function PlaceFields(props: {
  origin: string;
  originHint: string;
  destination: string;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
}) {
  return (
    <fieldset className="transport-location-fields">
      <legend>查询地点</legend>
      <label className="transport-field">
        <span className="transport-field__label">起点</span>
        <input
          autoComplete="off"
          value={props.origin}
          onChange={(event) => props.onOriginChange(event.target.value)}
          maxLength={240}
          required
          aria-describedby="transport-origin-hint"
        />
        <span className="transport-field__hint" id="transport-origin-hint">{props.originHint}</span>
      </label>
      <label className="transport-field">
        <span className="transport-field__label">目的地</span>
        <input
          autoComplete="off"
          value={props.destination}
          onChange={(event) => props.onDestinationChange(event.target.value)}
          maxLength={240}
          required
          aria-describedby="transport-destination-hint"
        />
        <span className="transport-field__hint" id="transport-destination-hint">请核对地点名称；模糊文本不会被标成已核实。</span>
      </label>
    </fieldset>
  );
}

function ResultNotice<T extends {
  state: ResultState;
  message?: string;
  queried_at?: string;
  error?: { message: string } | null;
}>(
  { state, kind }: { state: QueryState<T>; kind: string },
) {
  if (state.status === "unconfigured") {
    return <p className="transport-result-note transport-result-note--unconfigured" role="status" aria-live="polite">
      <strong>交通服务尚未配置</strong>
      <span>提交查询后仍不会使用测试数据或旧结果填补。</span>
    </p>;
  }
  if (state.status === "idle") {
    return <p className="transport-empty-note">提交查询后显示来源与结果；未配置数据源时不会用测试路线或旧结果填补。</p>;
  }
  if (state.status === "loading") {
    return <p className="transport-result-note" role="status" aria-live="polite">正在查询{kind}…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="transport-result-note transport-result-note--error" role="alert">
        <span>{state.error.message}</span>
        {state.error.requestId && <small>请求编号：{state.error.requestId}</small>}
      </div>
    );
  }
  const data = state.data;
  return (
    <div className={`transport-result-note transport-result-note--${data.state}`} role="status" aria-live="polite">
      <strong>{RESULT_LABELS[data.state]}</strong>
      {data.message && <span>{data.message}</span>}
      {data.error?.message && <span>{data.error.message}</span>}
      <small>查询时间：{formatBeijingDateTime(data.queried_at)}</small>
    </div>
  );
}

function safeBookingUrl(value: string | null | undefined): boolean {
  if (!value || value.includes("\\") || /\s/u.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") &&
      ["fliggy.com", "alitrip.com", "taobao.com", "tmall.com", "fly.ai"].some(
        (root) => url.hostname === root || url.hostname.endsWith(`.${root}`),
      );
  } catch { return false; }
}

function FareCards({ data }: { data: FareResponse }) {
  const offers = data.items ?? [];
  if (offers.length === 0) return null;
  return (
    <div className="transport-results" aria-label="班次与票价结果">
      {offers.map((offer) => (
        <article className="transport-result-card" key={offer.offer_id}>
          <div className="transport-result-card__topline">
            <span className="transport-result-card__eyebrow">{offer.mode === "flight" ? "航班" : "铁路"} · {offer.travel_date}</span>
            <span className={`transport-evidence transport-evidence--${offer.evidence_state}`}>
              {EVIDENCE_LABELS[offer.evidence_state]}
            </span>
          </div>
          <h4 className="transport-result-card__route">{offer.origin_name} <span aria-hidden="true">→</span> {offer.destination_name}</h4>
          <div className="transport-fare-grid">
            <div>
              <span className="transport-data-label">班次</span>
              <strong>{offer.service_number ?? "编号待核实"}</strong>
            </div>
            <div>
              <span className="transport-data-label">出发 · 到达</span>
              <strong>{formatServiceTime(offer.departure_at, offer.departure_timezone)}</strong>
              <strong>{formatServiceTime(offer.arrival_at, offer.arrival_timezone)}</strong>
            </div>
            <div className="transport-price-block">
              <span className="transport-data-label">票价{offer.price_fen != null ? ` · ${offer.currency_code}` : ""}</span>
              <strong>{offer.mode === "rail" && offer.price_fen == null ? "票价未返回" : formatMoney(offer.price_fen)}</strong>
              <small>{priceBasisLabel(offer)} · {priceScopeLabel(offer)}</small>
            </div>
          </div>
          {offer.segments.length > 0 && (
            <div className="transport-segments">
              <span className="transport-data-label">乘行分段（按来源顺序）</span>
              <ol>
                {offer.segments.map((segment) => (
                  <li key={segment.segment_id}>
                    <div>
                      <strong>
                        {segment.origin_name ?? "起点待核实"} <span aria-hidden="true">→</span> {segment.destination_name ?? "目的地待核实"}
                      </strong>
                      <small>
                        {formatServiceTime(segment.departure_at, segment.departure_timezone)} → {formatServiceTime(segment.arrival_at, segment.arrival_timezone)}
                      </small>
                    </div>
                    <div>
                      <span>{segment.service_number ?? "班次编号待核实"}</span>
                      {segment.seat_class && <small>席别：{segment.seat_class}</small>}
                      {segment.operating_carrier && <small>承运：{segment.operating_carrier}</small>}
                      {segment.transfer_place && <small>换乘地点：{segment.transfer_place}</small>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {safeBookingUrl(offer.booking_url) && (
            <a className="transport-booking-link" href={offer.booking_url ?? undefined} target="_blank" rel="noopener noreferrer">查看飞猪官方详情（新窗口）</a>
          )}
          <div className="transport-offer-meta">
            <span>可用性：{offer.availability === "available" ? "来源显示可用" : offer.availability === "unavailable" ? "来源显示不可用" : "待核实"}</span>
            <span>余量：{formatCount(offer.remaining_seats)}</span>
            <span>{offer.passenger_count === null || offer.passenger_count === undefined ? "人数待核实" : `查询人数：${offer.passenger_count}`}</span>
          </div>
          <div className="transport-charge-list">
            <span className="transport-data-label">费用项目</span>
            {offer.included_charges && offer.included_charges.length > 0 ? (
              <ul>
                {offer.included_charges.map((charge, index) => (
                  <li key={`${offer.offer_id}-${charge.charge_type}-${index}`}>
                    <span>{charge.display_name} · {inclusionLabel(charge.inclusion_state)}</span>
                    <span>{formatMoney(charge.amount_fen)} · {charge.amount_basis === "per_passenger" ? "单人" : charge.amount_basis === "party_total" ? "所选人数合计" : "计价基准待核实"}</span>
                  </li>
                ))}
              </ul>
            ) : <p>费用项目未返回，不代表已包含税费或行李。</p>}
          </div>
          {data.sources?.map((source) => source.source_id === offer.source_id && (
            <p className="transport-source" key={source.source_id}>
              来源：{source.display_name} · 取数时间：{formatBeijingDateTime(source.retrieved_at)}
              {source.attribution ? ` · ${source.attribution}` : ""}
              {source.url && <> · <a href={source.url} target="_blank" rel="noreferrer">查看来源</a></>}
            </p>
          ))}
          <p className="transport-volatility">票价与余量可能变化；此结果不构成余票锁定或购票承诺。</p>
        </article>
      ))}
    </div>
  );
}

function RouteCards({ data }: { data: RouteResponse }) {
  const routes = data.items ?? [];
  if (routes.length === 0) return null;
  return (
    <div className="transport-results" aria-label="市内路线结果">
      {routes.map((route) => (
        <article className="transport-result-card" key={route.route_id}>
          <div className="transport-result-card__topline">
            <span className="transport-result-card__eyebrow">{ROUTE_MODES.find((item) => item.id === route.mode)?.label ?? route.mode}</span>
            <span className={`transport-evidence transport-evidence--${route.evidence_state}`}>
              {EVIDENCE_LABELS[route.evidence_state]}
            </span>
          </div>
          <h4 className="transport-result-card__route">{route.origin_name} <span aria-hidden="true">→</span> {route.destination_name}</h4>
          <div className="transport-route-metrics">
            <div><span className="transport-data-label">距离</span><strong>{formatDistance(route.distance_m)}</strong></div>
            <div><span className="transport-data-label">预计耗时</span><strong>{formatDuration(route.duration_seconds)}</strong></div>
            <div>
              <span className="transport-data-label">费用 · {route.currency_code}</span>
              <strong>{formatMoney(route.fare_amount_fen)}</strong>
              <small>{routeFareBasisLabel(route.fare_basis)} · {EVIDENCE_LABELS[route.fare_evidence_state]}</small>
            </div>
          </div>
          <p className="transport-duration-basis">耗时依据：{route.duration_basis === "realtime" ? "实时" : route.duration_basis === "scheduled" ? "时刻表" : route.duration_basis === "typical_estimate" ? "常见估算" : "待核实"}</p>
          {route.steps && route.steps.length > 0 && (
            <ol className="transport-steps">
              {route.steps.map((step, index) => (
                <li key={`${route.route_id}-step-${index}`}>
                  {step.instruction ?? "路线指引待核实"}
                  {step.step_mode && <span> · {step.step_mode}</span>}
                </li>
              ))}
            </ol>
          )}
          <p className="transport-geometry-note">
            {route.geometry_points && route.geometry_points.length >= 2
              ? "已返回路线几何；地图展示尚未接入。"
              : "未提供地图线路，不绘制直线或估算路径。"}
          </p>
          {data.sources?.map((source) => source.source_id === route.source_id && (
            <p className="transport-source" key={source.source_id}>
              来源：{source.display_name} · 取数时间：{formatBeijingDateTime(source.retrieved_at)}
              {source.attribution ? ` · ${source.attribution}` : ""}
              {source.url && <> · <a href={source.url} target="_blank" rel="noreferrer">查看来源</a></>}
            </p>
          ))}
        </article>
      ))}
    </div>
  );
}

export function TransportPanel({
  initialDestination,
  initialOrigin = EMPTY_PLACE,
  originLocationStatus = "idle",
}: {
  initialDestination: string;
  initialOrigin?: PlaceRef;
  originLocationStatus?: "idle" | "loading" | "resolved" | "error";
}) {
  const [activeSection, setActiveSection] = useState<"fares" | "routes">("fares");
  const [origin, setOrigin] = useState<PlaceRef>(initialOrigin);
  const originWasEdited = useRef(false);
  const [destination, setDestination] = useState(initialDestination);
  const [originIata, setOriginIata] = useState("");
  const [destinationIata, setDestinationIata] = useState("");
  const [fareMode, setFareMode] = useState<FareQuery["mode"]>("flight");
  const [travelDate, setTravelDate] = useState("");
  const [adultCount, setAdultCount] = useState("1");
  const [childCount, setChildCount] = useState("");
  const [departAt, setDepartAt] = useState("");
  const [fareFormError, setFareFormError] = useState<string | null>(null);
  const [routeFormError, setRouteFormError] = useState<string | null>(null);
  const [fareState, setFareState] = useState<QueryState<FareResponse>>({ status: "unconfigured" });
  const [routeStates, setRouteStates] = useState<Record<RouteMode, QueryState<RouteResponse>>>(() => ({
    transit: { status: "unconfigured" },
    walking: { status: "unconfigured" },
    taxi: { status: "unconfigured" },
  }));
  const fareSequence = useRef(0);
  const routeSequences = useRef<Record<RouteMode, number>>({ transit: 0, walking: 0, taxi: 0 });

  useEffect(() => {
    if (!originWasEdited.current) setOrigin(initialOrigin);
  }, [initialOrigin]);

  function clearFareResults() {
    fareSequence.current += 1;
    setFareState({ status: "idle" });
    setFareFormError(null);
  }

  function clearRouteResults() {
    routeSequences.current.transit += 1;
    routeSequences.current.walking += 1;
    routeSequences.current.taxi += 1;
    setRouteStates({
      transit: { status: "idle" },
      walking: { status: "idle" },
      taxi: { status: "idle" },
    });
    setRouteFormError(null);
  }

  function clearResults() {
    clearFareResults();
    clearRouteResults();
  }

  useEffect(() => () => {
    fareSequence.current += 1;
    routeSequences.current.transit += 1;
    routeSequences.current.walking += 1;
    routeSequences.current.taxi += 1;
  }, []);

  function validLocations(setError: (message: string) => void): boolean {
    if (!origin.display_name.trim() || !destination.trim()) {
      setError("请填写起点和目的地。");
      return false;
    }
    if (origin.display_name.trim() === "当前位置" && origin.latitude === undefined) {
      setError("尚未取得当前位置，请手动填写起点或重新选择出发地点。");
      return false;
    }
    return true;
  }

  function buildPlace(name: string, place?: PlaceRef) {
    if (place && name.trim() === place.display_name) return { ...place };
    return { display_name: name.trim(), coordinate_system: "WGS84" as const };
  }

  async function handleFareSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFareResults();
    if (!validLocations(setFareFormError)) return;
    if (!travelDate) {
      setFareFormError("请选择明确的目标出行日期。");
      return;
    }
    const parsedAdultCount = Number(adultCount);
    const parsedChildCount = childCount === "" ? null : Number(childCount);
    if (!Number.isSafeInteger(parsedAdultCount) || parsedAdultCount < 1) {
      setFareFormError("成人数量必须是大于零的整数。");
      return;
    }
    if (parsedChildCount !== null && (!Number.isSafeInteger(parsedChildCount) || parsedChildCount < 0)) {
      setFareFormError("儿童人数必须是零或正整数，也可以留空。");
      return;
    }
    const totalPassengers = parsedAdultCount + (parsedChildCount ?? 0);
    if (!Number.isSafeInteger(totalPassengers)) {
      setFareFormError("乘客总数超出有效范围。");
      return;
    }
    if (origin.display_name.trim().toLocaleLowerCase() === destination.trim().toLocaleLowerCase()) {
      setFareFormError("起点与目的地不能相同。");
      return;
    }

    const originPlace = buildPlace(origin.display_name, origin);
    const destinationPlace = buildPlace(destination);
    if (fareMode === "flight") {
      const normalizedOriginIata = originIata.trim().toUpperCase();
      const normalizedDestinationIata = destinationIata.trim().toUpperCase();
      if (!IATA_PATTERN.test(normalizedOriginIata) || !IATA_PATTERN.test(normalizedDestinationIata)) {
        setFareFormError("航班查询必须填写明确的起飞机场和到达机场 IATA 三字码，例如 SHA / HGH。");
        return;
      }
      if (normalizedOriginIata === normalizedDestinationIata) {
        setFareFormError("起飞机场与到达机场不能相同。");
        return;
      }
      if (totalPassengers > 9) {
        setFareFormError("Amadeus 航班查询的成人加儿童总数不能超过 9 人。");
        return;
      }
      originPlace.place_id = normalizedOriginIata;
      destinationPlace.place_id = normalizedDestinationIata;
    }

    const query: FareQuery = {
      origin: originPlace,
      destination: destinationPlace,
      mode: fareMode,
      travel_date: travelDate,
      passenger_count: totalPassengers,
      child_count: parsedChildCount,
    };
    const sequence = ++fareSequence.current;
    setFareFormError(null);
    setFareState({ status: "loading" });
    try {
      const data = await fetchTransportFares(query);
      if (fareSequence.current === sequence) setFareState({ status: "result", data });
    } catch (error) {
      if (fareSequence.current === sequence) {
        setFareState({ status: "error", error: safeTransportError(error) });
      }
    }
  }

  async function handleRouteSearch(mode: RouteMode) {
    setRouteFormError(null);
    if (!validLocations(setRouteFormError)) return;

    let departure: string | null = null;
    if (departAt) {
      const localDate = new Date(departAt);
      if (Number.isNaN(localDate.getTime())) {
        setRouteFormError("出发时间格式无效。");
        return;
      }
      const offset = -localDate.getTimezoneOffset();
      const sign = offset >= 0 ? "+" : "-";
      const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, "0");
      const minutes = (Math.abs(offset) % 60).toString().padStart(2, "0");
      departure = `${departAt}:00${sign}${hours}:${minutes}`;
    }

    const query = {
      origin: buildPlace(origin.display_name, origin),
      destination: buildPlace(destination),
      mode,
      depart_at: departure,
    } satisfies components["schemas"]["RouteQuery"];
    const sequence = ++routeSequences.current[mode];
    setRouteStates((previous) => ({ ...previous, [mode]: { status: "loading" } }));
    try {
      const data = await fetchTransportRoute(query);
      if (routeSequences.current[mode] === sequence) {
        setRouteStates((previous) => ({ ...previous, [mode]: { status: "result", data } }));
      }
    } catch (error) {
      if (routeSequences.current[mode] === sequence) {
        setRouteStates((previous) => ({
          ...previous,
          [mode]: { status: "error", error: safeTransportError(error) },
        }));
      }
    }
  }

  return (
    <section className="transport-panel" aria-labelledby="transport-title">
      <div className="transport-panel__heading">
        <div>
          <p className="transport-panel__eyebrow">TRANSPORT / 03</p>
          <h1 id="transport-title">交通查询</h1>
          <p>班次票价与市内路线分开呈现，未知金额与未核实路线不会被补成事实。</p>
        </div>
        <span className="transport-panel__stamp">来源 · 日期 · 单位</span>
      </div>

      <section className="transport-guide" aria-labelledby="transport-guide-title">
        <div className="transport-guide__head">
          <p className="transport-panel__eyebrow">READ ME</p>
          <h2 id="transport-guide-title">查询口径</h2>
          <p>班次与市内路线分开处理，缺失信息会保持待核实状态。</p>
        </div>
        <ul>
          <li><strong>班次与票价</strong><span>结果保留来源、日期与计价单位。</span></li>
          <li><strong>市内路线</strong><span>未提供线路时不绘制直线或估算路径。</span></li>
          <li><strong>服务状态</strong><span>未配置时不展示演示班次或路线。</span></li>
        </ul>
      </section>

      <nav className="transport-tabs" aria-label="交通查询类型">
        <button
          type="button"
          aria-pressed={activeSection === "fares"}
          onClick={() => setActiveSection("fares")}
        >
          班次与票价
        </button>
        <button
          type="button"
          aria-pressed={activeSection === "routes"}
          onClick={() => setActiveSection("routes")}
        >
          市内路线
        </button>
      </nav>

      <div className="transport-query-card">
        <PlaceFields
          origin={origin.display_name}
          originHint={originLocationStatus === "loading"
            ? "正在获取浏览器当前位置。"
            : originLocationStatus === "error"
              ? "定位未完成；请手动填写起点后查询。"
              : origin.latitude !== undefined
                ? "默认起点来自浏览器定位；可编辑地点，编辑后将按文字地点查询。"
                : "已沿用规划时设置的出发地；可改为站点、机场或其他地点。"}
          destination={destination}
          onOriginChange={(value) => {
            clearResults();
            originWasEdited.current = true;
            setOrigin({ display_name: value, coordinate_system: "WGS84" });
          }}
          onDestinationChange={(value) => { clearResults(); setDestination(value); }}
        />

        {activeSection === "fares" ? (
          <form className="transport-search-form" onSubmit={handleFareSubmit} noValidate>
            <div className="transport-search-form__fields">
              <label className="transport-field">
                <span className="transport-field__label">交通方式</span>
                <select value={fareMode} onChange={(event) => { clearFareResults(); setFareMode(event.target.value as FareQuery["mode"]); }}>
                  <option value="flight">航班</option>
                  <option value="rail">铁路 / 高铁</option>
                </select>
              </label>
              <label className="transport-field">
                <span className="transport-field__label">目标出行日期</span>
                <input type="date" value={travelDate} onChange={(event) => { clearFareResults(); setTravelDate(event.target.value); }} aria-describedby="transport-travel-date-hint" />
                <span className="transport-field__hint" id="transport-travel-date-hint">按显式日期查询，不自动替换为今天。</span>
              </label>
              <label className="transport-field">
                <span className="transport-field__label">成人数量</span>
                <input type="number" min="1" step="1" inputMode="numeric" value={adultCount} onChange={(event) => { clearFareResults(); setAdultCount(event.target.value); }} aria-describedby="transport-adult-count-hint" />
                <span className="transport-field__hint" id="transport-adult-count-hint">至少 1 位成人；与儿童人数合并为查询总人数。</span>
              </label>
              <label className="transport-field">
                <span className="transport-field__label">儿童人数（可选）</span>
                <input type="number" min="0" step="1" inputMode="numeric" value={childCount} onChange={(event) => { clearFareResults(); setChildCount(event.target.value); }} aria-describedby="transport-child-count-hint" />
                <span className="transport-field__hint" id="transport-child-count-hint">可留空；儿童票规则和票价以服务商为准。</span>
              </label>
              {fareMode === "flight" && (
                <>
                  <label className="transport-field">
                    <span className="transport-field__label">起飞机场 IATA</span>
                    <input
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={originIata}
                      onChange={(event) => { clearFareResults(); setOriginIata(event.target.value); }}
                      maxLength={3}
                      pattern="[A-Za-z]{3}"
                      required
                      aria-describedby="transport-origin-iata-hint"
                    />
                    <span className="transport-field__hint" id="transport-origin-iata-hint">请输入明确机场代码，如 SHA；不会从城市名自动猜测。</span>
                  </label>
                  <label className="transport-field">
                    <span className="transport-field__label">到达机场 IATA</span>
                    <input
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={destinationIata}
                      onChange={(event) => { clearFareResults(); setDestinationIata(event.target.value); }}
                      maxLength={3}
                      pattern="[A-Za-z]{3}"
                      required
                      aria-describedby="transport-destination-iata-hint"
                    />
                    <span className="transport-field__hint" id="transport-destination-iata-hint">请输入明确机场代码，如 HGH；代码会统一转为大写。</span>
                  </label>
                </>
              )}
            </div>
            <div className="transport-search-form__footer">
              <p className="transport-field__hint">{fareMode === "rail" ? "铁路仅查询班次；来源不按人数报价，余量待核实。" : "价格和余量可能变化；页面不会代替购票平台下单。"}</p>
              <button className="transport-primary-button" type="submit" disabled={fareState.status === "loading"}>
                {fareState.status === "loading" ? "正在查询…" : fareState.status === "error" ? "重试班次" : "查询班次"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            {fareFormError && <p className="transport-form-error" role="alert">{fareFormError}</p>}
          </form>
        ) : (
          <div className="transport-route-search">
            <label className="transport-field transport-route-search__time">
              <span className="transport-field__label">出发时间（可选）</span>
              <input type="datetime-local" value={departAt} onChange={(event) => { clearRouteResults(); setDepartAt(event.target.value); }} aria-describedby="transport-depart-at-hint" />
              <span className="transport-field__hint" id="transport-depart-at-hint">按本机时区提交；未填写时不声称按实时交通计算。</span>
            </label>
            <p className="transport-field__hint">每种方式单独查询和重试，一种失败不会清除其他方式的结果。</p>
            <div className="transport-route-actions">
              {ROUTE_MODES.map((mode) => {
                const isLoading = routeStates[mode.id].status === "loading";
                const isRetry = routeStates[mode.id].status === "error";
                const actionLabel = `${isRetry ? "重试" : "查询"}${mode.label}路线`;
                return (
                  <button
                    className="transport-secondary-button"
                    type="button"
                    key={mode.id}
                    onClick={() => void handleRouteSearch(mode.id)}
                    disabled={isLoading}
                    aria-label={actionLabel}
                  >
                    {isLoading ? "查询中…" : actionLabel}
                  </button>
                );
              })}
            </div>
            {routeFormError && <p className="transport-form-error" role="alert">{routeFormError}</p>}
          </div>
        )}
      </div>

      {activeSection === "fares" ? (
        <div className="transport-query-results">
          <div className="transport-results-heading">
            <h3>班次结果</h3>
            <span>单程查询 · 不组合往返票价</span>
          </div>
          <ResultNotice state={fareState} kind="班次与票价" />
          {fareState.status === "result" && <FareCards data={fareState.data} />}
          {fareState.status === "result" && fareState.data.platform_hint && (
            <p className="transport-platform-hint">平台提示：{fareState.data.platform_hint}</p>
          )}
        </div>
      ) : (
        <div className="transport-query-results">
          <div className="transport-results-heading">
            <h3>路线结果</h3>
            <span>不使用直线代替真实路线</span>
          </div>
          {ROUTE_MODES.map((mode) => {
            const routeState = routeStates[mode.id];
            return (
              <section className="transport-mode-result" key={mode.id} aria-label={`${mode.label}查询结果`}>
                <h4>{mode.label}</h4>
                <ResultNotice state={routeState} kind={mode.label} />
                {routeState.status === "result" && <RouteCards data={routeState.data} />}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
