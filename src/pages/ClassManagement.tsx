import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Users, Search, X, GraduationCap, ChevronDown } from "lucide-react";

import { addClassStudent, listClasses, listClassStudents, removeClassStudent, searchCourseUsers } from "@/api/classes";
import { listWordBooks } from "@/api/wordbooks";

type ClassItem = {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
};

type UserOption = {
  id: number;
  email: string;
  displayName: string;
  role: string;
};

type ClassStudent = {
  id: number;
  classId: number;
  studentId: number;
  student?: UserOption;
};

type WordBook = {
  id: number;
  name: string;
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const UserSearch = ({ onSelect }: { onSelect: (u: UserOption) => void }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchCourseUsers(q, "student");
        setResults(Array.isArray(res.data) ? res.data : []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 px-4 py-3 bg-[#F7F9FC] border border-[#E2E8F0] rounded-xl">
        {loading ? (
          <div className="w-4 h-4 border-2 border-[#CBD5E0] border-t-[#4ECDC4] rounded-full animate-spin" />
        ) : (
          <Search className="w-4 h-4 text-[#A0AEC0]" />
        )}
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="搜索学员邮箱/昵称并添加"
          className="flex-1 bg-transparent outline-none text-sm text-[#2D3748] placeholder:text-[#A0AEC0]"
        />
        {q && (
          <button
            onClick={() => {
              setQ("");
              setResults([]);
            }}
            className="text-[#A0AEC0]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl border border-[#E2E8F0] shadow-lg overflow-hidden">
          {results.map((u) => (
            <button
              key={u.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(u);
                setQ("");
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 hover:bg-[#F7F9FC]"
            >
              <div className="text-sm font-medium text-[#2D3748] truncate">{u.displayName || u.email}</div>
              {u.displayName && <div className="text-xs text-[#A0AEC0] truncate">{u.email}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function ClassManagement() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [classStudents, setClassStudents] = useState<ClassStudent[]>([]);

  // 词库（用于排课弹窗展示）
  const [wordBooks, setWordBooks] = useState<WordBook[]>([]);

  // 排课弹窗（过渡：仅 UI，不落库）
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<ClassStudent | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [selectedVocabulary, setSelectedVocabulary] = useState("");
  const [showVocabularyDropdown, setShowVocabularyDropdown] = useState(false);

  const loadClasses = useCallback(async () => {
    const res = await listClasses();
    setClasses(Array.isArray(res.data) ? res.data : []);
  }, []);

  const loadClassStudents = useCallback(async (classId: number) => {
    const res = await listClassStudents(classId);
    setClassStudents(Array.isArray(res.data) ? res.data : []);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        await loadClasses();

        // 预加载词库，用于排课弹窗
        const wbRes = await listWordBooks();
        const list = wbRes.data;
        const wbs = Array.isArray(list) ? (list as WordBook[]) : [];
        if (mounted) {
          setWordBooks(wbs);
          if (wbs.length > 0) setSelectedVocabulary(wbs[0].name);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadClasses]);

  const filteredClasses = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return classes;
    return classes.filter((c) => c.name.includes(kw) || (c.description || "").includes(kw));
  }, [classes, keyword]);

  const openClass = async (c: ClassItem) => {
    setSelectedClass(c);
    setStudentsLoading(true);
    try {
      await loadClassStudents(c.id);
    } finally {
      setStudentsLoading(false);
    }
  };

  const openSchedule = (s: ClassStudent) => {
    setSelectedStudent(s);
    setShowScheduleDialog(true);
    setScheduleDate("");
    setScheduleTime("");
    setDuration("30");
    setShowVocabularyDropdown(false);
  };

  const handleConfirmSchedule = () => {
    setShowScheduleDialog(false);
    setSelectedStudent(null);
  };

  const addStudentToClass = async (u: UserOption) => {
    if (!selectedClass) return;
    setStudentsLoading(true);
    try {
      await addClassStudent(selectedClass.id, u.id);
      await loadClassStudents(selectedClass.id);
    } finally {
      setStudentsLoading(false);
    }
  };

  const removeStudentFromClass = async (studentId: number) => {
    if (!selectedClass) return;
    if (!confirm("确认移除该学员？")) return;
    setStudentsLoading(true);
    try {
      await removeClassStudent(selectedClass.id, studentId);
      await loadClassStudents(selectedClass.id);
    } finally {
      setStudentsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-20">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#4ECDC4]">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">班级管理</h1>
        </div>
      </div>

      {/* 内容 */}
      <div className="pt-14 px-4 py-6 space-y-4">
        {/* 搜索 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#F7F9FC] border border-[#E2E8F0] rounded-xl">
            <Search className="w-4 h-4 text-[#A0AEC0]" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索班级名称"
              className="flex-1 bg-transparent outline-none text-sm text-[#2D3748] placeholder:text-[#A0AEC0]"
            />
            {keyword && (
              <button onClick={() => setKeyword("")} className="text-[#A0AEC0]">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 班级列表 */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl p-6 text-center text-[#718096]">加载中...</div>
          ) : filteredClasses.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center text-[#718096]">暂无班级</div>
          ) : (
            filteredClasses.map((c) => (
              <button
                key={c.id}
                onClick={() => openClass(c)}
                className="w-full text-left bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-[#4ECDC4]/10 flex items-center justify-center">
                        <GraduationCap className="w-5 h-5 text-[#4ECDC4]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[#2D3748] font-semibold truncate">{c.name}</div>
                        <div className="text-xs text-[#A0AEC0]">创建于 {formatDateTime(c.createdAt)}</div>
                      </div>
                    </div>
                    {c.description && <div className="text-sm text-[#718096] mt-3 line-clamp-2">{c.description}</div>}
                  </div>
                  <div className="text-[#4ECDC4] text-sm font-medium">管理</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 班级详情（底部抽屉） */}
      {selectedClass && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
          <div className="w-full bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <div className="text-[#2D3748] font-semibold truncate">{selectedClass.name}</div>
                {selectedClass.description && <div className="text-xs text-[#718096] mt-1">{selectedClass.description}</div>}
              </div>
              <button
                onClick={() => {
                  setSelectedClass(null);
                  setClassStudents([]);
                }}
                className="text-[#718096]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#F7F9FC] rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-[#2D3748]">
                <Users className="w-4 h-4 text-[#4ECDC4]" />
                班级学员（{classStudents.length}）
              </div>
            </div>

            <div className="mt-3">
              <UserSearch onSelect={addStudentToClass} />
            </div>

            <div className="mt-4 space-y-3">
              {studentsLoading ? (
                <div className="text-center text-[#718096] py-6">加载中...</div>
              ) : classStudents.length === 0 ? (
                <div className="text-center text-[#718096] py-6">暂无学员</div>
              ) : (
                classStudents.map((s) => {
                  const displayName = s.student?.displayName || s.student?.email || `#${s.studentId}`;
                  // 过渡：后端暂无字段，先展示占位
                  const thirtyMinLeft = 0;
                  const sixtyMinLeft = 0;
                  const serviceHoursLeft = 0;
                  return (
                    <div key={s.id} className="bg-white rounded-xl p-5 shadow-sm border border-[#E2E8F0]">
                      <div className="mb-4 pb-3 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[#2D3748] font-medium text-lg truncate">{displayName}</div>
                          {s.student?.displayName && <div className="text-xs text-[#A0AEC0] truncate">{s.student?.email}</div>}
                        </div>
                        <button
                          onClick={() => removeStudentFromClass(s.studentId)}
                          className="px-3 py-1.5 text-xs font-medium rounded-full border border-[#FF6B6B] text-[#FF6B6B] hover:bg-[#FF6B6B] hover:text-white transition-colors"
                        >
                          移除
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-[#2D3748] mb-1">{thirtyMinLeft}</div>
                          <div className="text-xs text-[#718096]">30分钟剩余</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-[#2D3748] mb-1">{sixtyMinLeft}</div>
                          <div className="text-xs text-[#718096]">60分钟剩余</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-[#2D3748] mb-1">{serviceHoursLeft}</div>
                          <div className="text-xs text-[#718096]">陪练服务时长剩余</div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => navigate("/test-records")}
                          className="px-4 py-1.5 border border-[#4ECDC4] text-[#4ECDC4] rounded-full text-sm hover:bg-[#4ECDC4] hover:text-white transition-colors"
                        >
                          测试记录
                        </button>
                        <button
                          onClick={() => openSchedule(s)}
                          className="px-4 py-1.5 bg-[#4ECDC4] text-white rounded-full text-sm hover:bg-[#45b8b0] transition-colors"
                        >
                          排课
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  // 主站暂无排课页时，用弹窗作为过渡
                  if (classStudents.length > 0) {
                    openSchedule(classStudents[0]);
                    return;
                  }
                }}
                className="w-full py-3 rounded-xl bg-[#4ECDC4] text-white font-medium"
              >
                去排课管理
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 排课弹窗（过渡） */}
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
              <div>
                <label className="block text-sm text-[#718096] mb-2">学员</label>
                <div className="text-[#2D3748] font-medium">
                  {selectedStudent.student?.displayName || selectedStudent.student?.email || `#${selectedStudent.studentId}`}
                </div>
              </div>

              <div>
                <label className="block text-sm text-[#718096] mb-2">日期</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-4 py-2 border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#4ECDC4]"
                />
              </div>

              <div>
                <label className="block text-sm text-[#718096] mb-2">时间</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-4 py-2 border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#4ECDC4]"
                />
              </div>

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

              <div>
                <label className="block text-sm text-[#718096] mb-2">词库选择</label>
                <div className="relative">
                  <button
                    onClick={() => setShowVocabularyDropdown(!showVocabularyDropdown)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg p-3 flex items-center justify-between"
                  >
                    <span className="text-[#2D3748] truncate">
                      {selectedVocabulary || "请选择词库"}
                    </span>
                    <ChevronDown size={20} className="text-[#718096]" />
                  </button>
                  {showVocabularyDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg overflow-hidden z-20 max-h-60 overflow-y-auto">
                      {wordBooks.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-[#718096]">暂无词库</div>
                      ) : (
                        wordBooks.map((wb) => (
                          <button
                            key={wb.id}
                            onClick={() => {
                              setSelectedVocabulary(wb.name);
                              setShowVocabularyDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                              selectedVocabulary === wb.name ? "bg-[#4ECDC4]/10 text-[#4ECDC4]" : "text-[#2D3748]"
                            }`}
                          >
                            {wb.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

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
