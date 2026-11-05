import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./checklist-panel.css";

type ChecklistItem = {
  id: string;
  label: string;
  category: string;
  checked: boolean;
};

const CATEGORIES = ["证件与票务", "衣物与装备", "电子设备", "健康与应急", "其他"] as const;

const TEMPLATE: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["证件与票务", ["身份证", "预订确认单", "交通票据"]],
  ["衣物与装备", ["换洗衣物", "外套", "步行鞋"]],
  ["电子设备", ["充电器", "移动电源", "转换插头"]],
  ["健康与应急", ["常用药", "创可贴", "口罩"]],
];

function buildTemplate(): ChecklistItem[] {
  return TEMPLATE.flatMap(([category, labels]) =>
    labels.map((label) => ({
      id: `${category}-${label}`,
      label,
      category,
      checked: false,
    })),
  );
}

function countDays(startDate: string, endDate: string): number | null {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

type ChecklistPanelProps = {
  destinationName: string;
  startDate: string;
  endDate: string;
};

export function ChecklistPanel({ destinationName, startDate, endDate }: ChecklistPanelProps) {
  const [items, setItems] = useState<ChecklistItem[]>(buildTemplate);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>(CATEGORIES[0]);

  const days = countDays(startDate, endDate);
  const checkedCount = useMemo(() => items.filter((item) => item.checked).length, [items]);
  const progress = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;
  const grouped = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        items: items.filter((item) => item.category === category),
      })).filter((group) => group.items.length > 0),
    [items],
  );

  function toggleItem(id: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = draftLabel.trim();
    if (!label) return;
    const id = `custom-${label}-${Date.now()}`;
    setItems((current) => [...current, { id, label, category: draftCategory, checked: false }]);
    setDraftLabel("");
  }

  function resetChecklist() {
    setItems(buildTemplate());
    setDraftLabel("");
  }

  return (
    <section className="checklist-page" aria-labelledby="checklist-title">
      <header className="checklist-page__head">
        <div>
          <p className="checklist-page__kicker">BEFORE DEPARTURE / CHECKLIST</p>
          <h1 id="checklist-title">行前清单</h1>
          <p className="checklist-page__meta">
            {destinationName} · {startDate} 至 {endDate}
            {days !== null && days > 0 ? ` · ${days} 天` : ""}
          </p>
        </div>
        <span className="checklist-page__stamp" aria-hidden="true">READY</span>
      </header>

      <div className="checklist-layout">
        <div className="checklist-progress-card">
          <span className="checklist-progress-card__label">准备进度</span>
          <strong className="checklist-progress-card__value">
            {checkedCount}
            <span> / {items.length}</span>
          </strong>
          <div className="checklist-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="checklist-progress-card__note">
            这份清单只保存在当前页面，刷新后不会保留。
          </p>
          <button type="button" className="checklist-reset" onClick={resetChecklist}>
            恢复默认清单
          </button>
        </div>

        <div className="checklist-groups">
          {grouped.map((group) => {
            const done = group.items.filter((item) => item.checked).length;
            return (
              <section className="checklist-group" key={group.category} aria-label={`${group.category}清单`}>
                <header className="checklist-group__head">
                  <h2>{group.category}</h2>
                  <span>{done} / {group.items.length}</span>
                </header>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id} className={item.checked ? "is-done" : undefined}>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleItem(item.id)}
                        />
                        <span>{item.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <form className="checklist-add" onSubmit={addItem}>
        <label className="checklist-add__field">
          <span>新清单项</span>
          <input
            value={draftLabel}
            maxLength={40}
            onChange={(event) => setDraftLabel(event.target.value)}
            placeholder="例如：雨具、保温杯"
          />
        </label>
        <label className="checklist-add__field">
          <span>清单分类</span>
          <select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value)}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="checklist-add__button" disabled={!draftLabel.trim()}>
          添加清单项
        </button>
      </form>
    </section>
  );
}
