import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import MainLayout from './components/Layout/MainLayout'
import Dashboard from './pages/Dashboard'
import QRCodeGenerator from './components/QRCodeGenerator'
import URLShortener from './components/URLShortener'
import BarcodeGenerator from './components/BarcodeGenerator'
import VOCAssistant from './components/VOCAssistant'
import FieldSketchWriter from './components/FieldSketchWriter'
import ManualTips from './components/ManualTips'
import AutomationRequest from './components/AutomationRequest'
import WaterParkSales from './components/WaterParkSales'
import Login from './components/Auth/Login'
import Approvals from './components/Approvals'
import TTSGenerator from './components/TTSGenerator'
import ThumbnailGenerator from './components/ThumbnailGenerator'
import './App.css'

function App() {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        {!session ? (
          <>
            <Route path="/login" element={<Login onLoginSuccess={() => {}} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="tools/waterpark-sales" element={<WaterParkSales />} />
            <Route path="tools/qr-generator" element={<QRCodeGenerator />} />
            <Route path="tools/url-shortener" element={<URLShortener />} />
            <Route path="tools/barcode-generator" element={<BarcodeGenerator />} />
            <Route path="tools/voc-assistant" element={<VOCAssistant />} />
            <Route path="tools/field-sketch" element={<FieldSketchWriter />} />
            <Route path="tools/knowledge-base" element={<ManualTips />} />
            <Route path="tools/automation-request" element={<AutomationRequest />} />
            <Route path="tools/approvals" element={<Approvals />} />
            <Route path="tools/tts-generator" element={<TTSGenerator />} />
            <Route path="tools/thumbnail-generator" element={<ThumbnailGenerator />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  )
}

export default App
