import { ArrowLeft, ChevronDown, Lightbulb, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";

// 智能记忆灯塔数据
const memoryData = [
  { id: "01", count: 12, label: "第1天" },
  { id: "02", count: 8, label: "第2天" },
  { id: "03", count: 15, label: "第3天" },
  { id: "04", count: 6, label: "第4天" },
  { id: "05", count: 20, label: "第5天" },
  { id: "06", count: 10, label: "第6天" },
  { id: "07", count: 5, label: "第7天" },
];

export default function WordTraining() {
  const navigate = useNavigate();
  const [showVocabularyDropdown, setShowVocabularyDropdown] = useState(false);
  const [selectedVocabulary, setSelectedVocabulary] = useState("高中词库【陪练练习】");

  const vocabularies = [
    "高中词库【陪练练习】",
    "初中词库【陪练练习】",
    "小学词库【陪练练习】",
    "大学四级词库",
    "大学六级词库",
    "托福词库",
    "雅思词库",
  ];

  const handleMemoryClick = (item: any) => {
    navigate("/pre-training-check");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部栏 */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-[#2D3748] -ml-10">
            单词训练
          </h1>
        </div>
      </div>

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
            <div className="text-2xl font-bold text-[#4ECDC4] mb-1">0</div>
            <div className="text-xs text-[#718096]">今日训新</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#FF9800] mb-1">65</div>
            <div className="text-xs text-[#718096]">今日复习目标</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#66BB6A] mb-1">103</div>
            <div className="text-xs text-[#718096]">累计识词</div>
          </div>
        </div>

        {/* 智能记忆灯塔 */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Lightbulb className="text-[#FFD700]" size={24} />
            <h3 className="text-base font-semibold text-[#2D3748]">智能记忆灯塔</h3>
          </div>

          {/* 九宫格 */}
          <div className="space-y-3">
            {/* 第一行：3个格子 */}
            <div className="grid grid-cols-3 gap-3">
              {memoryData.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleMemoryClick(item)}
                  className="aspect-square bg-gradient-to-br from-[#4ECDC4] to-[#45b8b0] rounded-xl flex flex-col items-center justify-center text-white hover:shadow-lg transition-shadow"
                >
                  <div className="text-xs opacity-80 mb-1">{item.id}</div>
                  <div className="text-2xl font-bold">{item.count}</div>
                  <div className="text-xs opacity-80 mt-1">{item.label}</div>
                </button>
              ))}
            </div>

            {/* 第二行：3个格子 */}
            <div className="grid grid-cols-3 gap-3">
              {memoryData.slice(3, 6).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleMemoryClick(item)}
                  className="aspect-square bg-gradient-to-br from-[#66BB6A] to-[#5ca860] rounded-xl flex flex-col items-center justify-center text-white hover:shadow-lg transition-shadow"
                >
                  <div className="text-xs opacity-80 mb-1">{item.id}</div>
                  <div className="text-2xl font-bold">{item.count}</div>
                  <div className="text-xs opacity-80 mt-1">{item.label}</div>
                </button>
              ))}
            </div>

            {/* 第三行：1个格子 */}
            <div className="grid grid-cols-3 gap-3">
              {memoryData.slice(6, 7).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleMemoryClick(item)}
                  className="aspect-square bg-gradient-to-br from-[#FF9800] to-[#e68900] rounded-xl flex flex-col items-center justify-center text-white hover:shadow-lg transition-shadow"
                >
                  <div className="text-xs opacity-80 mb-1">{item.id}</div>
                  <div className="text-2xl font-bold">{item.count}</div>
                  <div className="text-xs opacity-80 mt-1">{item.label}</div>
                </button>
              ))}
              {/* 待学 */}
              <button className="aspect-square bg-gray-100 rounded-xl flex flex-col items-center justify-center hover:shadow-lg transition-shadow">
                <div className="text-2xl font-bold text-[#718096]">32</div>
                <div className="text-xs text-[#718096] mt-1">待学</div>
              </button>
              {/* 掌握 */}
              <button className="aspect-square bg-gradient-to-br from-[#FFD700] to-[#e6c200] rounded-xl flex flex-col items-center justify-center text-white hover:shadow-lg transition-shadow">
                <div className="text-2xl font-bold">103</div>
                <div className="text-xs opacity-80 mt-1">掌握</div>
              </button>
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
