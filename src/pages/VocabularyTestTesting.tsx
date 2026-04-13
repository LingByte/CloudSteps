import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, X, Volume2 } from "lucide-react";

import { getVocabNext, submitVocabTest } from "@/api/vocab";

type ApiQuestion = {
  id: number;
  word: string;
  options: string; // JSON string
  correctAnswer: string;
  level: string;
  difficultyScore: number;
};

type OptionItem = { label: string; value: string };

const parseOptions = (options: string): string[] => {
  try {
    const arr = JSON.parse(options);
    return Array.isArray(arr) ? arr.map((s) => String(s)) : [];
  } catch {
    return [];
  }
};

export default function VocabularyTestTesting() {
  const navigate = useNavigate();
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [timer, setTimer] = useState(8);
  const [showWarning, setShowWarning] = useState(false);
  const [loading, setLoading] = useState(true);

  const [currentQuestion, setCurrentQuestion] = useState<ApiQuestion | null>(null);
  const [answeredIds, setAnsweredIds] = useState<number[]>([]);
  const [answers, setAnswers] = useState<{ questionId: number; answer: string }[]>([]);
  const answersRef = useRef<{ questionId: number; answer: string }[]>([]);
  const [currentDifficultyScore, setCurrentDifficultyScore] = useState(3);
  const [lastQuestionId, setLastQuestionId] = useState(0);
  const [finished, setFinished] = useState(false);

	const WRONG_LIMIT = 5;

  const options: OptionItem[] = useMemo(() => {
    if (!currentQuestion) return [];
    const opts = parseOptions(currentQuestion.options);
    
    // 将选项乱序（Fisher-Yates 洗牌算法）
    const shuffledOptions = [...opts];
    for (let i = shuffledOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
    }
    
    // 将"不认识"选项放在最下面
    return shuffledOptions.map((label) => ({ label, value: label })).concat([{ label: "不认识", value: "不认识" }]);
  }, [currentQuestion]);

  const currentIndex = answeredIds.length;
  const progress = 0;

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

  const fetchNext = async (params: { correct: boolean; lastQuestionId: number; answeredIds: number[]; currentDifficultyScore: number }) => {
    const res = await getVocabNext({
      lastQuestionId: params.lastQuestionId,
      correct: params.correct,
      currentDifficultyScore: params.currentDifficultyScore,
      answeredIds: params.answeredIds,
    });
    if (res.code !== 200) throw new Error(res.msg || "获取题目失败");
    const data = res.data;
    if (data.finished) {
      setFinished(true);
      return;
    }
    setCurrentDifficultyScore(data.currentDifficultyScore ?? params.currentDifficultyScore);
    setCurrentQuestion(data.question);
    setLastQuestionId(data.question?.id ?? 0);
  };

	const submitAndGoResult = async (payloadAnswers: { questionId: number; answer: string }[]) => {
		if (!payloadAnswers || payloadAnswers.length === 0) {
			throw new Error("答案不能为空");
		}
		const res = await submitVocabTest({ answers: payloadAnswers });
		if (res.code !== 200) throw new Error(res.msg || "提交失败");
		sessionStorage.setItem("vocabulary_test_result", JSON.stringify(res.data));
		navigate("/vocabulary-test/result", { replace: true });
	};

  // 初始化：取第一题
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        await fetchNext({ correct: true, lastQuestionId: 0, answeredIds: [], currentDifficultyScore: 3 });
        if (!mounted) return;
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnswerSelect = async (value: string) => {
    if (!currentQuestion || loading) return;
    setSelectedAnswer(value);

    const isUnknown = value === "不认识";
    const isCorrect = !isUnknown && value === currentQuestion.correctAnswer;
    if (isCorrect) setCorrectCount((prev) => prev + 1);
    if (!isCorrect) setWrongCount((prev) => prev + 1);

    const qid = currentQuestion.id;
    const nextAnswers = [...answers, { questionId: qid, answer: value }];
    setAnswers(nextAnswers);
    answersRef.current = nextAnswers;
    const nextAnsweredIds = [...answeredIds, qid];
    setAnsweredIds(nextAnsweredIds);

		// 错误超过 5 个：直接结算
		const nextWrongCount = wrongCount + (isCorrect ? 0 : 1);
		if (nextWrongCount > WRONG_LIMIT) {
			try {
				setLoading(true);
				setFinished(true);
				await submitAndGoResult(nextAnswers);
			} catch (e) {
				console.error(e);
				navigate("/", { replace: true });
			} finally {
				setLoading(false);
			}
			return;
		}

    // 进入下一题
    try {
      setLoading(true);
      await fetchNext({
        correct: isCorrect,
        lastQuestionId: qid,
        answeredIds: nextAnsweredIds,
        currentDifficultyScore,
      });
      setSelectedAnswer(null);
      setTimer(8);
      setShowWarning(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // finished 时提交结果并跳转
  useEffect(() => {
    if (!finished) return;
    (async () => {
      try {
        // 若已被提前结算逻辑提交并跳转，这里不再重复提交
        if (sessionStorage.getItem("vocabulary_test_result")) return;
        await submitAndGoResult(answersRef.current);
      } catch (e) {
        console.error(e);
        navigate("/", { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

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
              {loading || !currentQuestion ? "加载中..." : currentQuestion.word}
            </h2>
            <button className="text-[#55A3FF] hover:text-[#4ECDC4] transition-colors">
              <Volume2 size={28} />
            </button>
          </div>
        </div>

        {/* 选项 */}
        <div className="space-y-3 max-w-lg mx-auto">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(option.value)}
              disabled={loading || !currentQuestion}
              className={`w-full flex items-center justify-between px-6 py-4 rounded-xl text-left transition-all ${
                option.label === "不认识"
                  ? "bg-[#E2E8F0] text-[#718096] hover:bg-[#D1D5DB]"
                  : "bg-white text-[#2D3748] hover:bg-[#F7F9FC] border border-[#E2E8F0] hover:border-[#4ECDC4]"
              } ${
                selectedAnswer === option.value
                  ? "ring-2 ring-[#4ECDC4] bg-[#4ECDC4]/10"
                  : ""
              } ${loading ? "opacity-60 pointer-events-none" : ""}`}
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
