import { get, post, type ApiResponse } from "../utils/request";
import type { UserSubscription } from "./coaching";

export type WechatPayParams = {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
};

export type WechatPayJSAPIResult = {
  oauthUrl?: string;
  outTradeNo?: string;
  pay?: WechatPayParams;
};

export function createWechatPay(body: { plan: string; code?: string }): Promise<ApiResponse<WechatPayJSAPIResult>> {
  return post("/pay/wechat/jsapi", body);
}

export function createWechatNativePay(body: { plan: string }): Promise<ApiResponse<{ outTradeNo: string; codeUrl: string }>> {
  return post("/pay/wechat/native", body);
}

export function getMySubscription(): Promise<ApiResponse<UserSubscription | null>> {
  return get("/pay/subscription");
}

export function getWechatPayOrder(outTradeNo: string): Promise<ApiResponse<{ status: string; plan: string }>> {
  return get(`/pay/wechat/orders/${encodeURIComponent(outTradeNo)}`);
}
