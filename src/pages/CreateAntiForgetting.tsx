import { ArrowLeft, Calendar as CalendarIcon, Clock } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";

export default function CreateAntiForgetting() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState("2026-03-23");
  const [selectedTime, setSelectedTime] = useState("09:00");

  const handleConfirm = () => {
    // 创建抗遗忘任务
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
            创建抗遗忘
          </h1>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-6">
        {/* 说明文字 */}
        <div className="bg-[#4ECDC4]/10 rounded-xl p-4">
          <p className="text-sm text-[#2D3748] leading-relaxed">
            根据艾宾浩斯遗忘曲线，科学设置复习时间可以帮助您更好地记忆单词。
            系统将在您设定的时间提醒您复习今天学习的单词。
          </p>
        </div>

        {/* 表单区 */}
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
          {/* 日期选择 */}
          <div>
            <label className="block text-sm text-[#718096] mb-2">复习日期</label>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-3 pr-10 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4ECDC4] focus:border-transparent"
              />
              <CalendarIcon
                size={20}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] pointer-events-none"
              />
            </div>
          </div>

          {/* 时间选择 */}
          <div>
            <label className="block text-sm text-[#718096] mb-2">复习时间</label>
            <div className="relative">
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full px-4 py-3 pr-10 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4ECDC4] focus:border-transparent"
              />
              <Clock
                size={20}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] pointer-events-none"
              />
            </div>
          </div>

          {/* 快捷选择 */}
          <div>
            <label className="block text-sm text-[#718096] mb-2">快捷选择</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setSelectedDate(tomorrow.toISOString().split("T")[0]);
                  setSelectedTime("09:00");
                }}
                className="py-2 px-4 border border-[#E2E8F0] rounded-lg text-sm text-[#2D3748] hover:bg-gray-50 transition-colors"
              >
                明天 09:00
              </button>
              <button
                onClick={() => {
                  const threeDays = new Date();
                  threeDays.setDate(threeDays.getDate() + 3);
                  setSelectedDate(threeDays.toISOString().split("T")[0]);
                  setSelectedTime("09:00");
                }}
                className="py-2 px-4 border border-[#E2E8F0] rounded-lg text-sm text-[#2D3748] hover:bg-gray-50 transition-colors"
              >
                3天后 09:00
              </button>
              <button
                onClick={() => {
                  const oneWeek = new Date();
                  oneWeek.setDate(oneWeek.getDate() + 7);
                  setSelectedDate(oneWeek.toISOString().split("T")[0]);
                  setSelectedTime("09:00");
                }}
                className="py-2 px-4 border border-[#E2E8F0] rounded-lg text-sm text-[#2D3748] hover:bg-gray-50 transition-colors"
              >
                1周后 09:00
              </button>
              <button
                onClick={() => {
                  const twoWeeks = new Date();
                  twoWeeks.setDate(twoWeeks.getDate() + 14);
                  setSelectedDate(twoWeeks.toISOString().split("T")[0]);
                  setSelectedTime("09:00");
                }}
                className="py-2 px-4 border border-[#E2E8F0] rounded-lg text-sm text-[#2D3748] hover:bg-gray-50 transition-colors"
              >
                2周后 09:00
              </button>
            </div>
          </div>
        </div>

        {/* 复习单词列表预览 */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-[#2D3748] mb-3">
            本次学习单词 (5个)
          </h3>
          <div className="flex flex-wrap gap-2">
            {["abandon", "ability", "abroad", "absolute", "abstract"].map((word) => (
              <div
                key={word}
                className="px-3 py-1.5 bg-[#4ECDC4]/10 text-[#4ECDC4] rounded-full text-sm"
              >
                {word}
              </div>
            ))}
          </div>
        </div>

        {/* 确定按钮 */}
        <button
          onClick={handleConfirm}
          className="w-full py-4 bg-[#4ECDC4] text-white rounded-full font-medium hover:bg-[#45b8b0] transition-colors shadow-lg"
        >
          确定
        </button>
      </div>
    </div>
  );
}
