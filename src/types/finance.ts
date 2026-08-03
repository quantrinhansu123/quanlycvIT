export type FinanceType = "thu" | "chi";
export interface FinanceCategory { id: string; name: string; type: FinanceType; monthlyBudget?: number; }
export interface FinanceCategoryInput { name: string; type: FinanceType; monthlyBudget?: number; }
export interface FinanceFileAttachment { name: string; url: string; }
export interface FinanceLinkAttachment { label?: string; url: string; description?: string; }
export interface FinanceTransaction { id: string; type: FinanceType; amount: number; date: string; categoryId: string; category?: FinanceCategory; description?: string; receiptImages: string[]; receiptFiles: FinanceFileAttachment[]; receiptLinks: FinanceLinkAttachment[]; /** Liên kết đầu tiên, giữ tương thích với bảng và dữ liệu cũ. */ receiptUrl?: string; createdAt: string; }
export interface FinanceInput { type: FinanceType; amount: number; date: string; categoryId: string; description?: string; receiptImages?: string[]; receiptFiles?: FinanceFileAttachment[]; receiptLinks?: FinanceLinkAttachment[]; }
export interface FinanceSummary { income: number; expense: number; balance: number; series: { date: string; type: FinanceType; amount: number }[]; budgets: { category: FinanceCategory; spent: number }[]; }
export interface FinanceTransactionPage { items: FinanceTransaction[]; total: number; }
export interface FinanceDashboardData { categories: FinanceCategory[]; summary: FinanceSummary; transactions: FinanceTransactionPage; }
export interface FinanceTransferRecipient { id: string; name: string; bankAccount: string; bankName: string; }
