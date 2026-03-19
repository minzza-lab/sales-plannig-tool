import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainLayout from './components/Layout/MainLayout'
import Dashboard from './pages/Dashboard'
import QRCodeGenerator from './components/QRCodeGenerator'
import URLShortener from './components/URLShortener'
import BarcodeGenerator from './components/BarcodeGenerator'
import VOCAssistant from './components/VOCAssistant'
import FieldSketchWriter from './components/FieldSketchWriter'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="tools/qr-generator" element={<QRCodeGenerator />} />
          <Route path="tools/url-shortener" element={<URLShortener />} />
          <Route path="tools/barcode-generator" element={<BarcodeGenerator />} />
          <Route path="tools/voc-assistant" element={<VOCAssistant />} />
          <Route path="tools/field-sketch" element={<FieldSketchWriter />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
