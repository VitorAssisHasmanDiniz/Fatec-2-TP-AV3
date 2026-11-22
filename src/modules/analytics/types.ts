import type { AnalyticsReportType } from '../../generated/prisma/client.js';

/** Shared contracts for the independent analytics module. */
export type AnalyticsReportTypeValue = AnalyticsReportType;

export interface AnalyticsRunParams {
  organizationId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ReportResult<TSummary = unknown, TRows = unknown> {
  reportId: string;
  type: AnalyticsReportTypeValue;
  generatedAt: Date;
  modelVersion: string;
  parameters: AnalyticsRunParams;
  summary: TSummary | null;
  rows: TRows[];
}

export interface ReportHistoryFilters {
  organizationId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}
