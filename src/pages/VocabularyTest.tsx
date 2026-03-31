import { useNavigate } from "react-router";
import { ChevronLeft, BookOpen } from "lucide-react";

export default function VocabularyTest() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-20">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="text-lg font-semibold text-[#2D3748]">词汇量测试</h1>
        </div>
      </div>

      {/* 主内容 */}
      <div className="pt-14 px-4 flex flex-col items-center justify-center min-h-screen">
        <div className="max-w-md w-full">
          {/* 标题 */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-[#2D3748] mb-3">
              词汇量测试
            </h2>
            <p className="text-[#718096] text-sm">
              花几分钟测试一下，定位你的词汇量水平
            </p>
          </div>

          {/* 插图 */}
          <div className="mb-12 flex justify-center">
            <div className="w-72 h-72 bg-gradient-to-br from-[#4ECDC4]/10 to-[#55A3FF]/10 rounded-full flex items-center justify-center">
              <BookOpen className="w-20 h-20 text-[#4ECDC4]" />
            </div>
          </div>

          {/* 开始测试按钮 */}
          <button
            onClick={() => navigate("/vocabulary-test/testing?mode=adaptive")}
            className="w-full py-4 bg-[#4ECDC4] text-white rounded-full text-lg font-medium hover:bg-[#3DBCB4] transition-colors shadow-lg hover:shadow-xl"
          >
            开始测试
          </button>

          {/* 提示文字 */}
          <p className="text-center text-[#A0AEC0] text-sm mt-6">
            诚实做题可以得到真实的测试结果
          </p>
        </div>
      </div>
    </div>
  );
}
