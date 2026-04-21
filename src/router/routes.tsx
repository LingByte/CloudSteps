import { createBrowserRouter } from "react-router";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import AntiForgetting from "@/pages/AntiForgetting";
import CoachCenter from "@/pages/CoachCenter";
import VocabularyTest from "@/pages/VocabularyTest";
import VocabularyTestTesting from "@/pages/VocabularyTestTesting";
import VocabularyTestResult from "@/pages/VocabularyTestResult";
import CommissionCheck from "@/pages/CommissionCheck";
import TestRecords from "@/pages/TestRecords";
import Settings from "@/pages/Settings";
import MaterialSelection from "@/pages/MaterialSelection";
import WordTraining from "@/pages/WordTraining";
import PreTrainingCheck from "@/pages/PreTrainingCheck";
import ReviewCheck from "@/pages/ReviewCheck";
import ReviewWordList from "@/pages/ReviewWordList";
import WordPractice from "@/pages/WordPractice";
import WordReview from "@/pages/WordReview";
import FlashReview from "@/pages/FlashReview";
import PostTrainingCheck from "@/pages/PostTrainingCheck";
import ListenIdentify from "@/pages/ListenIdentify";
import CreateAntiForgetting from "@/pages/CreateAntiForgetting";
import Notifications from "@/pages/Notifications";
import Login from "@/pages/Login";
import Forbidden from "@/pages/Forbidden";
import ProfileEdit from "@/pages/ProfileEdit";
import About from "@/pages/About";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PublicOnly, RequireAuth, RequireRole } from "@/components/AuthGuard";
import MyStudents from "@/pages/MyStudents";
import StudentTrainingRecords from "@/pages/StudentTrainingRecords";
import WordBooks from "@/pages/WordBooks";
import WordBookWords from "@/pages/WordBookWords";
import LighthouseWords from "@/pages/LighthouseWords";

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Home /> },
      {
        path: "my-students",
        element: (
          <RequireRole roles={["user", "teacher", "admin"]}>
            <MyStudents />
          </RequireRole>
        ),
      },
      {
        path: "my-students/:studentId/training",
        element: (
          <RequireRole roles={["user", "teacher", "admin"]}>
            <StudentTrainingRecords />
          </RequireRole>
        ),
      },
      { path: "word-books", element: <WordBooks /> },
      { path: "word-books/:id", element: <WordBookWords /> },
      { path: "lighthouse-words", element: <LighthouseWords /> },
      { path: "anti-forgetting", element: <AntiForgetting /> },
      { path: "coach-center", element: <CoachCenter /> },
      { path: "profile/edit", element: <ProfileEdit /> },
      { path: "notifications", element: <Notifications /> },
    ],
  },
  // 独立页面（不使用Layout）
  {
    path: "/vocabulary-test",
    element: (
      <RequireAuth>
        <VocabularyTest />
      </RequireAuth>
    ),
  },
  {
    path: "/vocabulary-test/testing",
    element: (
      <RequireAuth>
        <VocabularyTestTesting />
      </RequireAuth>
    ),
  },
  {
    path: "/vocabulary-test/result",
    element: (
      <RequireAuth>
        <VocabularyTestResult />
      </RequireAuth>
    ),
  },
  {
    path: "/review-word-list",
    element: (
      <RequireAuth>
        <ReviewWordList />
      </RequireAuth>
    ),
  },
  {
    path: "/commission-check",
    element: (
      <RequireAuth>
        <RequireRole roles={["admin", "user"]}>
          <CommissionCheck />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: "/test-records",
    element: (
      <RequireAuth>
        <TestRecords />
      </RequireAuth>
    ),
  },
  {
    path: "/settings",
    element: (
      <RequireAuth>
        <Settings />
      </RequireAuth>
    ),
  },
  {
    path: "/login",
    element: (
      <PublicOnly>
        <Login />
      </PublicOnly>
    ),
  },
  {
    path: "/about",
    element: <About />,
  },
  {
    path: "/terms",
    element: <Terms />,
  },
  {
    path: "/privacy",
    element: <Privacy />,
  },
  {
    path: "/403",
    element: (
      <RequireAuth>
        <Forbidden />
      </RequireAuth>
    ),
  },
  // 单词训练流程页面
  {
    path: "/material-selection",
    element: (
      <RequireAuth>
        <MaterialSelection />
      </RequireAuth>
    ),
  },
  {
    path: "/word-training",
    element: (
      <RequireAuth>
        <WordTraining />
      </RequireAuth>
    ),
  },
  {
    path: "/pre-training-check",
    element: (
      <RequireAuth>
        <PreTrainingCheck />
      </RequireAuth>
    ),
  },
  {
    path: "/review-check",
    element: (
      <RequireAuth>
        <ReviewCheck />
      </RequireAuth>
    ),
  },
  {
    path: "/word-practice",
    element: (
      <RequireAuth>
        <WordPractice />
      </RequireAuth>
    ),
  },
  {
    path: "/word-review",
    element: (
      <RequireAuth>
        <WordReview />
      </RequireAuth>
    ),
  },
  {
    path: "/flash-review",
    element: (
      <RequireAuth>
        <FlashReview />
      </RequireAuth>
    ),
  },
  {
    path: "/listen-identify",
    element: (
      <RequireAuth>
        <ListenIdentify />
      </RequireAuth>
    ),
  },
  {
    path: "/post-training-check",
    element: (
      <RequireAuth>
        <PostTrainingCheck />
      </RequireAuth>
    ),
  },
  {
    path: "/create-anti-forgetting",
    element: (
      <RequireAuth>
        <CreateAntiForgetting />
      </RequireAuth>
    ),
  },
]);