import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, X, Volume2 } from "lucide-react";

const testWords = [
  {
    word: "country",
    options: [
      { label: "声音", value: "sound" },
      { label: "小的", value: "small" },
      { label: "户外", value: "outdoor" },
      { label: "桥", value: "bridge" },
      { label: "国家", value: "country" },
      { label: "不认识", value: "unknown" },
    ],
  },
  {
    word: "library",
    options: [
      { label: "图书馆", value: "library" },
      { label: "学校", value: "school" },
      { label: "医院", value: "hospital" },
      { label: "公园", value: "park" },
      { label: "商店", value: "store" },
      { label: "不认识", value: "unknown" },
    ],
  },
  {
    word: "beautiful",
    options: [
      { label: "丑陋的", value: "ugly" },
      { label: "美丽的", value: "beautiful" },
      { label: "普通的", value: "normal" },
      { label: "奇怪的", value: "strange" },
      { label: "可爱的", value: "cute" },
      { label: "不认识", value: "unknown" },
    ],
  },
];

export default function VocabularyTestTesting() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [timer, setTimer] = useState(8);
  const [showWarning, setShowWarning] = useState(false);

  const currentWord = testWords[currentIndex];
  const progress = ((currentIndex + 1) / testWords.length) * 100;

  // 计时器
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setShowWarning(true);
    }
  }, [timer]);

  const handleAnswerSelect = (value: string) => {
    setSelectedAnswer(value);
    
    // 模拟答案检查
    setTimeout(() => {
      if (value === currentWord.word || value === "unknown") {
        if (value !== "unknown") {
          setCorrectCount((prev) => prev + 1);
        }
      } else {
        setWrongCount((prev) => prev + 1);
      }

      // 进入下一题
      if (currentIndex < testWords.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setTimer(8);
        setShowWarning(false);
      } else {
        // 测试完成
        setTimeout(() => {
          navigate("/");
        }, 1000);
      }
    }, 300);
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
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
      <div className="pt-14 px-4 pb-32">
        {/* 进度和提示 */}
        <div className="flex items-center justify-between mb-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="text-[#4ECDC4] text-lg font-semibold">
              {String(currentIndex + 1).padStart(2, "0")}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#718096]">
            <span>停留时间超过 10 秒，建议选择不认识</span>
          </div>
          <button onClick={() => navigate(-1)}>
            <X size={24} className="text-[#718096]" />
          </button>
        </div>

        {/* 单词卡片 */}
        <div className="bg-white rounded-xl p-8 mb-8 text-center shadow-sm">
          <div className="flex items-center justify-center gap-4 mb-4">
            <h2 className="text-4xl font-bold text-[#2D3748]">
              {currentWord.word}
            </h2>
            <button className="text-[#55A3FF] hover:text-[#4ECDC4] transition-colors">
              <Volume2 size={28} />
            </button>
          </div>
        </div>

        {/* 选项 */}
        <div className="space-y-3 max-w-lg mx-auto">
          {currentWord.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(option.value)}
              className={`w-full flex items-center justify-between px-6 py-4 rounded-xl text-left transition-all ${
                option.label === "不认识"
                  ? "bg-[#E2E8F0] text-[#718096] hover:bg-[#D1D5DB]"
                  : "bg-white text-[#2D3748] hover:bg-[#F7F9FC] border border-[#E2E8F0] hover:border-[#4ECDC4]"
              } ${
                selectedAnswer === option.value
                  ? "ring-2 ring-[#4ECDC4] bg-[#4ECDC4]/10"
                  : ""
              }`}
            >
              <span className="text-base">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 底部统计 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] py-4 px-6">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          <div className="text-center">
            <div className="text-2xl font-bold text-[#2D3748]">{correctCount}</div>
            <div className="text-sm text-[#718096]">正确</div>
          </div>
          <div className="w-px h-10 bg-[#E2E8F0]" />
          <div className="text-center">
            <div className="text-2xl font-bold text-[#2D3748]">{wrongCount}</div>
            <div className="text-sm text-[#718096]">错误</div>
          </div>
          <div className="w-px h-10 bg-[#E2E8F0]" />
          <div className="text-center">
            <div className="text-2xl font-bold text-[#4ECDC4]">{currentIndex + 1}</div>
            <div className="text-sm text-[#718096]">答题进度</div>
          </div>
        </div>
      </div>
    </div>
  );
}
