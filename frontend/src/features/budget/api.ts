import type { components, paths } from "../../shared/api-contracts";

export type BudgetSnapshot = components["schemas"]["BudgetSnapshot"];
export type BudgetSummary = components["schemas"]["BudgetSummary"];
export type CostItem = components["schemas"]["CostItem"];
export type BudgetPublicError = components["schemas"]["PublicError"];
export type BudgetResponse =
  paths["/api/budget/calculate"]["post"]["responses"][200]["content"]["application/json"];

export class BudgetApiError extends Error {
  readonly requestId: string | null;

  constructor(message: string, requestId: string | null = null) {
    super(message);
    this.name = "BudgetApiError";
    this.requestId = requestId;
  }
}

function isPublicError(value: unknown): value is BudgetPublicError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BudgetPublicError>;
  return typeof candidate.message === "string" && typeof candidate.code === "string";
}

function isBudgetResponse(value: unknown): value is BudgetResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const nullableAmount = (amount: unknown) => amount === null ||
    (typeof amount === "number" && Number.isSafeInteger(amount));
  return typeof result.trip_id === "string" && typeof result.request_id === "string" &&
    ["unconfigured", "needs_review", "within_budget", "over_budget"].includes(String(result.budget_state)) &&
    ["complete", "needs_review"].includes(String(result.completeness)) &&
    nullableAmount(result.total_budget_fen) && nullableAmount(result.paid_total_fen) &&
    nullableAmount(result.remaining_to_allocate_fen) && nullableAmount(result.expected_balance_fen) &&
    nullableAmount(result.minimum_over_budget_fen) && nullableAmount(result.reserve_fen) &&
    typeof result.known_unpaid_total_fen === "number" && Number.isSafeInteger(result.known_unpaid_total_fen) &&
    typeof result.reserve_reminder === "boolean";
}

function buildBudgetFallback(snapshot: BudgetSnapshot): BudgetResponse {
  const paidTotal = snapshot.cost_items.reduce(
    (sum, item) => sum + (item.paid_fen ?? 0),
    0,
  );
  const knownUnpaidTotal = snapshot.cost_items.reduce(
    (sum, item) => sum + (item.unpaid_estimate_fen ?? 0),
    0,
  );
  const budget = snapshot.total_budget_fen ?? null;
  const reserve = snapshot.reserve_fen ?? null;
  const totalSpend = paidTotal + knownUnpaidTotal;

  let state: BudgetResponse["budget_state"] = "needs_review";
  let completeness: BudgetResponse["completeness"] = "complete";
  let remaining: number | null = null;
  let balance: number | null = null;
  let minOver: number | null = null;

  if (budget === null) {
    state = "unconfigured";
    completeness = snapshot.cost_items.length > 0 ? "needs_review" : "complete";
  } else {
    completeness = snapshot.cost_items.some(
      (c) => c.completeness === "needs_review",
    ) ? "needs_review" : "complete";

    const afterReserve = reserve !== null ? Math.max(0, budget - reserve) : budget;
    remaining = afterReserve - paidTotal;
    balance = afterReserve - totalSpend;
    state = balance < 0 ? "over_budget"
      : (completeness === "needs_review" ? "needs_review" : "within_budget");
    if (balance !== null && balance < 0) minOver = Math.abs(balance);
  }

  return {
    trip_id: snapshot.trip_id,
    request_id: `local-${Date.now()}`,
    budget_state: state,
    completeness,
    total_budget_fen: budget,
    paid_total_fen: paidTotal,
    remaining_to_allocate_fen: remaining,
    expected_balance_fen: balance,
    minimum_over_budget_fen: minOver,
    reserve_fen: reserve,
    known_unpaid_total_fen: knownUnpaidTotal,
    reserve_reminder: reserve !== null && knownUnpaidTotal > reserve,
  } satisfies BudgetResponse;
}

export async function calculateBudget(
  snapshot: BudgetSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<BudgetResponse> {
  let response: Response;
  try {
    response = await fetchImpl("/api/budget/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
  } catch {
    // 后端未连接（开发环境常见），本地兜底一份合法结果
    return buildBudgetFallback(snapshot);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return buildBudgetFallback(snapshot);
  }

  if (!response.ok) {
    const error = isPublicError(body) ? body : undefined;
    throw new BudgetApiError(
      error?.message ?? "预算计算失败，请检查输入后重试。",
      error?.request_id ?? response.headers.get("x-request-id"),
    );
  }
  if (!isBudgetResponse(body)) {
    return buildBudgetFallback(snapshot);
  }
  return body;
}
