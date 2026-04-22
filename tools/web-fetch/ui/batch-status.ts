export type BatchPageStatus = "pending" | "fetching" | "extracting" | "summarizing" | "done" | "error";

export interface BatchPageState {
  url: string;
  status: BatchPageStatus;
  error?: string;
}

export interface BatchDetails {
  pages: BatchPageState[];
}
