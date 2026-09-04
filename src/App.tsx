import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './App.css'

const MainLayout = lazy(() => import('./components/Layout/MainLayout'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const VirtualOffice = lazy(() => import('./pages/VirtualOffice'))
const AppAccessCenter = lazy(() => import('./components/AppAccessCenter'))
const AdminConsole = lazy(() => import('./components/AdminConsole'))
const AccessPending = lazy(() => import('./components/AccessPending'))
const QRCodeGenerator = lazy(() => import('./components/QRCodeGenerator'))
const URLShortener = lazy(() => import('./components/URLShortener'))
const BarcodeGenerator = lazy(() => import('./components/BarcodeGenerator'))
const VOCAssistant = lazy(() => import('./components/VOCAssistant'))
const FieldSketchWriter = lazy(() => import('./components/FieldSketchWriter'))
const ManualTips = lazy(() => import('./components/ManualTips'))
const AutomationRequest = lazy(() => import('./components/AutomationRequest'))
const WaterParkSales = lazy(() => import('./components/WaterParkSales'))
const WaterOperationsDashboard = lazy(() => import('./components/WaterOperationsDashboard'))
const WaterOperationsAnalysis = lazy(() => import('./components/WaterOperationsAnalysis'))
const NicepaySettlement = lazy(() => import('./components/NicepaySettlement'))
const DepositReconciliation = lazy(() => import('./components/DepositReconciliation'))
const Login = lazy(() => import('./components/Auth/Login'))
const Approvals = lazy(() => import('./components/Approvals'))
const ProductProposals = lazy(() => import('./components/ProductProposals'))
const TTSGenerator = lazy(() => import('./components/TTSGenerator'))
const SMSGenerator = lazy(() => import('./components/SMSGenerator'))
const ThumbnailGenerator = lazy(() => import('./components/ThumbnailGenerator'))
const SeasonPassTracker = lazy(() => import('./components/SeasonPassTracker'))
const ProductProposalGenerator = lazy(() => import('./components/ProductProposalGenerator'))
const PackageSalesDashboard = lazy(() => import('./components/PackageSalesDashboard'))
const QRVerifier = lazy(() => import('./components/QRVerifier'))
const TeamWorkspace = lazy(() => import('./components/TeamWorkspace'))
const SalesSchedulePerformance = lazy(() => import('./components/SalesSchedulePerformance'))
const ApprovalCoverSplitter = lazy(() => import('./components/ApprovalCoverSplitter'))
const RoomStateDashboard = lazy(() => import('./components/RoomStateDashboard'))
const SportsSalesDashboard = lazy(() => import('./components/SportsSalesDashboard'))
const AIStudio = lazy(() => import('./ai-studio/AIStudio'))

const AppLoader = () => (
  <div className="app-loader" role="status" aria-live="polite">
    불러오는 중...
  </div>
)

function App() {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<'checking' | 'pending' | 'approved' | 'suspended'>('checking');

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

  useEffect(() => {
    if (!session?.user?.id) {
      setAccessStatus('approved');
      return;
    }
    let active = true;
    setAccessStatus('checking');
    supabase.from('app_user_access').select('status').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        // SQL 보안 설정을 배포하기 전에도 기존 서비스가 멈추지 않도록 한다.
        setAccessStatus(error || !data ? 'approved' : data.status as 'pending' | 'approved' | 'suspended');
      });
    return () => { active = false; };
  }, [session?.user?.id]);

  if (isLoading) {
    return <AppLoader />;
  }

  if (session && accessStatus === 'checking') {
    return <AppLoader />;
  }

  if (session && (accessStatus === 'pending' || accessStatus === 'suspended')) {
    return <AccessPending status={accessStatus} />;
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
                <Route path="virtual-office" element={<VirtualOffice />} />
                <Route path="tools/app-access" element={<AppAccessCenter />} />
                <Route path="tools/admin" element={<AdminConsole />} />
                <Route path="tools/waterpark-sales" element={<WaterParkSales />} />
                <Route path="tools/water-operations" element={<WaterOperationsDashboard />} />
                <Route path="tools/water-operations-analysis" element={<WaterOperationsAnalysis />} />
                <Route path="tools/nicepay-settlement" element={<NicepaySettlement />} />
                <Route path="tools/deposit-reconciliation" element={<DepositReconciliation />} />
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
                <Route path="tools/sms-generator" element={<SMSGenerator />} />
                <Route path="tools/thumbnail-generator" element={<ThumbnailGenerator />} />
                <Route path="tools/season-pass-tracker" element={<SeasonPassTracker />} />
                <Route path="tools/proposal-generator" element={<ProductProposalGenerator />} />
                <Route path="tools/package-sales" element={<PackageSalesDashboard />} />
                <Route path="tools/qr-verifier" element={<QRVerifier />} />
                <Route path="tools/team-workspace" element={<TeamWorkspace />} />
                <Route path="tools/sales-schedule-performance" element={<SalesSchedulePerformance />} />
                <Route path="tools/approval-cover-splitter" element={<ApprovalCoverSplitter />} />
                <Route path="tools/room-state" element={<RoomStateDashboard />} />
                <Route path="tools/sports-sales" element={<SportsSalesDashboard />} />
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
