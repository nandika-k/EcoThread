import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './components/chrome'
import {
  AuthPage,
  BoardDetailPage,
  BoardsPage,
  FeedPage,
  ProfilePage,
  ProfileSetupPage,
} from './pages'

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AuthPage />} path="/auth" />
      <Route element={<AuthGate />}>
        <Route element={<ProfileSetupPage />} path="/profile-setup" />
        <Route element={<FeedPage />} path="/feed" />
        <Route element={<BoardsPage />} path="/boards" />
        <Route element={<BoardDetailPage />} path="/boards/:id" />
        <Route element={<ProfilePage />} path="/profile" />
      </Route>
      <Route element={<Navigate replace to="/feed" />} path="*" />
    </Routes>
  )
}
