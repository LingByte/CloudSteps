import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BookOpen, ChevronRight } from "lucide-react";
import { listWordBooks, type WordBookItem } from "@/api/wordbooks";

export default function WordBooks() {
  const [books, setBooks] = useState<WordBookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await listWordBooks();
        if (cancelled) return;
        if (res.code !== 200) {
          setErr(res.msg || "加载失败");
          setBooks([]);
          return;
        }
        setBooks(Array.isArray(res.data) ? res.data : []);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg =
            e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "加载失败";
          setErr(msg);
          setBooks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-xl flex items-center justify-center">
            <BookOpen className="text-[#4ECDC4]" size={24} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#2D3748]">词库</h1>
            <p className="text-xs text-[#718096] mt-0.5">选择词库查看单词、音标、释义并播放发音</p>
          </div>
        </div>
      </div>

      {err && (
        <div className="bg-white rounded-xl p-4 border border-[#FF6B6B]/30 text-[#FF6B6B] text-sm">{err}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl p-8 text-center text-[#718096] border border-[#E2E8F0]">加载中…</div>
      ) : books.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-[#718096] border border-[#E2E8F0]">暂无词库</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {books.map((b) => (
            <Link
              key={b.id}
              to={`/word-books/${b.id}`}
              className="group bg-white rounded-xl border border-[#E2E8F0] p-5 hover:border-[#4ECDC4]/50 hover:shadow-md transition-all flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[#2D3748] group-hover:text-[#4ECDC4] transition-colors truncate">
                  {b.name}
                </div>
                <div className="text-xs text-[#718096] mt-1 flex flex-wrap gap-2">
                  {b.level ? <span>{b.level}</span> : null}
                  {typeof b.wordCount === "number" ? <span>{b.wordCount} 词</span> : null}
                </div>
              </div>
              <ChevronRight className="text-[#A0AEC0] group-hover:text-[#4ECDC4] shrink-0" size={22} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
