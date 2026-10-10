export type SettingDefinition =
  | { key: string; label: string; description: string; type: 'boolean'; default: boolean }
  | { key: string; label: string; description: string; type: 'number'; default: number; min?: number; max?: number }
  | { key: string; label: string; description: string; type: 'string'; default: string }
  | { key: string; label: string; description: string; type: 'enum'; default: string; options: string[]; optionLabels?: Record<string, string> };

export const SETTING_DEFINITIONS = [
  { key: 'company.name', label: 'Company name', description: 'Shown on quotations and invoices', type: 'string', default: 'Acme Trading Co.' },
  { key: 'company.currency', label: 'Currency', description: 'ISO 4217 currency code used for display', type: 'enum', default: 'MMK', options: ['MMK', 'USD', 'THB', 'SGD', 'CNY', 'EUR', 'GBP', 'JPY'] },
  { key: 'approval.allowSelfApproval', label: 'Allow self-approval', description: 'If enabled, an approver may approve a quotation they requested or own', type: 'boolean', default: false },
  { key: 'approval.fallbackRoleCode', label: 'Approval fallback role', description: 'Role that receives team-manager approvals when no eligible manager exists', type: 'enum', default: 'DIRECTOR', options: ['DIRECTOR', 'SALES_MANAGER'], optionLabels: { DIRECTOR: 'Director', SALES_MANAGER: 'Sales manager' } },
  { key: 'quotation.defaultValidityDays', label: 'Quotation validity (days)', description: 'Default validity period of new quotations', type: 'number', default: 30, min: 1, max: 365 },
  { key: 'quotation.defaultTaxRate', label: 'Default tax rate (%)', description: 'Default tax rate applied to new quotation lines', type: 'number', default: 0, min: 0, max: 100 },
  { key: 'invoice.defaultPaymentTermsDays', label: 'Default payment terms (days)', description: 'Used when a customer has no specific terms', type: 'number', default: 30, min: 0, max: 365 },
  { key: 'credit.blockOnExceed', label: 'Block invoices over credit limit', description: 'If enabled, issuing an invoice that exceeds the credit limit (or for a customer on hold) is blocked instead of warned', type: 'boolean', default: false },
  { key: 'targets.achievementBasis', label: 'Target achievement basis', description: 'What counts toward sales targets', type: 'enum', default: 'WON_OPPORTUNITIES', options: ['WON_OPPORTUNITIES', 'INVOICED'], optionLabels: { WON_OPPORTUNITIES: 'Won opportunities', INVOICED: 'Invoiced amount' } },
] as const satisfies readonly SettingDefinition[];

export type SettingKey = (typeof SETTING_DEFINITIONS)[number]['key'];
