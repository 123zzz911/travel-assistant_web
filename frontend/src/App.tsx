import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { fetchWeatherForecast, WeatherApiError, type WeatherQuery } from "./features/weather/api";
import { WeatherBackdrop, WeatherPanel, WeatherSignalCard, type WeatherPanelState } from "./features/weather/WeatherPanel";
import { BudgetPanel, COST_CATEGORIES, type InjectedCost } from "./features/budget/BudgetPanel";
import { TransportPanel } from "./features/transport/TransportPanel";
import { ItineraryPanel, type InjectedItinerary } from "./features/itinerary/ItineraryPanel";
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
  imageUrl: string;
};

const CITY_OPTIONS: CityOption[] = [
  { id: "shanghai", name: "上海", province: "上海市", imageUrl: "/assets/cities/shanghai.png" },
  { id: "suzhou", name: "苏州", province: "江苏省", imageUrl: "/assets/cities/suzhou.png" },
  { id: "wuxi", name: "无锡", province: "江苏省", imageUrl: "/assets/cities/wuxi.png" },
  { id: "jiaxing", name: "嘉兴", province: "浙江省", imageUrl: "/assets/cities/jiaxing.png" },
  { id: "hangzhou", name: "杭州", province: "浙江省", imageUrl: "/assets/cities/hangzhou.png" },
];

const MODULE_OPTIONS: { no: string; title: string; desc: string; imageSrc: string }[] = [
  { no: "01", title: "天气", desc: "查询已登记城市的逐日预报，缺失日期会明确标注，不用演示数据补齐。", imageSrc: "/assets/modules/weather.jpg" },
  { no: "02", title: "预算", desc: "用整趟总额与费用明细计算结余；留空表示待核实，不等于 0 元。", imageSrc: "/assets/modules/budget.jpg" },
  { no: "03", title: "交通", desc: "班次票价与市内路线分开查询，未知金额与未核实路线保持待核实状态。", imageSrc: "/assets/modules/transport.jpg" },
  { no: "04", title: "行程", desc: "按天添加安排并可锁定，草稿只保存在当前页面，不连接订票或地图服务。", imageSrc: "/assets/modules/itinerary.jpg" },
  { no: "05", title: "清单", desc: "按证件、衣物、电子与应急分类勾选，进度只保存在当前页面。", imageSrc: "/assets/modules/checklist.jpg" },
  { no: "06", title: "笔记", desc: "随手记录想法与待确认信息，笔记不会上传，也不会跨刷新保留。", imageSrc: "/assets/modules/notes.jpg" },
  { no: "07", title: "AI 助手", desc: "只依据本轮明确提供的信息回答，条件建议需要你另行确认后才会应用。", imageSrc: "/assets/modules/assistant.jpg" },
];

const MODULE_VIEWS = ["weather", "budget", "transport", "itinerary", "checklist", "notes", "assistant"] as const;

