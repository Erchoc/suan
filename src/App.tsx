import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import Nav from './components/Layout/Nav';
import Home from './pages/Home';
import PWAInstallPrompt from './components/PWAInstallPrompt';

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

// 路由切换时重置浏览器原生文档滚动位置。
function ScrollToTop() {
  const { pathname } = useLocation();
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
        {/* 移动端：内容区域底部留出 Tab Bar 高度，避免内容被遮住 */}
        <div className="sm:contents mobile-content-wrap">
          <Suspense
            fallback={(
              <div className="min-h-screen bg-bg flex items-center justify-center text-text-dim">
                正在加载…
              </div>
            )}
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
        <PWAInstallPrompt />
      </BrowserRouter>
    </ThemeProvider>
  );
}
