import { useNavigate } from "react-router";
import { ChevronLeft, X, ChevronDown } from "lucide-react";
import { useState } from "react";

const students = [
  {
    id: 1,
    name: "刘宸赫",
    thirtyMinSessions: 126,
    sixtyMinSessions: 0,
    totalHours: 63.0,
  },
  {
    id: 2,
    name: "邢梓一",
    thirtyMinSessions: 0,
    sixtyMinSessions: 39,
    totalHours: 19,
  },
  {
    id: 3,
    name: "赵妹淇",
    thirtyMinSessions: 0,
    sixtyMinSessions: 34,
    totalHours: 34,
  },
  {
    id: 4,
    name: "韩绎加",
    thirtyMinSessions: 0,
    sixtyMinSessions: 18,
    totalHours: 18,
  },
  {
    id: 5,
    name: "罗谨言",
    thirtyMinSessions: 0,
    sixtyMinSessions: 12,
    totalHours: 12,
  },
  {
    id: 6,
    name: "李思涵",
    thirtyMinSessions: 45,
    sixtyMinSessions: 8,
    totalHours: 30.5,
  },
];

const vocabularies = [
  "高中词库【陪练练习】",
  "初中词库【陪练练习】",
  "小学词库【陪练练习】",
  "大学四级词库",
  "大学六级词库",
  "托福词库",
  "雅思词库",
];

export default function StudentManagement() {
  const navigate = useNavigate();
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [selectedVocabulary, setSelectedVocabulary] = useState(vocabularies[0]);
  const [showVocabularyDropdown, setShowVocabularyDropdown] = useState(false);

  const handleScheduleClick = (student: any) => {
    setSelectedStudent(student);
    setShowScheduleDialog(true);
  };

  const handleConfirmSchedule = () => {
    setShowScheduleDialog(false);
    setSelectedStudent(null);
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-20">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#4ECDC4]">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">学员管理</h1>
        </div>
      </div>

      {/* 学员列表 */}
      <div className="pt-14 px-4 py-6 space-y-4">
        {students.map((student) => (
          <div key={student.id} className="bg-white rounded-xl p-5 shadow-sm">
            {/* 学员姓名 */}
            <div className="mb-4 pb-3 border-b border-[#E2E8F0]">
              <h3 className="text-[#2D3748] font-medium text-lg">
                {student.name}
              </h3>
            </div>

            {/* 统计数据 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-[#2D3748] mb-1">
                  {student.thirtyMinSessions}
                </div>
                <div className="text-xs text-[#718096]">30分钟剩余</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[#2D3748] mb-1">
                  {student.sixtyMinSessions}
                </div>
                <div className="text-xs text-[#718096]">60分钟剩余</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[#2D3748] mb-1">
                  {student.totalHours}
                </div>
                <div className="text-xs text-[#718096]">陪练服务时长剩余</div>
              </div>
            </div>

            {/* 按钮组 */}
            <div className="flex justify-end gap-2">
              <button className="px-4 py-1.5 border border-[#4ECDC4] text-[#4ECDC4] rounded-full text-sm hover:bg-[#4ECDC4] hover:text-white transition-colors">
                测试记录
              </button>
              <button
                onClick={() => handleScheduleClick(student)}
                className="px-4 py-1.5 bg-[#4ECDC4] text-white rounded-full text-sm hover:bg-[#45b8b0] transition-colors"
              >
                排课
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 排课弹窗 */}
      {showScheduleDialog && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-[#2D3748]">排课</h3>
              <button
                onClick={() => setShowScheduleDialog(false)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} className="text-[#718096]" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {/* 学员姓名 */}
              <div>
                <label className="block text-sm text-[#718096] mb-2">学员姓名</label>
                <div className="text-[#2D3748] font-medium">{selectedStudent.name}</div>
              </div>

              {/* 日期选择 */}
              <div>
                <label className="block text-sm text-[#718096] mb-2">日期</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-4 py-2 border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#4ECDC4]"
                />
              </div>

              {/* 时间选择 */}
              <div>
                <label className="block text-sm text-[#718096] mb-2">时间</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-4 py-2 border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#4ECDC4]"
                />
              </div>

              {/* 课时选择 */}
              <div>
                <label className="block text-sm text-[#718096] mb-2">课时选择</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDuration("30")}
                    className={`flex-1 py-2 rounded-lg transition-colors ${
                      duration === "30"
                        ? "bg-[#4ECDC4] text-white"
                        : "border border-[#E2E8F0] text-[#718096] hover:bg-gray-50"
                    }`}
                  >
                    30分钟
                  </button>
                  <button
                    onClick={() => setDuration("60")}
                    className={`flex-1 py-2 rounded-lg transition-colors ${
                      duration === "60"
                        ? "bg-[#4ECDC4] text-white"
                        : "border border-[#E2E8F0] text-[#718096] hover:bg-gray-50"
                    }`}
                  >
                    60分钟
                  </button>
                </div>
              </div>

              {/* 词库选择 */}
              <div>
                <label className="block text-sm text-[#718096] mb-2">词库选择</label>
                <div className="relative">
                  <button
                    onClick={() => setShowVocabularyDropdown(!showVocabularyDropdown)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg p-3 flex items-center justify-between"
                  >
                    <span className="text-[#2D3748]">{selectedVocabulary}</span>
                    <ChevronDown size={20} className="text-[#718096]" />
                  </button>
                  {showVocabularyDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg overflow-hidden z-20 max-h-60 overflow-y-auto">
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
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowScheduleDialog(false)}
                className="flex-1 py-3 border-2 border-[#E2E8F0] text-[#718096] rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmSchedule}
                className="flex-1 py-3 bg-[#4ECDC4] text-white rounded-lg hover:bg-[#45b8b0] transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
