import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import NewsFeedPage from './pages/NewsFeedPage'
import StoryDetailPage from './pages/StoryDetailPage'
import ChatPage from './pages/ChatPage'
import FactCheckerPage from './pages/FactCheckerPage'
import QuizPage from './pages/QuizPage'
import SignalIQPage from './pages/SignalIQPage'
import FoundationsPage from './pages/FoundationsPage'
import SettingsPage from './pages/SettingsPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import OrbitalGlobePage from './pages/OrbitalGlobePage'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/legal/terms" element={<TermsPage />} />
            <Route path="/legal/privacy" element={<PrivacyPage />} />

            {/* Protected — wrapped in Layout */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <NewsFeedPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/story/:id" element={
              <ProtectedRoute>
                <Layout>
                  <StoryDetailPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/chat" element={
              <ProtectedRoute>
                <Layout>
                  <ChatPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/verify" element={
              <ProtectedRoute>
                <Layout>
                  <FactCheckerPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/quiz" element={
              <ProtectedRoute>
                <Layout>
                  <QuizPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/iq" element={
              <ProtectedRoute>
                <Layout>
                  <SignalIQPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/foundations" element={
              <ProtectedRoute>
                <Layout>
                  <FoundationsPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/settings" element={
              <ProtectedRoute>
                <Layout>
                  <SettingsPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/orbital" element={
              <ProtectedRoute>
                <Layout>
                  <OrbitalGlobePage />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  )
}
