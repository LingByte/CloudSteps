import { ChevronDown, Lightbulb, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useState } from "react";

import { listWordBooks } from "@/api/wordbooks";
import { getStudyLighthouse } from "@/api/study";
import { TopBar } from "@/components/TopBar";

type LighthouseDay = { id: string; count: number; label: string };

export default function WordTraining() {
  const navigate = useNavigate();
  const [showVocabularyDropdown, setShowVocabularyDropdown] = useState(false);
  const [wordBooks, setWordBooks] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedVocabulary, setSelectedVocabulary] = useState("");
  const [selectedWordBookId, setSelectedWordBookId] = useState<number>(0);
  const [memoryData, setMemoryData] = useState<LighthouseDay[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [masteredCount, setMasteredCount] = useState<number>(0);
  const [todayNewLearned, setTodayNewLearned] = useState<number>(0);

  const handleBack = () => {
    navigate("/");
  };

  const vocabularies = useMemo(() => wordBooks.map((w) => w.name), [wordBooks]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await listWordBooks();
        const list = res.data;
        const wbs = Array.isArray(list) ? (list as Array<{ id: number; name: string }>) : [];
        if (!mounted) return;
        setWordBooks(wbs);

        const cachedName = sessionStorage.getItem("lb_wordbook_name") || "";
        const cachedId = Number(sessionStorage.getItem("lb_wordbook_id") || 0);
        const found = wbs.find((x) => x.id === cachedId) || wbs.find((x) => x.name === cachedName);
        const pick = found || wbs[0];
        if (pick) {
          setSelectedVocabulary(pick.name);
          setSelectedWordBookId(pick.id);
          sessionStorage.setItem("lb_wordbook_id", String(pick.id));
          sessionStorage.setItem("lb_wordbook_name", pick.name);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!selectedWordBookId) return;
      try {
        const res = await getStudyLighthouse(selectedWordBookId);
        const days = Array.isArray(res.data?.days) ? (res.data.days as LighthouseDay[]) : [];
        const pending = Number(res.data?.pendingCount || 0);
        const mastered = Number(res.data?.masteredCount || 0);
        const todayNew = Number(res.data?.todayNewLearned ?? 0);
        if (!mounted) return;
        setMemoryData(days);
        setPendingCount(pending);
        setMasteredCount(mastered);
        setTodayNewLearned(todayNew);
      } catch {
        if (!mounted) return;
        setMemoryData([]);
        setPendingCount(0);
        setMasteredCount(0);
        setTodayNewLearned(0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedWordBookId]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <TopBar title="单词训练" onBack={handleBack} />

      <div className="px-4 mt-6 space-y-6">
        {/* 词库选择器 */}
        <div className="relative">
          <button
            onClick={() => setShowVocabularyDropdown(!showVocabularyDropdown)}
            className="w-full bg-white rounded-xl p-4 flex items-center justify-between shadow-sm"
          >
            <span className="text-[#2D3748] font-medium">{selectedVocabulary}</span>
            <ChevronDown size={20} className="text-[#718096]" />
          </button>
          {showVocabularyDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg overflow-hidden z-20">
              {vocabularies.map((vocab) => (
                <button
                  key={vocab}
                  onClick={() => {
                    setSelectedVocabulary(vocab);
                    setShowVocabularyDropdown(false);
                    const wb = wordBooks.find((x) => x.name === vocab);
                    if (wb) {
                      setSelectedWordBookId(wb.id);
                      sessionStorage.setItem("lb_wordbook_id", String(wb.id));
                      sessionStorage.setItem("lb_wordbook_name", wb.name);
                    }
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    selectedVocabulary === vocab ? "bg-[#4ECDC4]/10 text-[#4ECDC4]" : "text-[#2D3748]"
                  }`}
                >
                  {vocab}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 课程信息区 */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#718096]">训练时间</span>
            <span className="text-[#2D3748] font-medium">2026-03-22 09:30</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#718096]">训练时长</span>
            <span className="text-[#2D3748] font-medium">30分钟</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#718096]">用户信息</span>
            <span className="text-[#2D3748] font-medium">张伟</span>
          </div>
        </div>

        {/* 数据统计区 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#4ECDC4] mb-1">{todayNewLearned}</div>
            <div className="text-xs text-[#718096]">今日训新</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#FF9800] mb-1">{memoryData[0]?.count ?? 0}</div>
            <div className="text-xs text-[#718096]">今日复习目标</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#66BB6A] mb-1">{masteredCount}</div>
            <div className="text-xs text-[#718096]">累计识词</div>
          </div>
        </div>

        {/* 智能记忆灯塔 */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex flex-col items-center gap-1 mb-4">
            <div className="flex items-center justify-center gap-2">
              <Lightbulb className="text-[#FFD700]" size={24} />
              <h3 className="text-base font-semibold text-[#2D3748]">智能记忆灯塔</h3>
            </div>
            <p className="text-[11px] text-[#A0AEC0] text-center px-2">
              按艾宾浩斯复习阶段（第 1～7 步）统计当前词库词汇量
            </p>
          </div>

          {/* 九宫格 */}
          <div className="space-y-3">
            {/* 第一行：3个格子 */}
            <div className="grid grid-cols-3 gap-3">
              {memoryData.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="aspect-square bg-gradient-to-br from-[#4ECDC4] to-[#45b8b0] rounded-xl flex flex-col items-center justify-center text-white cursor-default"
                >
                  <div className="text-xs opacity-80 mb-1">{item.id}</div>
                  <div className="text-2xl font-bold">{item.count}</div>
                  <div className="text-[10px] sm:text-xs opacity-90 mt-1 text-center leading-tight px-0.5 line-clamp-3">{item.label}</div>
                </div>
              ))}
            </div>

            {/* 第二行：3个格子 */}
            <div className="grid grid-cols-3 gap-3">
              {memoryData.slice(3, 6).map((item) => (
                <div
                  key={item.id}
                  className="aspect-square bg-gradient-to-br from-[#66BB6A] to-[#5ca860] rounded-xl flex flex-col items-center justify-center text-white cursor-default"
                >
                  <div className="text-xs opacity-80 mb-1">{item.id}</div>
                  <div className="text-2xl font-bold">{item.count}</div>
                  <div className="text-[10px] sm:text-xs opacity-90 mt-1 text-center leading-tight px-0.5 line-clamp-3">{item.label}</div>
                </div>
              ))}
            </div>

            {/* 第三行：1个格子 */}
            <div className="grid grid-cols-3 gap-3">
              {memoryData.slice(6, 7).map((item) => (
                <div
                  key={item.id}
                  className="aspect-square bg-gradient-to-br from-[#FF9800] to-[#e68900] rounded-xl flex flex-col items-center justify-center text-white cursor-default"
                >
                  <div className="text-xs opacity-80 mb-1">{item.id}</div>
                  <div className="text-2xl font-bold">{item.count}</div>
                  <div className="text-[10px] sm:text-xs opacity-90 mt-1 text-center leading-tight px-0.5 line-clamp-3">{item.label}</div>
                </div>
              ))}
              {/* 待学 */}
              <div className="aspect-square bg-gray-100 rounded-xl flex flex-col items-center justify-center cursor-default">
                <div className="text-2xl font-bold text-[#718096]">{pendingCount}</div>
                <div className="text-xs text-[#718096] mt-1">待学</div>
              </div>
              {/* 掌握 */}
              <div className="aspect-square bg-gradient-to-br from-[#FFD700] to-[#e6c200] rounded-xl flex flex-col items-center justify-center text-white cursor-default">
                <div className="text-2xl font-bold">{masteredCount}</div>
                <div className="text-xs opacity-80 mt-1">掌握</div>
              </div>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pb-6">
          <button
            onClick={() => navigate("/review-check")}
            className="flex-1 py-4 border-2 border-[#4ECDC4] text-[#4ECDC4] rounded-full font-medium hover:bg-[#4ECDC4]/5 transition-colors"
          >
            开始复习
          </button>
          <button
            onClick={() => navigate("/pre-training-check")}
            className="flex-1 py-4 bg-[#4ECDC4] text-white rounded-full font-medium hover:bg-[#45b8b0] transition-colors"
          >
            继续练习
          </button>
        </div>
      </div>

      {/* 右下角箭头按钮 - 直接进入训前检测界面 */}
      <div className="fixed bottom-6 right-6">
        <button
          onClick={() => navigate("/pre-training-check")}
          className="p-4 bg-[#4ECDC4] text-white rounded-full shadow-lg hover:bg-[#45b8b0] transition-colors"
        >
          <ArrowRight size={24} />
        </button>
      </div>
    </div>
  );
}
