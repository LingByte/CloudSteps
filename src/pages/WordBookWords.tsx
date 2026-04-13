import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, ChevronRight, Search, Volume2, Loader2 } from "lucide-react";
import { CloudButton } from "@/components/cloudsteps";
import { getWordBook, listWordBookWords, type WordBookWord } from "@/api/wordbooks";
import { resolveMediaUrl } from "@/utils/mediaUrl";

function formatPhonetic(w: WordBookWord): string {
  const parts = [w.phonetic, w.phoneticUs, w.phoneticUk].filter((x) => x && String(x).trim());
  if (parts.length === 0) return "";
  return Array.from(new Set(parts.map((p) => String(p).trim()))).join(" · ");
}

function formatMeaning(w: WordBookWord): string {
  const def = w.definition?.trim();
  if (def) return def;
  const raw = w.translation?.trim();
  if (!raw) return "—";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean).join("；");
    }
    if (typeof parsed === "string") return parsed;
  } catch {
    /* not JSON */
  }
  return raw;
}

export default function WordBookWords() {
  const { id: idParam } = useParams<{ id: string }>();
  const bookId = Number(idParam);

  const [bookName, setBookName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [debouncedKw, setDebouncedKw] = useState("");
  const [list, setList] = useState<WordBookWord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 40;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedKw(keyword.trim()), 350);
    return () => window.clearTimeout(t);
  }, [keyword]);

  useEffect(() => {
    setPage(1);
  }, [debouncedKw]);

  const load = useCallback(async () => {
    if (!Number.isFinite(bookId) || bookId <= 0) return;
    setLoading(true);
    setErr(null);
    try {
      const [bookRes, wordsRes] = await Promise.all([
        getWordBook(bookId),
        listWordBookWords(bookId, { page, pageSize, keyword: debouncedKw || undefined }),
      ]);
      if (bookRes.code === 200 && bookRes.data?.name) {
        setBookName(bookRes.data.name);
      }
      if (wordsRes.code !== 200) {
        setErr(wordsRes.msg || "加载单词失败");
        setList([]);
        return;
      }
      const d = wordsRes.data;
      setList(Array.isArray(d?.list) ? d.list : []);
      setTotal(Number(d?.total ?? 0));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "加载失败";
      setErr(msg);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [bookId, page, debouncedKw, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const play = (w: WordBookWord) => {
    if (!w.audioUrl) {
      alert("暂无发音音频");
      return;
    }

    // 拆分音频URL
    const audioUrls = w.audioUrl.split(';').map(url => url.trim()).filter(url => url);
    if (audioUrls.length === 0) {
      alert("暂无有效的发音音频");
      return;
    }

    setPlayingId(w.id);
    
    // 递归播放函数
    const playSequentially = (urls: string[], index: number = 0) => {
      if (index >= urls.length) {
        setPlayingId(null);
        return;
      }

      const src = resolveMediaUrl(urls[index]);
      if (!src) {
        // 如果当前URL无效，播放下一个
        playSequentially(urls, index + 1);
        return;
      }

      const audio = new Audio(src);
      
      audio.onended = () => {
        // 播放下一个音频，间隔0.6秒
        setTimeout(() => {
          playSequentially(urls, index + 1);
        }, 600);
      };
      
      audio.onerror = () => {
        // 播放失败时，尝试播放下一个
        console.warn(`音频播放失败: ${urls[index]}`);
        setTimeout(() => {
          playSequentially(urls, index + 1);
        }, 600);
      };

      // 开始播放
      audio.play().catch((error) => {
        console.warn(`音频播放失败: ${urls[index]}`, error);
        // 播放失败时，尝试播放下一个
        setTimeout(() => {
          playSequentially(urls, index + 1);
        }, 600);
      });
    };

    // 开始播放序列
    playSequentially(audioUrls);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!Number.isFinite(bookId) || bookId <= 0) {
    return (
      <div className="text-[#718096]">
        无效词库{" "}
        <Link to="/word-books" className="text-[#4ECDC4] underline">
          返回
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/word-books">
          <CloudButton
            type="button"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm border border-[#E2E8F0] text-[#4A5568] bg-white"
          >
            <ChevronLeft size={18} />
            词库列表
          </CloudButton>
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5">
        <h1 className="text-lg font-semibold text-[#2D3748]">{bookName || `词库 #${bookId}`}</h1>
        <p className="text-xs text-[#718096] mt-1">共 {total} 个单词{debouncedKw ? "（已筛选）" : ""}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
        <input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索单词、释义…"
          className="w-full pl-10 pr-4 py-3 bg-white border border-[#E2E8F0] rounded-xl text-[#2D3748] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#4ECDC4]"
        />
      </div>

      {err && (
        <div className="bg-white rounded-xl p-4 border border-[#FF6B6B]/30 text-[#FF6B6B] text-sm">{err}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl p-8 text-center text-[#718096] border border-[#E2E8F0]">加载中…</div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-[#718096] border border-[#E2E8F0]">暂无单词</div>
      ) : (
        <div className="space-y-3">
          {list.map((w) => {
            const ipa = formatPhonetic(w);
            const mean = formatMeaning(w);
            const hasAudio = Boolean(w.audioUrl && w.audioUrl.split(';').some(url => resolveMediaUrl(url.trim())));
            return (
              <div
                key={w.id}
                className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xl font-semibold text-[#2D3748]">{w.word}</span>
                    {w.partOfSpeech ? (
                      <span className="text-xs text-[#718096] bg-[#F7F9FC] px-2 py-0.5 rounded">{w.partOfSpeech}</span>
                    ) : null}
                  </div>
                  {ipa ? <div className="text-sm text-[#55A3FF] font-mono mt-1">{ipa}</div> : null}
                  <div className="text-sm text-[#4A5568] mt-2 leading-relaxed">{mean}</div>
                  {w.exampleSentence ? (
                    <div className="text-xs text-[#718096] mt-2 italic border-l-2 border-[#4ECDC4]/40 pl-3">
                      {w.exampleSentence}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0">
                  <CloudButton
                    type="button"
                    disabled={!hasAudio}
                    onClick={() => play(w)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
                      hasAudio
                        ? playingId === w.id
                          ? "bg-[#4ECDC4] text-white"
                          : "bg-[#4ECDC4]/15 text-[#2C7A7B] hover:bg-[#4ECDC4]/25"
                        : "bg-[#E2E8F0] text-[#A0AEC0] cursor-not-allowed"
                    }`}
                  >
                    <Volume2 size={18} />
                    {hasAudio ? (playingId === w.id ? "播放中…" : "播放") : "无音频"}
                  </CloudButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-[#E2E8F0] text-sm text-[#718096]">
          <span>
            第 {page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <CloudButton
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#2D3748] disabled:opacity-50 transition-all duration-200 hover:bg-[#F7F9FC] hover:border-[#4ECDC4] hover:shadow-sm active:scale-95"
            >
              <div className="flex items-center gap-1">
                {loading && page > 1 ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ChevronLeft size={16} />
                )}
                <span>上一页</span>
              </div>
            </CloudButton>
            
            <div className="px-3 py-1.5 text-sm text-[#718096] bg-[#F7F9FC] rounded-lg border border-[#E2E8F0] min-w-[80px] text-center">
              {loading ? (
                <div className="flex items-center justify-center gap-1">
                  <Loader2 size={14} className="animate-spin" />
                  <span>加载中</span>
                </div>
              ) : (
                <span>{page} / {totalPages}</span>
              )}
            </div>
            
            <CloudButton
              type="button"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#2D3748] disabled:opacity-50 transition-all duration-200 hover:bg-[#F7F9FC] hover:border-[#4ECDC4] hover:shadow-sm active:scale-95"
            >
              <div className="flex items-center gap-1">
                <span>下一页</span>
                {loading && page < totalPages ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ChevronRight size={16} />
                )}
              </div>
            </CloudButton>
          </div>
        </div>
      )}
    </div>
  );
}
