import { post, ApiResponse } from "../utils/request";

export type TtsResult = { url: string };

/** Synthesize text via server TTS (object-store cached by text hash). */
export const synthesizeTts = (
  text: string,
  opts?: { lang?: string }
): Promise<ApiResponse<TtsResult>> => {
  return post("/tts", {
    text,
    ...(opts?.lang ? { lang: opts.lang } : {}),
  });
};
