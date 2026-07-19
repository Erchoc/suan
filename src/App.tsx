import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Nav from './components/Layout/Nav';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { ThemeProvider } from './contexts/ThemeContext';
import Home from './pages/Home';

const Graph = lazy(() => import('./pages/Graph'));
const Assessment = lazy(() => import('./pages/Assessment'));
const ExamConfig = lazy(() => import('./pages/Assessment/ExamConfig'));
const UploadConfig = lazy(() => import('./pages/Assessment/UploadConfig'));
const Exam = lazy(() => import('./pages/Exam'));
const Report = lazy(() => import('./pages/Report'));
const ReviewEntry = lazy(() => import('./pages/Review'));
const ReviewSession = lazy(() => import('./pages/Review/ReviewSession'));
const ReviewSummary = lazy(() => import('./pages/Review/ReviewSummary'));
const PreviewIndex = lazy(() => import('./pages/Preview'));
const PreviewSession = lazy(() => import('./pages/Preview/PreviewSession'));
const QuestionDetail = lazy(() => import('./pages/Question'));
const AdminQuestionBank = lazy(() => import('./pages/Admin'));
const Account = lazy(() => import('./pages/Account'));

// Reset the browser's native document scroll position on route changes.
function ScrollToTop() {
  const { pathname } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: The pathname intentionally retriggers the scroll reset.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Nav />
        {/* Reserve space for the mobile tab bar so it does not cover page content. */}
        <div className="sm:contents mobile-content-wrap">
          <Suspense
            fallback={
              <div className="min-h-screen bg-bg flex items-center justify-center text-text-dim">
                正在加载…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/graph" element={<Graph />} />
              <Route path="/assessment" element={<Assessment />} />
              <Route path="/assessment/exam" element={<ExamConfig />} />
              <Route path="/assessment/upload" element={<UploadConfig />} />
              <Route path="/exam/:sessionId" element={<Exam />} />
              <Route path="/report/:sessionId" element={<Report />} />
              <Route path="/review" element={<ReviewEntry />} />
              <Route path="/review/:sessionId" element={<ReviewSession />} />
              <Route path="/review/:sessionId/summary" element={<ReviewSummary />} />
              <Route path="/preview" element={<PreviewIndex />} />
              <Route path="/preview/:sessionId" element={<PreviewSession />} />
              <Route path="/question/:questionId" element={<QuestionDetail />} />
              <Route path="/console" element={<AdminQuestionBank />} />
              <Route path="/account" element={<Account />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
        <PWAInstallPrompt />
      </BrowserRouter>
    </ThemeProvider>
  );
}
