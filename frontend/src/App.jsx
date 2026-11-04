import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedLayout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Upload from './pages/Upload.jsx';
import Projects from './pages/Projects.jsx';
import Results from './pages/Results.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Upload />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/results/:id" element={<Results />} />
        <Route path="/results" element={<Results />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
