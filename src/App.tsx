import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './App.css'

const MainLayout = lazy(() => import('./components/Layout/MainLayout'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const QRCodeGenerator = lazy(() => import('./components/QRCodeGenerator'))
const URLShortener = lazy(() => import('./components/URLShortener'))
const BarcodeGenerator = lazy(() => import('./components/BarcodeGenerator'))
const VOCAssistant = lazy(() => import('./components/VOCAssistant'))
const FieldSketchWriter = lazy(() => import('./components/FieldSketchWriter'))
const ManualTips = lazy(() => import('./components/ManualTips'))
const AutomationRequest = lazy(() => import('./components/AutomationRequest'))
const WaterParkSales = lazy(() => import('./components/WaterParkSales'))
const Login = lazy(() => import('./components/Auth/Login'))
const Approvals = lazy(() => import('./components/Approvals'))
const ProductProposals = lazy(() => import('./components/ProductProposals'))
const TTSGenerator = lazy(() => import('./components/TTSGenerator'))
const ThumbnailGenerator = lazy(() => import('./components/ThumbnailGenerator'))
const SeasonPassTracker = lazy(() => import('./components/SeasonPassTracker'))
const ProductProposalGenerator = lazy(() => import('./components/ProductProposalGenerator'))
const PackageSalesDashboard = lazy(() => import('./components/PackageSalesDashboard'))
const QRVerifier = lazy(() => import('./components/QRVerifier'))
const AIStudio = lazy(() => import('./ai-studio/AIStudio'))

const AppLoader = () => (
  <div className="app-loader" role="status" aria-live="polite">
    불러오는 중...
  </div>
)

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
    return <AppLoader />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<AppLoader />}>
        <Routes>
          {!session ? (
            <>
              <Route path="/login" element={<Login onLoginSuccess={() => {}} />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/ai-studio/*" element={<AIStudio />} />
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
                <Route path="tools/product-proposals" element={<ProductProposals />} />
                <Route path="tools/tts-generator" element={<TTSGenerator />} />
                <Route path="tools/thumbnail-generator" element={<ThumbnailGenerator />} />
                <Route path="tools/season-pass-tracker" element={<SeasonPassTracker />} />
                <Route path="tools/proposal-generator" element={<ProductProposalGenerator />} />
                <Route path="tools/package-sales" element={<PackageSalesDashboard />} />
                <Route path="tools/qr-verifier" element={<QRVerifier />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </>
          )}
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