// 小机器人随机添加的行程安排与费用金额
const RANDOM_ITINERARY: { title: string; time: string; note: string }[] = [
  { title: "五点起床看日出", time: "05:00", note: "天没亮就出发，别怪我没提醒" },
  { title: "博物馆一口气逛完", time: "09:00", note: "预留 5 小时，腿会酸" },
  { title: "排队三小时吃网红店", time: "12:00", note: "拿号后先去附近逛逛" },
  { title: "咖啡馆瘫到天黑", time: "15:30", note: "一坐就是一整个下午" },
  { title: "江边看日落", time: "18:30", note: "提前 40 分钟占位" },
  { title: "夜市横扫十条街", time: "23:00", note: "吃到凌晨，打车回酒店" },
  { title: "跟着地图暴走两万步", time: "07:30", note: "记得穿最舒服的鞋" },
  { title: "坐最早一班公交绕城", time: "06:20", note: "从起点坐到终点再回来" },
  { title: "老巷子里找一家无名面馆", time: "10:40", note: "只收现金的那种" },
  { title: "临时买张车票去隔壁城", time: "13:10", note: "当天往返，说走就走" },
  { title: "公园长椅上睡一觉", time: "16:00", note: "晒着太阳，最省钱的项目" },
  { title: "爬到山顶吹风", time: "20:30", note: "下山记得留一盏灯的时间" },
  { title: "深夜便利店买关东煮", time: "00:30", note: "坐在路边吃完再走" },
  { title: "五点起床看日出（第二次）", time: "05:00", note: "不信邪，再看一次" },
  { title: "在菜市场吃一顿早饭", time: "07:10", note: "跟着本地人排队准没错" },
  { title: "骑共享单车绕老城一圈", time: "08:20", note: "两小时能骑完，别迷路" },
  { title: "逛书店逛到忘记时间", time: "10:00", note: "出来时天已经黑了" },
  { title: "去美术馆看一场冷门展", time: "11:30", note: "人少，可以慢慢看" },
  { title: "在河边发呆一小时", time: "14:20", note: "什么都不做，也算行程" },
  { title: "找一家老字号吃招牌菜", time: "17:00", note: "提前查好排队攻略" },
  { title: "坐摩天轮看整座城", time: "19:30", note: "恐高的话就闭眼" },
  { title: "听一场小酒馆的现场", time: "21:00", note: "门票不贵，气氛很好" },
  { title: "凌晨在便利店吃泡面", time: "02:00", note: "突然就饿了" },
  { title: "拍一百张照片再挑一张", time: "16:40", note: "最后可能一张都不用" },
  { title: "逛完整个夜市只花了 20 元", time: "22:00", note: "省钱也是一种本事" },
  { title: "去城门下看一场升旗", time: "06:00", note: "提前一小时到才有位置" },
  { title: "在城市最高楼俯瞰全城", time: "10:30", note: "能看到今天走过的每一条街" },
  { title: "找一家开在二楼的小店", time: "13:40", note: "没有招牌，靠熟人带路" },
  { title: "坐一趟环城电车", time: "15:10", note: "不下车，坐一整圈" },
  { title: "在旧书店淘一本旧书", time: "16:20", note: "扉页上还留着上一位读者的名字" },
  { title: "去体育场看一场本地球赛", time: "19:00", note: "跟着人群一起喊" },
  { title: "在江边吃烤串到深夜", time: "22:30", note: "风很大，记得穿外套" },
  { title: "走完一整条老街", time: "08:40", note: "从街头走到街尾，大概两公里" },
  { title: "去邮局寄一张明信片", time: "10:20", note: "寄给自己，一年后再看" },
  { title: "在公园看人下棋", time: "14:50", note: "看半小时就能学会规则" },
  { title: "逛一圈本地超市", time: "17:20", note: "看看这里的零食有什么不同" },
  { title: "去剧院看一场演出", time: "19:40", note: "临时买票也能有好位置" },
  { title: "在桥上等一次整点亮灯", time: "20:00", note: "提前五分钟站好" },
  { title: "找一家通宵饺子馆", time: "01:00", note: "凌晨的饺子最好吃" },
  { title: "去山顶看城市夜景", time: "21:30", note: "风大，多带一件衣服" },
  { title: "在图书馆坐一下午", time: "13:00", note: "带身份证就能进" },
  { title: "跟着本地人赶一次早市", time: "06:40", note: "八点之后摊就少了" },
  { title: "去吃一碗排队最长的面", time: "11:10", note: "排到就是胜利" },
  { title: "在公园租一条脚踏船", time: "15:40", note: "一小时刚好绕湖一圈" },
  { title: "去看一场露天电影", time: "19:20", note: "带块野餐垫就能坐第一排" },
  { title: "去网红天台拍一张照", time: "17:40", note: "日落时人最多，早点去" },
  { title: "在便利店写一张便利贴", time: "23:30", note: "贴在那面满是留言的墙上" },
  { title: "什么也不做，睡到自然醒", time: "11:00", note: "旅行也需要休息日" },
  { title: "去河边喂一次鸽子", time: "09:40", note: "面包记得自己先吃一口" },
  { title: "在旧城墙下走一圈", time: "12:20", note: "砖缝里都是年份" },
  { title: "在码头看渔船回港", time: "06:10", note: "带着鱼腥味的热闹" },
  { title: "去一家只开到中午的面包店", time: "08:00", note: "卖完就关门，去晚了没有" },
  { title: "坐地铁坐到终点站", time: "09:20", note: "下车看看那里有什么" },
  { title: "在老邮局门口读一遍旧告示", time: "10:10", note: "字迹快看不清了" },
  { title: "逛免费的城市展览馆", time: "11:20", note: "空调很足，可以待很久" },
  { title: "吃一份本地人才懂的早餐", time: "07:50", note: "照着邻桌点准没错" },
  { title: "在钟楼下对一次表", time: "12:10", note: "顺便听听整点的钟声" },
  { title: "去河边看人钓鱼", time: "13:20", note: "一坐就是一下午" },
  { title: "找一家能修表的老师傅", time: "14:10", note: "修不修得好看缘分" },
  { title: "在广场看一整场喷泉", time: "15:20", note: "站远一点就不会被淋到" },
  { title: "去花市挑一束便宜的花", time: "16:10", note: "收摊前最划算" },
  { title: "在巷口看猫打架", time: "17:10", note: "比任何表演都精彩" },
  { title: "去菜市场买一袋橘子", time: "18:20", note: "边逛边吃，袋子越来越轻" },
  { title: "在桥上数经过的船", time: "19:10", note: "数到二十就数不清了" },
  { title: "去屋顶看星星", time: "22:40", note: "城市的星星少，但真的有" },
  { title: "在民宿院子里和老板聊天", time: "20:30", note: "本地消息都在这里" },
  { title: "凌晨散步一整条街", time: "03:30", note: "整条街只有你和路灯" },
  { title: "去 24 小时书店翻画册", time: "23:50", note: "翻到腿麻为止" },
  { title: "在便利店买一瓶本地汽水", time: "14:30", note: "看看味道有什么不一样" },
  { title: "去学校门口吃炸串", time: "16:50", note: "放学时间段最热闹" },
  { title: "在图书馆借一本书", time: "09:50", note: "看完再还，也算来过" },
  { title: "去看一场社区话剧", time: "19:50", note: "演员就住在这条街上" },
  { title: "在球场边看人打篮球", time: "18:40", note: "天黑了还在打" },
  { title: "去老街理发店剪一次头发", time: "11:40", note: "推子声很有节奏" },
  { title: "在城郊坐一次绿皮火车", time: "08:50", note: "慢，但窗外好看" },
  { title: "去湿地公园走木栈道", time: "10:40", note: "带好驱蚊水" },
  { title: "在美术馆门口排队看特展", time: "09:10", note: "开馆前半小时人最少" },
  { title: "去吃一碗凌晨的馄饨", time: "00:10", note: "老板记得每个熟客的口味" },
  { title: "在广场跟着大爷打太极", time: "06:30", note: "动作跟不上也没关系" },
  { title: "去旧货市场淘一只杯子", time: "13:30", note: "十块钱能讲价到五块" },
  { title: "在书店听一场作者分享", time: "20:10", note: "坐在最后一排也能听清" },
  { title: "去江边吹风看货船", time: "21:40", note: "船灯一串一串地过" },
  { title: "在城市天桥上拍车流", time: "22:20", note: "长曝光会很好看" },
  { title: "找一家开在弄堂里的咖啡馆", time: "10:50", note: "门口没有招牌" },
  { title: "去寺庙听一次早课", time: "05:30", note: "安静得能听见风" },
  { title: "在湖边租一把椅子晒太阳", time: "15:00", note: "一小时什么都不想" },
  { title: "去看一场街头魔术", time: "17:30", note: "围观的人越多越精彩" },
  { title: "去夜市买一双拖鞋", time: "21:20", note: "走了一天，脚需要它" },
  { title: "在公交上坐到不认识的地方", time: "12:40", note: "下车前记住回程路线" },
  { title: "去本地人推荐的小酒馆", time: "22:50", note: "没有菜单，问老板就行" },
  { title: "在城墙上看一次落日", time: "18:10", note: "砖是暖色的" },
  { title: "去水族馆看一整墙水母", time: "14:00", note: "站着看十分钟不腻" },
  { title: "在天台上吃一顿晚饭", time: "19:30", note: "风把纸巾吹跑了" },
  { title: "去山脚下听溪水", time: "08:10", note: "比任何白噪音都好听" },
  { title: "在老街看一次打铁", time: "11:50", note: "火星四溅，离远点" },
  { title: "去电影院看一部冷门片", time: "16:30", note: "整个厅可能只有你" },
  { title: "在河边写完一封信", time: "18:50", note: "写完不一定寄出去" },
  { title: "去菜市场学一句方言", time: "09:30", note: "学会就能讲价了" },
  { title: "凌晨去海边等船", time: "04:20", note: "海风很凉，记得带外套" },
  { title: "在回程车上睡一整路", time: "23:10", note: "到站前十分钟记得醒" },
];
// 加权随机金额：1-500 概率 55%，501-1000 概率 25%，1001-2000 概率 20%
function randomCostAmount(): number {
  const r = Math.random();
  let lo = 1;
  let hi: number;
  if (r < 0.55) { hi = 500; }
  else if (r < 0.8) { lo = 501; hi = 1000; }
  else { lo = 1001; hi = 2000; }
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

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
  const [hoveredCityId, setHoveredCityId] = useState<WeatherQuery["city_id"] | null>(null);
  const [robotOpen, setRobotOpen] = useState(false);
  const [robotHint, setRobotHint] = useState<string | null>(null);
  const robotHintTimer = useRef<number | null>(null);
  const [injectedCost, setInjectedCost] = useState<InjectedCost | null>(null);
  const [injectedItinerary, setInjectedItinerary] = useState<InjectedItinerary | null>(null);
  const robotInjectToken = useRef(0);
  // 已用过的类别 / 安排，避免机器人重复添加同样的内容
  const usedCostCategories = useRef<Set<string>>(new Set());
  const usedItineraryTitles = useRef<Set<string>>(new Set());
  const [robotPos, setRobotPos] = useState<{ x: number; y: number } | null>(null);
  const [robotDragging, setRobotDragging] = useState(false);
  const [robotPop, setRobotPop] = useState(false);
  const robotPopTimer = useRef<number | null>(null);
  const robotRef = useRef<HTMLDivElement>(null);
  const robotDrag = useRef({ active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 });
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
  const [selectedModuleIdx, setSelectedModuleIdx] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [weatherState, setWeatherState] = useState<WeatherPanelState>({ status: "unconfigured" });
  const [todayWeatherState, setTodayWeatherState] = useState<WeatherPanelState>({ status: "unconfigured" });

  const rangeDays = requestedDays(startDate, endDate);
  // 悬停优先，其次保留已选中城市，让背景图持续显示
  const activeCityId =
    hoveredCityId ?? CITY_OPTIONS.find((city) => city.id === selectedDestinationId)?.id ?? null;
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
    usedCostCategories.current.clear();
    usedItineraryTitles.current.clear();
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
    setInjectedCost(null);
    setInjectedItinerary(null);
    usedCostCategories.current.clear();
    usedItineraryTitles.current.clear();
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

  // 打开 / 收起模块快捷导航面板
  function toggleRobotNavPanel() {
    const next = !robotOpen;
    setRobotOpen(next);
    if (next) {
      const target = document.querySelector(".workspace-bar") ?? document.querySelector(".destination-setup__modules");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // 眼睛跟着鼠标小幅移动，让机器人看着你
  useEffect(() => {
    function trackEyes(event: PointerEvent) {
      const el = robotRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height * 0.38;
      const x = Math.max(-3, Math.min(3, (event.clientX - centerX) / 55));
      const y = Math.max(-2, Math.min(2, (event.clientY - centerY) / 70));
      el.style.setProperty("--eye-x", `${x.toFixed(2)}px`);
      el.style.setProperty("--eye-y", `${y.toFixed(2)}px`);
    }
    window.addEventListener("pointermove", trackEyes, { passive: true });
    return () => window.removeEventListener("pointermove", trackEyes);
  }, []);

  function popRobot() {
    setRobotPop(true);
    if (robotPopTimer.current) window.clearTimeout(robotPopTimer.current);
    robotPopTimer.current = window.setTimeout(() => setRobotPop(false), 620);
  }

  function showRobotHint(text: string) {
    setRobotHint(text);
    if (robotHintTimer.current) window.clearTimeout(robotHintTimer.current);
    robotHintTimer.current = window.setTimeout(() => setRobotHint(null), 2800);
  }

  // 点击机器人：随机在预算里加一笔费用，或在行程里加一项安排
  function randomRobotAction() {
    if (robotDrag.current.moved) {
      robotDrag.current.moved = false;
      return;
    }
    popRobot();
    setRobotOpen(false);
    if (!destination) {
      showRobotHint("先选好目的地，我再来帮你加");
      document.querySelector(".destination-setup__form")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const token = ++robotInjectToken.current;
    // 优先挑没用过的类别 / 安排，全部用过后再重新开始
    const freshCategories = COST_CATEGORIES.filter((item) => !usedCostCategories.current.has(item));
    const freshItinerary = RANDOM_ITINERARY.filter((item) => !usedItineraryTitles.current.has(item.title));
    if (Math.random() < 0.5) {
      const pool = freshCategories.length ? freshCategories : COST_CATEGORIES;
      if (!freshCategories.length) usedCostCategories.current.clear();
      const category = pool[Math.floor(Math.random() * pool.length)];
      // 金额以 1 元为一档，在 1~9999 元之间随机取整
      const paid = String(randomCostAmount());
      usedCostCategories.current.add(category);
      setInjectedCost({ token, category, paid });
      setActiveView("budget");
      showRobotHint(`已加一笔「${category}」费用 ¥${paid}`);
    } else {
      const pool = freshItinerary.length ? freshItinerary : RANDOM_ITINERARY;
      if (!freshItinerary.length) usedItineraryTitles.current.clear();
      const pick = pool[Math.floor(Math.random() * pool.length)];
      usedItineraryTitles.current.add(pick.title);
      setInjectedItinerary({ token, ...pick });
      setActiveView("itinerary");
      showRobotHint(`已加安排「${pick.title}」`);
    }
  }

  // 从机器人面板跳到对应模块；未进入工作区时先滚到模块卡片
  function jumpToModule(idx: number) {
    setRobotOpen(false);
    if (destination) {
      setActiveView(MODULE_VIEWS[idx]);
      document.querySelector(".workspace-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setSelectedModuleIdx(idx);
      document.querySelector(".destination-setup__modules")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleRobotPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!(event.target as HTMLElement).closest(".robot-mascot__hit")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    robotDrag.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    };
    const width = rect.width;
    const height = rect.height;
    const onMove = (moveEvent: PointerEvent) => {
      const drag = robotDrag.current;
      if (!drag.active) return;
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      setRobotDragging(true);
      setRobotPos({
        x: Math.min(Math.max(0, drag.originX + dx), Math.max(0, window.innerWidth - width)),
        y: Math.min(Math.max(0, drag.originY + dy), Math.max(0, window.innerHeight - height)),
      });
    };
    const onEnd = () => {
      robotDrag.current.active = false;
      setRobotDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  useEffect(() => {
    if (!robotOpen) return;
    function handleOutside(event: PointerEvent) {
      if (robotRef.current && !robotRef.current.contains(event.target as Node)) setRobotOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setRobotOpen(false);
    }
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [robotOpen]);

  useEffect(() => () => {
    if (robotHintTimer.current) window.clearTimeout(robotHintTimer.current);
  }, []);

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
          <section
            className={`destination-setup${activeCityId ? " is-city-hover" : ""}`}
            aria-labelledby="destination-setup-title"
            onMouseLeave={() => setHoveredCityId(null)}
          >
            <div className="destination-setup__bg" aria-hidden="true">
              {CITY_OPTIONS.map((city) => (
                <img
                  key={city.id}
                  src={city.imageUrl}
                  alt=""
                  className={activeCityId === city.id ? "is-active" : undefined}
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </div>
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
            <aside className="destination-index" aria-label="已登记城市目录" onMouseLeave={() => setHoveredCityId(null)}>
              <header className="destination-index__head">
                <span className="destination-index__kicker">CITY INDEX</span>
                <span className="destination-index__count">05 个已登记城市</span>
              </header>
              <ul>
                {CITY_OPTIONS.map((city, index) => (
                  <li
                    key={city.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedDestinationId === city.id}
                    data-tooltip-label={`${city.name} · ${city.province}`}
                    onMouseEnter={() => setHoveredCityId(city.id)}
                    onFocus={() => setHoveredCityId(city.id)}
                    onBlur={() => setHoveredCityId(null)}
                    onClick={() => { setSelectedDestinationId(city.id); setDestinationError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDestinationId(city.id);
                        setDestinationError(null);
                      }
                    }}
                  >
                    <img
                      className="destination-index__thumb"
                      src={city.imageUrl}
                      alt={`${city.name} 风景`}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="destination-index__no">{String(index + 1).padStart(2, "0")}</span>
                    <strong>{city.name}</strong>
                    <span className="destination-index__province">{city.province}</span>
                    {/* hover 弹出大图预览 */}
                    <img
                      className="destination-index__popup"
                      src={city.imageUrl}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                    />
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
                <p>所有模块共用同一目的地与日期，切换工具不会重复请求数据。点击卡片查看详情 →</p>
              </div>
              <div className="module-scroll-wrap">
                <ul className="module-scroll" role="list">
                  {MODULE_OPTIONS.map((m, idx) => (
                    <li
                      key={m.no}
                      className="module-card"
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedModuleIdx === idx}
                      onClick={() => setSelectedModuleIdx(selectedModuleIdx === idx ? null : idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedModuleIdx(selectedModuleIdx === idx ? null : idx);
                        }
                      }}
                    >
                      <div className="module-card__body">
                        <span className="module-card__no">{m.no}</span>
                        <strong>{m.title}</strong>
                        <p>{m.desc}</p>
                      </div>
                      <div className="module-card__media" aria-hidden="true">
                        <img src={m.imageSrc} alt="" loading="lazy" />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {selectedModuleIdx !== null && MODULE_OPTIONS[selectedModuleIdx] && (
                <div className="module-detail" role="region" aria-label={`${MODULE_OPTIONS[selectedModuleIdx].title} 模块详情`}>
                  <div className="module-detail__body">
                    <span className="module-detail__no">{MODULE_OPTIONS[selectedModuleIdx].no}</span>
                    <h3>{MODULE_OPTIONS[selectedModuleIdx].title}</h3>
                    <p>{MODULE_OPTIONS[selectedModuleIdx].desc}</p>
                    <button type="button" className="module-detail__close" onClick={() => setSelectedModuleIdx(null)}>收起</button>
                  </div>
                </div>
              )}
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
                <div className="workspace-chip workspace-chip--dest">
                  <img
                    className="workspace-destination__thumb"
                    src={destination.imageUrl}
                    alt={`${destination.name} 缩略图`}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="workspace-chip__body">
                    <span className="workspace-chip__label">目的地</span>
                    <strong className="workspace-destination">{destination.name}</strong>
                    <span className="workspace-chip__meta">{destination.province}</span>
                  </div>
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
              <div className="workspace-bar__nav">
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
              </div>
            </section>
            <div className="workspace-hint">
              <span className="workspace-hint__tag">当前工作区</span>
              <span className="workspace-hint__text">{destination.name} · {startDate} 至 {endDate}{rangeDays !== null && rangeDays > 0 ? ` · ${rangeDays} 天` : ""}</span>
              <span className="workspace-hint__note">七个模块共享同一目的地与日期；切换工具不会重复请求数据。</span>
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
          <WeatherBackdrop date={defaultStartDate} state={todayWeatherState} />
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
            <div className="workspace-view" hidden={activeView !== "budget"} key={`budget-${workspaceKey}`}><BudgetPanel destinationName={destination.name} injectedCost={injectedCost} /></div>
            <div className="workspace-view" hidden={activeView !== "transport"} key={`transport-${workspaceKey}`}><TransportPanel key={workspaceKey} initialDestination={destination.name} initialOrigin={originPlace} originLocationStatus={originLocationStatus} /></div>
            <div className="workspace-view" hidden={activeView !== "itinerary"} key={`itinerary-${workspaceKey}`}><ItineraryPanel destinationName={destination.name} startDate={startDate} endDate={endDate} injectedItem={injectedItinerary} /></div>
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

      {/* 小机器人：可拖动，点击随机去预算/交通/行程，右上角“模块”打开七宫格 */}
      <div
        ref={robotRef}
        className={`robot-mascot${robotDragging ? " is-dragging" : ""}${robotOpen ? " is-open" : ""}${robotHint ? " is-hint" : ""}${robotPop ? " is-pop" : ""}`}
        style={robotPos ? { left: robotPos.x, top: robotPos.y, right: "auto", bottom: "auto" } : undefined}
        onPointerDown={handleRobotPointerDown}
      >
        <span className="robot-mascot__bubble" aria-hidden="true">{robotHint ?? "需要我帮你规划吗？"}</span>
        <button
          type="button"
          className="robot-mascot__menu"
          aria-label="打开模块快捷导航"
          aria-expanded={robotOpen}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); toggleRobotNavPanel(); }}
        >
          <span aria-hidden="true">☰</span>模块
        </button>
        {robotOpen && (
          <div className="robot-nav" role="group" aria-label="模块快捷跳转" onPointerDown={(e) => e.stopPropagation()}>
            <p className="robot-nav__title" aria-hidden="true">跳到模块</p>
            {MODULE_OPTIONS.map((m, idx) => (
              <button key={m.no} type="button" aria-label={`跳转到${m.title}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); jumpToModule(idx); }}>
                <span aria-hidden="true">{m.no}</span>
                {m.title}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="robot-mascot__hit"
          aria-label="随机添加一笔预算费用或一项行程安排"
          onClick={(e) => { e.stopPropagation(); randomRobotAction(); }}
        >
          <svg className="robot-mascot__svg" viewBox="0 0 120 132" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="robotBodyGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#5BC4ED" />
                <stop offset="100%" stopColor="#23ADE5" />
              </linearGradient>
            </defs>
            <ellipse className="robot-shadow" cx="60" cy="124" rx="26" ry="5" fill="rgba(24,25,28,.16)" />
            <line x1="60" y1="20" x2="60" y2="29" stroke="#B9BEC4" strokeWidth="2.5" strokeLinecap="round" />
            <circle className="robot-antenna" cx="60" cy="15" r="5" fill="#23ADE5" />
            <rect x="21" y="40" width="8" height="15" rx="4" fill="#E3E5E8" />
            <rect x="91" y="40" width="8" height="15" rx="4" fill="#E3E5E8" />
            <rect x="30" y="28" width="60" height="44" rx="18" fill="#FFFFFF" />
            <rect x="37" y="35" width="46" height="30" rx="13" fill="#18191C" />
            <g className="robot-eye">
              <g className="robot-pupils">
                <circle cx="50" cy="48" r="4.6" fill="#23ADE5" />
                <circle cx="70" cy="48" r="4.6" fill="#23ADE5" />
              </g>
            </g>
            <path d="M53 58.5h14" stroke="#23ADE5" strokeWidth="3" strokeLinecap="round" />
            <rect x="34" y="76" width="52" height="34" rx="14" fill="url(#robotBodyGrad)" />
            <circle cx="60" cy="90" r="6" fill="#FFFFFF" fillOpacity=".82" />
            <rect x="47" y="93" width="26" height="3" rx="1.5" fill="#FFFFFF" fillOpacity=".5" />
            <g className="robot-arm robot-arm--left">
              <rect x="22" y="80" width="9" height="22" rx="4.5" fill="#5BC4ED" />
            </g>
            <g className="robot-arm robot-arm--right">
              <rect x="89" y="80" width="9" height="22" rx="4.5" fill="#5BC4ED" />
            </g>
            <rect x="45" y="109" width="11" height="9" rx="4" fill="#B9BEC4" />
            <rect x="64" y="109" width="11" height="9" rx="4" fill="#B9BEC4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
