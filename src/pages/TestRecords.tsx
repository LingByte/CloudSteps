import { useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Search, Calendar, TrendingUp, CheckCircle2 } from "lucide-react";

const testRecordsData = [
  {
    id: 1,
    studentName: "王小明",
    testDate: "2026-03-20 10:30",
    testType: "四级词汇",
    correctRate: "85%",
    totalWords: 100,
    correctWords: 85,
  },
  {
    id: 2,
    studentName: "刘晓华",
    testDate: "2026-03-21 14:15",
    testType: "托福词汇",
    correctRate: "92%",
    totalWords: 150,
    correctWords: 138,
  },
  {
    id: 3,
    studentName: "张伟",
    testDate: "2026-03-22 09:00",
    testType: "雅思词汇",
    correctRate: "78%",
    totalWords: 120,
    correctWords: 94,
  },
  {
    id: 4,
    studentName: "李娜",
    testDate: "2026-03-23 16:30",
    testType: "GRE词汇",
    correctRate: "88%",
    totalWords: 200,
    correctWords: 176,
  },
  {
    id: 5,
    studentName: "陈明",
    testDate: "2026-03-24 11:00",
    testType: "考研词汇",
    correctRate: "90%",
    totalWords: 180,
    correctWords: 162,
  },
];

export default function TestRecords() {
  const navigate = useNavigate();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-31");

  const filteredData = testRecordsData.filter((item) => {
    const matchesSearch =
      searchKeyword === "" ||
      item.studentName.includes(searchKeyword) ||
      item.testType.includes(searchKeyword);
    const itemDate = item.testDate.split(" ")[0];
    const matchesDateRange = itemDate >= startDate && itemDate <= endDate;
    return matchesSearch && matchesDateRange;
  });

  const avgCorrectRate = (
    filteredData.reduce((sum, item) => sum + parseInt(item.correctRate), 0) /
    filteredData.length
  ).toFixed(0);

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-6">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-[#E2E8F0] mb-6">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="text-lg font-semibold text-[#2D3748]">词汇测试记录</h1>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">测试总次数</div>
                <div className="text-[#2D3748] text-2xl font-bold">{filteredData.length}</div>
              </div>
              <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="text-[#4ECDC4]" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">平均正确率</div>
                <div className="text-[#55A3FF] text-2xl font-bold">{avgCorrectRate}%</div>
              </div>
              <div className="w-12 h-12 bg-[#55A3FF]/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-[#55A3FF]" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">总测试词数</div>
                <div className="text-[#4ECDC4] text-2xl font-bold">
                  {filteredData.reduce((sum, item) => sum + item.totalWords, 0)}
                </div>
              </div>
              <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="text-[#4ECDC4]" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* 筛选栏 */}
        <div className="bg-white rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 开始日期 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>
            {/* 结束日期 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
              <input
                type="text"
                placeholder="搜索学生姓名"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>
          </div>
        </div>

        {/* 测试记录列表 */}
        <div className="space-y-4">
          {filteredData.map((item) => (
            <div key={item.id} className="bg-white rounded-xl p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[#2D3748] font-semibold text-lg">{item.studentName}</h3>
                    <span className="text-sm text-[#718096] bg-[#F7F9FC] px-3 py-1 rounded-full">
                      {item.testType}
                    </span>
                  </div>
                  <div className="text-sm text-[#718096]">{item.testDate}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-[#4ECDC4] mb-1">{item.correctRate}</div>
                  <div className="text-sm text-[#718096]">正确率</div>
                </div>
              </div>
              <div className="flex items-center gap-6 pt-4 border-t border-[#E2E8F0]">
                <div className="text-sm">
                  <span className="text-[#718096]">总词数：</span>
                  <span className="text-[#2D3748] font-medium">{item.totalWords}</span>
                </div>
                <div className="text-sm">
                  <span className="text-[#718096]">正确：</span>
                  <span className="text-[#4ECDC4] font-medium">{item.correctWords}</span>
                </div>
                <div className="text-sm">
                  <span className="text-[#718096]">错误：</span>
                  <span className="text-[#FF6B6B] font-medium">
                    {item.totalWords - item.correctWords}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
