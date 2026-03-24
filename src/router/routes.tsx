import { createBrowserRouter } from "react-router";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import TrainingRecords from "@/pages/TrainingRecords";
import AntiForgetting from "@/pages/AntiForgetting";
import CoachCenter from "@/pages/CoachCenter";
import VocabularyTest from "@/pages/VocabularyTest";
import VocabularyTestTesting from "@/pages/VocabularyTestTesting";
import StudentManagement from "@/pages/StudentManagement";
import ReviewWordList from "@/pages/ReviewWordList";
import CommissionCheck from "@/pages/CommissionCheck";
import TestRecords from "@/pages/TestRecords";
import Settings from "@/pages/Settings";
import MaterialSelection from "@/pages/MaterialSelection";
import WordTraining from "@/pages/WordTraining";
import PreTrainingCheck from "@/pages/PreTrainingCheck";
import ReviewCheck from "@/pages/ReviewCheck";
import WordPractice from "@/pages/WordPractice";
import WordReview from "@/pages/WordReview";
import FlashReview from "@/pages/FlashReview";
import PostTrainingCheck from "@/pages/PostTrainingCheck";
import CreateAntiForgetting from "@/pages/CreateAntiForgetting";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "training-records", element: <TrainingRecords /> },
      { path: "anti-forgetting", element: <AntiForgetting /> },
      { path: "coach-center", element: <CoachCenter /> },
    ],
  },
  // 独立页面（不使用Layout）
  { path: "/vocabulary-test", element: <VocabularyTest /> },
  { path: "/vocabulary-test/testing", element: <VocabularyTestTesting /> },
  { path: "/student-management", element: <StudentManagement /> },
  { path: "/review-word-list", element: <ReviewWordList /> },
  { path: "/commission-check", element: <CommissionCheck /> },
  { path: "/test-records", element: <TestRecords /> },
  { path: "/settings", element: <Settings /> },
  // 单词训练流程页面
  { path: "/material-selection", element: <MaterialSelection /> },
  { path: "/word-training", element: <WordTraining /> },
  { path: "/pre-training-check", element: <PreTrainingCheck /> },
  { path: "/review-check", element: <ReviewCheck /> },
  { path: "/word-practice", element: <WordPractice /> },
  { path: "/word-review", element: <WordReview /> },
  { path: "/flash-review", element: <FlashReview /> },
  { path: "/post-training-check", element: <PostTrainingCheck /> },
  { path: "/create-anti-forgetting", element: <CreateAntiForgetting /> },
]);