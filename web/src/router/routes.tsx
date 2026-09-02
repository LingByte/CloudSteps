import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "../components/Layout";
import Home from "../pages/Home";
import AntiForgetting from "../pages/AntiForgetting";
import CoachCenter from "../pages/CoachCenter";
import CoachCompletedSessions from "../pages/CoachCompletedSessions";
import CheckIn from "../pages/CheckIn";
import VocabularyTest from "../pages/VocabularyTest";
import VocabularyTestTesting from "../pages/VocabularyTestTesting";
import VocabularyTestResult from "../pages/VocabularyTestResult";
import Feedback from "../pages/Feedback";
import Settings from "../pages/Settings";
import MaterialSelection from "../pages/MaterialSelection";
import ReadingComprehension from "../pages/ReadingComprehension";
import CreateCustomReading from "../pages/CreateCustomReading";
import CreateCustomScenario from "../pages/CreateCustomScenario";
import CreateCustomCloze from "../pages/CreateCustomCloze";
import ClozePractice from "../pages/ClozePractice";
import GrammarAnalysis from "../pages/GrammarAnalysis";
import ScenarioSelection from "../pages/ScenarioSelection";
import ScenarioHistory from "../pages/ScenarioHistory";
import ScenarioDialogue from "../pages/ScenarioDialogue";
import ScenarioReview from "../pages/ScenarioReview";
import WordTraining from "../pages/WordTraining";
import PreTrainingCheck from "../pages/PreTrainingCheck";
import ReviewCheck from "../pages/ReviewCheck";
import ReviewWordList from "../pages/ReviewWordList";
import WordPractice from "../pages/WordPractice";
import FlashReview from "../pages/FlashReview";
import PostTrainingCheck from "../pages/PostTrainingCheck";
import ListenIdentify from "../pages/ListenIdentify";
import CreateAntiForgetting from "../pages/CreateAntiForgetting";
import Notifications from "../pages/Notifications";
import Announcements from "../pages/Announcements";
import Login from "../pages/Login";
import Forbidden from "../pages/Forbidden";
import ProfileEdit from "../pages/ProfileEdit";
import InviteCode from "../pages/InviteCode";
import Recharge from "../pages/Recharge";
import About from "../pages/About";
import Terms from "../pages/Terms";
import Privacy from "../pages/Privacy";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";
import { PublicOnly, RequireAuth, RequireRole } from "../components/AuthGuard";
import MyStudents from "../pages/MyStudents";
import CreateStudent from "../pages/CreateStudent";
import CreateCoachingAppointment from "../pages/CreateCoachingAppointment";
import StudentDetail from "../pages/StudentDetail";
import WordBooks from "../pages/WordBooks";
import WordBookWords from "../pages/WordBookWords";
import WordBookShelf from "../pages/WordBookShelf";
import CreateCustomWordBook from "../pages/CreateCustomWordBook";
import LighthouseWords from "../pages/LighthouseWords";
import TrainingRecords from "../pages/TrainingRecords";

export const router = createBrowserRouter(
  [
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <WordBooks /> },
      {
        path: "my-students",
        element: (
          <RequireRole roles={["user", "teacher", "admin"]}>
            <MyStudents />
          </RequireRole>
        ),
      },
      {
        path: "my-students/new",
        element: (
          <RequireRole roles={["user", "teacher", "admin"]}>
            <CreateStudent />
          </RequireRole>
        ),
      },
      {
        path: "my-students/:studentId",
        element: (
          <RequireRole roles={["user", "teacher", "admin"]}>
            <StudentDetail />
          </RequireRole>
        ),
      },
      { path: "lesson-prep", element: <Home /> },
      {
        path: "lesson-prep/new",
        element: (
          <RequireRole roles={["user", "teacher", "admin"]}>
            <CreateCoachingAppointment />
          </RequireRole>
        ),
      },
      { path: "word-books", element: <WordBookShelf /> },
      { path: "word-books/custom/new", element: <CreateCustomWordBook /> },
      { path: "word-books/:id", element: <WordBookWords /> },
      { path: "training-records", element: <TrainingRecords /> },
      { path: "anti-forgetting", element: <AntiForgetting /> },
      { path: "coach-center", element: <CoachCenter /> },
      {
        path: "coach-center/checkin",
        element: (
          <RequireRole roles={["user", "teacher", "admin"]}>
            <CheckIn />
          </RequireRole>
        ),
      },
      {
        path: "coach-center/completed",
        element: (
          <RequireRole roles={["user", "teacher", "admin"]}>
            <CoachCompletedSessions />
          </RequireRole>
        ),
      },
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
    path: "/settings",
    element: (
      <RequireAuth>
        <Settings />
      </RequireAuth>
    ),
  },
  {
    path: "/invite-code",
    element: (
      <RequireAuth>
        <InviteCode />
      </RequireAuth>
    ),
  },
  {
    path: "/recharge",
    element: (
      <RequireAuth>
        <Recharge />
      </RequireAuth>
    ),
  },
  {
    path: "/feedback",
    element: (
      <RequireAuth>
        <Feedback />
      </RequireAuth>
    ),
  },
  {
    path: "/announcements",
    element: (
      <RequireAuth>
        <Announcements />
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
    path: "/reading-comprehension",
    element: (
      <RequireAuth>
        <ReadingComprehension />
      </RequireAuth>
    ),
  },
  {
    path: "/reading-comprehension/custom/new",
    element: (
      <RequireAuth>
        <CreateCustomReading />
      </RequireAuth>
    ),
  },
  {
    path: "/cloze-practice",
    element: (
      <RequireAuth>
        <ClozePractice />
      </RequireAuth>
    ),
  },
  {
    path: "/cloze-practice/custom/new",
    element: (
      <RequireAuth>
        <CreateCustomCloze />
      </RequireAuth>
    ),
  },
  {
    path: "/grammar-analysis",
    element: (
      <RequireAuth>
        <GrammarAnalysis />
      </RequireAuth>
    ),
  },
  {
    path: "/scenario-dialogues",
    element: (
      <RequireAuth>
        <ScenarioSelection />
      </RequireAuth>
    ),
  },
  {
    path: "/scenario-dialogues/custom/new",
    element: (
      <RequireAuth>
        <CreateCustomScenario />
      </RequireAuth>
    ),
  },
  {
    path: "/scenario-dialogues/history",
    element: (
      <RequireAuth>
        <ScenarioHistory />
      </RequireAuth>
    ),
  },
  {
    path: "/scenario-dialogue",
    element: (
      <RequireAuth>
        <ScenarioDialogue />
      </RequireAuth>
    ),
  },
  {
    path: "/scenario-review/:sessionId",
    element: (
      <RequireAuth>
        <ScenarioReview />
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
    path: "/lighthouse-words",
    element: (
      <RequireAuth>
        <LighthouseWords />
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
        <Navigate to="/word-practice" replace />
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
  ],
  // 部署到 GitHub Pages 项目页时，Vite 的 base（import.meta.env.BASE_URL）
  // 会带上仓库子路径，这里同步给 Router，避免路由在子路径下失效。
  { basename: import.meta.env.BASE_URL }
);