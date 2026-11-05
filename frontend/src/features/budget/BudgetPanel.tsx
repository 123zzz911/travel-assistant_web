import { useState } from "react";
import type { FormEvent } from "react";
import type { components } from "../../shared/api-contracts";
import { calculateBudget, type BudgetResponse } from "./api";
import { formatFen, parseYuanToFen } from "./money";
import "./budget-panel.css";

type CostCategory = components["schemas"]["CostItem"]["category"];

type CostDraft = {
  id: string;
  category: CostCategory;
  paid: string;
  unpaid: string;
  userQuote: boolean;
};

const CATEGORIES: CostCategory[] = ["往返交通", "住宿", "餐饮", "市内交通", "门票", "活动", "其他"];

function newCost(): CostDraft {
  return { id: crypto.randomUUID(), category: "往返交通", paid: "", unpaid: "", userQuote: false };
}

function moneyLabel(value: number | null): string {
  return formatFen(value);
}

export function BudgetPanel({ destinationName }: { destinationName: string }) {
  const [total, setTotal] = useState("");
  const [reserve, setReserve] = useState("");
  const [costs, setCosts] = useState<CostDraft[]>([newCost()]);
  const [summary, setSummary] = useState<BudgetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateCost(id: string, patch: Partial<CostDraft>) {
    setCosts((current) => current.map((cost) => cost.id === id ? { ...cost, ...patch } : cost));
    setSummary(null);
  }

  function addCost() {
    setCosts((current) => [...current, newCost()]);
    setSummary(null);
  }

  function removeCost(id: string) {
    setCosts((current) => current.filter((cost) => cost.id !== id));
    setSummary(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSummary(null);

    try {
      const totalBudget = parseYuanToFen(total);
      const reserveFen = parseYuanToFen(reserve);
      const costItems = costs.map((cost) => {
        const paidFen = parseYuanToFen(cost.paid);
        const unpaidFen = parseYuanToFen(cost.unpaid);
        return {
          cost_id: cost.id,
          category: cost.category,
          reservation_id: null,
          paid_fen: paidFen,
          unpaid_estimate_fen: unpaidFen,
          evidence_state: "user_provided" as const,
          completeness: paidFen !== null && unpaidFen !== null ? "complete" as const : "needs_review" as const,
        };
      });

      setLoading(true);
      const result = await calculateBudget({
        trip_id: "current-trip",
        total_budget_fen: totalBudget,
        reserve_fen: reserveFen,
        cost_items: costItems,
      });
      setSummary(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "预算计算失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  const hasQuoteCategory = costs.some((cost) => cost.userQuote && ["住宿", "往返交通"].includes(cost.category));

  return (
    <section className="budget-page" aria-labelledby="budget-title">
      <header className="budget-heading">
        <div>
          <p className="budget-eyebrow">TRIP FINANCES / 01</p>
          <h1 id="budget-title">旅行预算</h1>
          <p>整趟旅行总额 · 全体出行人员 · 人民币</p>
        </div>
        <span className="budget-session-note">仅本页计算，不会自动保存</span>
      </header>
      <p className="budget-destination">目的地：<strong>{destinationName}</strong></p>

      <section className="budget-guide" aria-labelledby="budget-guide-title">
        <div className="budget-guide__head">
          <p className="budget-step">READ ME</p>
          <h2 id="budget-guide-title">预算口径</h2>
        </div>
        <ul>
          <li><strong>留空 ≠ 0 元</strong><span>未确认的金额请留空，计算时会按待核实处理。</span></li>
          <li><strong>仅本页计算</strong><span>不连接平台房价、机票或其他实时报价。</span></li>
          <li><strong>预留金由你决定</strong><span>系统不会自动替你补充预留金额。</span></li>
        </ul>
      </section>

      <form className="budget-form" onSubmit={handleSubmit} noValidate>
        <section className="budget-block" aria-labelledby="budget-setup-title">
          <div className="budget-block__heading">
            <div>
              <p className="budget-step">01 / PLAN</p>
              <h2 id="budget-setup-title">设置预算与预留金</h2>
            </div>
            <p>未设置与明确填写 0 元含义不同</p>
          </div>
          <div className="budget-top-fields">
            <label className="budget-field">
              <span>整趟总预算</span>
              <span className="budget-input-wrap">
                <span aria-hidden="true">¥</span>
                <input inputMode="decimal" autoComplete="off" value={total} onChange={(event) => { setTotal(event.target.value); setSummary(null); }} aria-label="整趟总预算（元）" placeholder="例如 6000" />
              </span>
            </label>
            <label className="budget-field">
              <span>手动预留金 <small>可不设置</small></span>
              <span className="budget-input-wrap">
                <span aria-hidden="true">¥</span>
                <input inputMode="decimal" autoComplete="off" value={reserve} onChange={(event) => { setReserve(event.target.value); setSummary(null); }} aria-label="预留金（元）" placeholder="不预留请留空" />
              </span>
            </label>
          </div>
        </section>

        <section className="budget-block" aria-labelledby="cost-list-title">
          <div className="budget-block__heading">
            <div>
              <p className="budget-step">02 / COSTS</p>
              <h2 id="cost-list-title">费用明细</h2>
            </div>
            <button className="text-button" type="button" onClick={addCost}>添加费用</button>
          </div>
          <p className="budget-inline-note">已支付与预计待支付分别填写；没有可确认金额时留空，不要填 0。</p>
          <div className="cost-list">
            {costs.length === 0 && <p className="cost-empty">还没有费用项。可先添加已知的交通、住宿或其他费用。</p>}
            {costs.map((cost, index) => (
              <fieldset className="cost-row" key={cost.id}>
                <legend>费用项 {index + 1}</legend>
                <label className="budget-field cost-category">
                  <span>类别</span>
                  <select value={cost.category} onChange={(event) => updateCost(cost.id, { category: event.target.value as CostCategory })}>
                    {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="budget-field">
                  <span>已支付（元）</span>
                  <input inputMode="decimal" autoComplete="off" value={cost.paid} onChange={(event) => updateCost(cost.id, { paid: event.target.value })} aria-label={`费用项 ${index + 1} 已支付（元）`} placeholder="待核实可留空" />
                </label>
                <label className="budget-field">
                  <span>预计待支付（元）</span>
                  <input inputMode="decimal" autoComplete="off" value={cost.unpaid} onChange={(event) => updateCost(cost.id, { unpaid: event.target.value })} aria-label={`费用项 ${index + 1} 预计待支付（元）`} placeholder="待核实可留空" />
                </label>
                <label className="cost-user-quote">
                  <input type="checkbox" checked={cost.userQuote} onChange={(event) => updateCost(cost.id, { userQuote: event.target.checked })} />
                  <span>这是我补填的未报价费用</span>
                </label>
                <button className="remove-cost" type="button" onClick={() => removeCost(cost.id)} aria-label={`删除费用项 ${index + 1}`} title="删除费用">删除</button>
              </fieldset>
            ))}
          </div>
          {hasQuoteCategory && <p className="budget-source-warning" role="note">用户填写，非平台报价。金额不会被视为已验证供应商报价。</p>}
          <p className="budget-source-note">费用来源按用户填写记录；本工具不查询平台房价、机票或其他实时报价。</p>
        </section>

        {error && <p className="budget-error" role="alert">{error}</p>}
        <div className="budget-submit-row">
          <p>输入金额最多两位小数 · 预算与费用不会跨刷新保存</p>
          <button className="budget-submit" type="submit" disabled={loading}>
            {loading ? "正在计算…" : "计算预算"}
          </button>
        </div>
      </form>

      {summary && <BudgetResult summary={summary} />}
    </section>
  );
}

function BudgetResult({ summary }: { summary: BudgetResponse }) {
  const stateLabel = {
    unconfigured: "尚未设置总预算",
    needs_review: "部分费用待核实",
    within_budget: "预计在预算内",
    over_budget: summary.completeness === "needs_review" ? "已知费用至少超出" : "超出预算",
  }[summary.budget_state];

  return (
    <section className={`budget-result budget-result--${summary.budget_state}`} aria-labelledby="budget-result-title" aria-live="polite">
      <div className="budget-result__heading">
        <div>
          <p className="budget-step">03 / SUMMARY</p>
          <h2 id="budget-result-title">预算概览</h2>
        </div>
        <p className="budget-state" role="status">{stateLabel}</p>
      </div>
      <div className="budget-metrics">
        <Metric label="已支付" value={moneyLabel(summary.paid_total_fen)} detail="已计入总预算" />
        <Metric label="剩余可安排" value={moneyLabel(summary.remaining_to_allocate_fen)} detail="总预算 − 已支付" />
        <Metric label="预计结余" value={moneyLabel(summary.expected_balance_fen)} detail="扣除已付、待付和预留金" />
        <Metric label="已知待支付" value={formatFen(summary.known_unpaid_total_fen)} detail={summary.completeness === "needs_review" ? "已知小计，仍有费用待核实" : "费用明细合计"} />
      </div>
      {summary.minimum_over_budget_fen !== null && <p className="budget-overrun" role="alert">按目前已知金额，至少超出 {formatFen(summary.minimum_over_budget_fen)}。缺失费用可能增加超出金额。</p>}
      {summary.reserve_reminder && <p className="budget-reminder" role="note">总预算达到 3,000 元，尚未设置预留金。预留金由你决定，系统不会自动填写。</p>}
      {summary.completeness === "needs_review" && <p className="budget-review-note">有费用金额或归属尚未核实；已知小计不代表最终支出。</p>}
      <p className="budget-request-id">计算请求编号：{summary.request_id}</p>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="budget-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
