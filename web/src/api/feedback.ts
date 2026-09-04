import { get, post } from "../utils/request";

export type FeedbackReply = {
  id: number;
  role: "user" | "admin" | string;
  content: string;
  createdAt: string;
};

export type FeedbackTicket = {
  id: number;
  content: string;
  contact?: string;
  status: "open" | "closed" | string;
  userUnread?: boolean;
  lastRepliedAt?: string;
  lastReplierRole?: string;
  lastReplyPreview?: string;
  replyCount: number;
  createdAt: string;
  replies?: FeedbackReply[];
};

export type ListFeedbackResponse = {
  list: FeedbackTicket[];
  total: number;
  page: number;
  pageSize: number;
};

export const listFeedback = (params?: { page?: number; pageSize?: number }) =>
  get<ListFeedbackResponse>("/feedback", { params });

export const getFeedbackUnreadCount = () =>
  get<{ count: number }>("/feedback/unread-count");

export const markFeedbackReadAll = () => post<null>("/feedback/read-all");

export const getFeedback = (id: number) => get<FeedbackTicket>(`/feedback/${id}`);

export const createFeedback = (body: { content: string; contact?: string }) =>
  post<FeedbackTicket>("/feedback", body);

export const replyFeedback = (id: number, content: string) =>
  post<FeedbackTicket>(`/feedback/${id}/replies`, { content });

export const uploadFeedbackImage = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return post<{ url: string; width?: number; height?: number }>("/feedback/images", form, {
    timeout: 120_000,
  });
};
