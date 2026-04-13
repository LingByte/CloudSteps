import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BookOpen, ChevronRight, TrendingUp } from "lucide-react";
import { listWordBooks, type WordBookItem } from "@/api/wordbooks";

// 渐变色数组 - 与后台保持一致
const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
];

// 根据词库名称生成渐变背景 - 与后台保持一致
function coverGradient(name: string) {
  const idx = name.charCodeAt(0) % GRADIENTS.length;
  return GRADIENTS[idx];
}

// 词库封面组件 - 模仿后台样式
const WordBookCover = ({ name }: { name: string }) => {
  const firstChar = name.charAt(0).toUpperCase();
  
  return (
    <div 
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ background: coverGradient(name) }}
    >
      {/* 背景大字 - 半透明 */}
      <span className="text-3xl font-bold text-white/20 select-none absolute right-2 bottom-1 leading-none">
        {firstChar}
      </span>
      {/* 前景小字 - 实色 */}
      <span className="text-xl font-bold text-white drop-shadow-lg z-10">
        {firstChar}
      </span>
    </div>
  );
};

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
    <div className="min-h-screen bg-[#F7F9FC] pb-20">
      {/* 顶部标题区域 */}
      <div className="bg-gradient-to-br from-[#4ECDC4] to-[#55A3FF] text-white">
        <div className="px-4 py-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <BookOpen className="text-white" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">词库</h1>
              <p className="text-white/80 text-sm mt-1">选择词库查看单词、音标、释义并播放发音</p>
            </div>
          </div>
          
          {/* 统计信息 */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">{books.length}</div>
              <div className="text-xs text-white/80">总词库</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">
                {books.reduce((sum, book) => sum + (book.wordCount || 0), 0)}
              </div>
              <div className="text-xs text-white/80">总词汇</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">
                {new Set(books.map(book => book.level).filter(Boolean)).size}
              </div>
              <div className="text-xs text-white/80">难度级别</div>
            </div>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {err && (
        <div className="mx-4 mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
          {err}
        </div>
      )}

      {/* 加载状态 */}
      {loading ? (
        <div className="mx-4 mt-6 bg-white rounded-xl p-8 text-center text-[#718096] border border-[#E2E8F0]">
          <div className="animate-spin w-8 h-8 border-2 border-[#4ECDC4] border-t-transparent rounded-full mx-auto mb-4"></div>
          加载中…
        </div>
      ) : books.length === 0 ? (
        <div className="mx-4 mt-6 bg-white rounded-xl p-8 text-center text-[#718096] border border-[#E2E8F0]">
          <BookOpen className="w-16 h-16 text-[#A0AEC0] mx-auto mb-4" />
          暂无词库
        </div>
      ) : (
        /* 词库卡片网格 */
        <div className="px-4 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {books.map((b) => (
              <Link
                key={b.id}
                to={`/word-books/${b.id}`}
                className="group block"
              >
                <div className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-[#E2E8F0] hover:border-[#4ECDC4]/50">
                  {/* 卡片头部 - 词库封面 */}
                  <div className="h-24 relative overflow-hidden">
                    <WordBookCover name={b.name} />
                    
                    {/* 级别标签 */}
                    {b.level && (
                      <div className="absolute top-2 left-2">
                        <span className="inline-block px-2 py-0.5 bg-white/20 backdrop-blur text-white text-xs rounded-full">
                          {b.level}
                        </span>
                      </div>
                    )}

                    {/* 悬浮时的箭头 */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-6 h-6 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                        <ChevronRight className="text-white" size={12} />
                      </div>
                    </div>
                  </div>

                  {/* 卡片内容 */}
                  <div className="p-3">
                    {/* 词库名称 */}
                    <h3 className="text-sm font-bold text-[#2D3748] mb-2 group-hover:text-[#4ECDC4] transition-colors line-clamp-2">
                      {b.name}
                    </h3>

                    {/* 统计信息 */}
                    <div className="flex items-center gap-2 text-xs text-[#718096]">
                      <div className="flex items-center gap-0.5">
                        <BookOpen size={10} />
                        <span>{b.wordCount || 0}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <TrendingUp size={10} />
                        <span>{b.level || '未分级'}</span>
                      </div>
                    </div>

                    {/* 底部操作提示 */}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-[#A0AEC0]">点击学习</span>
                      <div className="flex items-center gap-0.5 text-[#4ECDC4] group-hover:translate-x-0.5 transition-transform">
                        <ChevronRight size={10} />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
