import { useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Search, Calendar, DollarSign } from "lucide-react";

const commissionData = [
  {
    id: 1,
    studentName: "王小明",
    trainingDate: "2026-03-20",
    duration: "30分钟",
    fee: "120",
    status: "已结算",
  },
  {
    id: 2,
    studentName: "刘晓华",
    trainingDate: "2026-03-21",
    duration: "60分钟",
    fee: "240",
    status: "已结算",
  },
  {
    id: 3,
    studentName: "张伟",
    trainingDate: "2026-03-22",
    duration: "30分钟",
    fee: "120",
    status: "待结算",
  },
  {
    id: 4,
    studentName: "李娜",
    trainingDate: "2026-03-23",
    duration: "60分钟",
    fee: "240",
    status: "待结算",
  },
  {
    id: 5,
    studentName: "陈明",
    trainingDate: "2026-03-24",
    duration: "30分钟",
    fee: "120",
    status: "已结算",
  },
];

export default function CommissionCheck() {
  const navigate = useNavigate();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("2026-03");

  const filteredData = commissionData.filter((item) => {
    const matchesSearch =
      searchKeyword === "" ||
      item.studentName.includes(searchKeyword) ||
      item.trainingDate.includes(searchKeyword);
    const matchesMonth = item.trainingDate.startsWith(selectedMonth);
    return matchesSearch && matchesMonth;
  });

  const totalFee = filteredData.reduce((sum, item) => sum + parseInt(item.fee), 0);
  const settledFee = filteredData
    .filter((item) => item.status === "已结算")
    .reduce((sum, item) => sum + parseInt(item.fee), 0);
  const pendingFee = filteredData
    .filter((item) => item.status === "待结算")
    .reduce((sum, item) => sum + parseInt(item.fee), 0);

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-6">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-[#E2E8F0] mb-6">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="text-lg font-semibold text-[#2D3748]">佣金核对</h1>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">总课时费</div>
                <div className="text-[#2D3748] text-2xl font-bold">¥{totalFee}</div>
              </div>
              <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
                <DollarSign className="text-[#4ECDC4]" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">已结算</div>
                <div className="text-[#4ECDC4] text-2xl font-bold">¥{settledFee}</div>
              </div>
              <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
                <DollarSign className="text-[#4ECDC4]" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">待结算</div>
                <div className="text-[#FF6B6B] text-2xl font-bold">¥{pendingFee}</div>
              </div>
              <div className="w-12 h-12 bg-[#FF6B6B]/10 rounded-lg flex items-center justify-center">
                <DollarSign className="text-[#FF6B6B]" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* 筛选栏 */}
        <div className="bg-white rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 月份选择 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
              <input
                type="text"
                placeholder="搜索学生姓名或日期"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>
          </div>
        </div>

        {/* 课时费记录列表 */}
        <div className="bg-white rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F7F9FC]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[#2D3748]">学生姓名</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[#2D3748]">训练日期</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[#2D3748]">时长</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[#2D3748]">课时费</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-[#2D3748]">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F7F9FC] transition-colors">
                    <td className="px-6 py-4 text-[#2D3748] font-medium">{item.studentName}</td>
                    <td className="px-6 py-4 text-[#718096]">{item.trainingDate}</td>
                    <td className="px-6 py-4 text-[#718096]">{item.duration}</td>
                    <td className="px-6 py-4 text-[#2D3748] font-semibold">¥{item.fee}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          item.status === "已结算"
                            ? "bg-[#4ECDC4]/10 text-[#4ECDC4]"
                            : "bg-[#FF6B6B]/10 text-[#FF6B6B]"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
