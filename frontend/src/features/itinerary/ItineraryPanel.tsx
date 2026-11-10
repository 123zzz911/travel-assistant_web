import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./itinerary-panel.css";

type ItineraryItem = { id: string; date: string; time: string; title: string; note: string; locked: boolean; completed: boolean };

/** 小机器人随机添加的一项安排 */
export type InjectedItinerary = { token: number; title: string; time: string; note: string };

function newItem(date: string): ItineraryItem {
  return { id: crypto.randomUUID(), date, time: "09:00", title: "", note: "", locked: false, completed: false };
}

export function ItineraryPanel({ destinationName, startDate, endDate, injectedItem }: { destinationName: string; startDate: string; endDate: string; injectedItem?: InjectedItinerary | null }) {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [draft, setDraft] = useState(() => newItem(startDate));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dates = useMemo(() => {
    const result: string[] = [];
    const start = new Date(`${startDate}T12:00:00+08:00`);
    const end = new Date(`${endDate}T12:00:00+08:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [startDate];
    for (let date = start; date <= end; date = new Date(date.getTime() + 86_400_000)) result.push(date.toISOString().slice(0, 10));
    return result;
  }, [startDate, endDate]);

  // 小机器人随机添加一项安排：日期在行程区间内随机取一天
  useEffect(() => {
    if (!injectedItem) return;
    const date = dates[Math.floor(Math.random() * dates.length)] ?? startDate;
    setItems((current) => [...current, {
      id: crypto.randomUUID(),
      date,
      time: injectedItem.time,
      title: injectedItem.title,
      note: injectedItem.note,
      locked: false,
      completed: false,
    }].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)));
    const timer = window.setTimeout(() => {
      document.querySelector(".itinerary-list .itinerary-item:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [injectedItem, dates, startDate]);

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) { setError("请填写安排名称。"); return; }
    const updated = { ...draft, title: draft.title.trim(), note: draft.note.trim() };
    setItems((current) => (editingId
      ? current.map((item) => item.id === editingId ? updated : item)
      : [...current, updated]
    ).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)));
    setDraft(newItem(draft.date));
    setEditingId(null);
    setError(null);
  }

  function removeItem(id: string) { setItems((current) => current.filter((item) => item.id !== id)); }
  function toggleLock(id: string) { setItems((current) => current.map((item) => item.id === id ? { ...item, locked: !item.locked } : item)); }
  function toggleCompleted(id: string) { setItems((current) => current.map((item) => item.id === id ? { ...item, completed: !item.completed } : item)); }
  function editItem(item: ItineraryItem) { setDraft({ ...item }); setEditingId(item.id); setError(null); }
  function cancelEdit() { setDraft(newItem(startDate)); setEditingId(null); setError(null); }

  const groupedItems = [...new Set(items.map((item) => item.date))].sort().map((date) => ({
    date,
    items: items.filter((item) => item.date === date),
  }));

  return <section className="itinerary-page" aria-labelledby="itinerary-title">
    <header className="itinerary-heading">
      <div><p className="itinerary-eyebrow">TRIP ITINERARY / 01</p><h1 id="itinerary-title">旅行行程</h1><p>按天整理安排，锁定后仅允许手动解锁修改。</p></div>
      <span className="itinerary-session-note">仅本页草稿 · 不会自动保存</span>
    </header>
    <p className="itinerary-destination">目的地：<strong>{destinationName}</strong> · 日期：{startDate} 至 {endDate}</p>
    <section className="itinerary-guide" aria-labelledby="itinerary-guide-title">
      <div className="itinerary-guide__head">
        <p className="itinerary-step">READ ME</p>
        <h2 id="itinerary-guide-title">行程草稿规则</h2>
      </div>
      <ul>
        <li><strong>按天排布</strong><span>添加后自动按日期与时间排序。</span></li>
        <li><strong>锁定保护</strong><span>锁定的安排不可编辑或删除，需要先手动解锁。</span></li>
        <li><strong>不自动推荐</strong><span>不生成景点推荐，也不连接订票或地图服务。</span></li>
      </ul>
    </section>
    <form className="itinerary-form" onSubmit={addItem} noValidate>
      <section className="itinerary-block" aria-labelledby="add-itinerary-title">
        <div className="itinerary-block__heading"><div><p className="itinerary-step">01 / ADD</p><h2 id="add-itinerary-title">{editingId ? "编辑安排" : "添加一项安排"}</h2></div><p>地点、票价与路线请以已核实信息为准</p></div>
        <div className="itinerary-fields">
          <label><span>日期</span><select value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })}>{dates.map((date) => <option key={date} value={date}>{date}</option>)}</select></label>
          <label><span>时间</span><input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label>
          <label className="itinerary-title-field"><span>安排名称</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：外滩散步" /></label>
          <label className="itinerary-note-field"><span>备注 <small>可选</small></span><input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="集合点、预留时间等" /></label>
        </div>
        {error && <p className="itinerary-error" role="alert">{error}</p>}
        <div className="itinerary-form-actions"><button className="itinerary-submit" type="submit">{editingId ? "保存修改" : "添加到行程"}</button>{editingId && <button className="itinerary-cancel" type="button" onClick={cancelEdit}>取消编辑</button>}</div>
      </section>
    </form>
    <section className="itinerary-block itinerary-list-block" aria-labelledby="itinerary-list-title">
      <div className="itinerary-block__heading"><div><p className="itinerary-step">02 / AGENDA</p><h2 id="itinerary-list-title">我的安排</h2></div><p>{items.length ? `${items.length} 项安排` : "还没有安排"}</p></div>
      {items.length === 0 ? <p className="itinerary-empty">先添加第一项安排，行程会按日期和时间排列。</p> : <div className="itinerary-days">{groupedItems.map(({ date, items: dayItems }) => <section className="itinerary-day" key={date} aria-labelledby={`itinerary-day-${date}`}><h3 id={`itinerary-day-${date}`} className="itinerary-day__heading">{date}<span>{dayItems.length} 项</span></h3><div className="itinerary-list">{dayItems.map((item) => <article className={`itinerary-item${item.locked ? " is-locked" : ""}${item.completed ? " is-completed" : ""}`} key={item.id}><div className="itinerary-item__time"><strong>{item.time}</strong></div><div className="itinerary-item__body"><h4>{item.title}</h4>{item.note && <p>{item.note}</p>}{item.locked && <span className="itinerary-locked">已锁定</span>}{item.completed && <span className="itinerary-completed-label">已完成</span>}</div><div className="itinerary-item__actions"><button type="button" onClick={() => toggleCompleted(item.id)}>{item.completed ? "撤销完成" : "已完成"}</button><button type="button" onClick={() => editItem(item)} disabled={item.locked} aria-label={`编辑 ${item.title}`}>编辑</button><button type="button" onClick={() => toggleLock(item.id)}>{item.locked ? "解锁" : "锁定"}</button><button type="button" onClick={() => removeItem(item.id)} disabled={item.locked}>删除</button></div></article>)}</div></section>)}</div>}
      <p className="itinerary-source-note">行程内容来自你的手动输入；本模块不自动生成景点推荐、不连接订票或地图服务。</p>
    </section>
  </section>;
}
