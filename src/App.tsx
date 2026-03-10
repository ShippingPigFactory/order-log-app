import { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ClipboardCopy, Loader2, Upload, Check, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { SYSTEM_PROMPT, STAFF_LIST, PACKING_SIZES } from './constants';
import './App.scss';

// APIキーとモデル名の設定
const API_KEY = import.meta.env.VITE_GEMINI;
const genAI = new GoogleGenerativeAI(API_KEY);
const MODEL_NAME = "gemini-1.5-flash"; // 安定版

type AppMode = 'return' | 'damage' | 'cancel';

interface OrderData {
  receptionDate: string; name: string; orderId: string; mall: string; asin: string;
  productName: string; quantity: string; quantityDiff: string; staff: string; memo: string;
  receivedDate: string;
  packingSize: string;
  replacementShipDate: string;
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('return');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  
  const today = new Date().toISOString().split('T')[0];

  const [data, setData] = useState<OrderData>({
    receptionDate: today, name: '', orderId: '', mall: '', asin: '-', productName: '', 
    quantity: '0', quantityDiff: '', staff: STAFF_LIST[0], memo: '',
    receivedDate: today,
    packingSize: PACKING_SIZES[0],
    replacementShipDate: today
  });

  const analyzeImage = async (base64Data: string) => {
    setLoading(true);
    try {
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });
      const result = await model.generateContent([
        SYSTEM_PROMPT,
        { inlineData: { data: base64Data.split(',')[1], mimeType: "image/png" } }
      ]);
      const responseText = result.response.text();
      const cleanJson = responseText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanJson);

      setData(prev => ({
        ...prev,
        receptionDate: parsed.receptionDate || today,
        name: parsed.name || '',
        orderId: parsed.orderId || '',
        mall: parsed.mall || '',
        asin: parsed.asin || '-',
        productName: parsed.productName || '',
        quantity: parsed.totalQuantity?.toString() || '0'
      }));
    } catch (err) {
      alert("解析に失敗しました。APIキーまたはネットワークを確認してください。");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setImage(base64);
      analyzeImage(base64);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.items[0]?.getAsFile();
      if (file) handleFile(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const copyToClipboard = () => {
    let row: any[] = [];
    if (mode === 'return') {
      // 返品(11列): 受付日 お名前 注文番号 購入先 ASIN 商品名 個数 届いた日 個数増減 処理した人の名前 備考
      row = [
        data.receptionDate, data.name, data.orderId, data.mall, data.asin,
        data.productName, data.quantity, data.receivedDate, data.quantityDiff, data.staff, data.memo
      ];
    } else if (mode === 'damage') {
      // 破損(12列): 受付日 お名前 注文番号 購入先 ASIN 商品名 個数 梱包サイズ 代品発送日 個数増減 処理した人の名前 備考
      row = [
        data.receptionDate, data.name, data.orderId, data.mall, data.asin,
        data.productName, data.quantity, data.packingSize, data.replacementShipDate, data.quantityDiff, data.staff, data.memo
      ];
    } else if (mode === 'cancel') {
      // キャンセル(7列): キャンセル日 モール 受注番号 購入者名 商品名 単品個数 担当者
      row = [
        data.receptionDate, data.mall, data.orderId, data.name, data.productName, data.quantity, data.staff
      ];
    }
    
    navigator.clipboard.writeText(row.join('\t'));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>注文記帳アシスタント</h1>
        <div className="tabs">
          <button className={mode === 'return' ? 'active' : ''} onClick={() => setMode('return')}>
            <RefreshCw size={16} /> 返品
          </button>
          <button className={mode === 'damage' ? 'active' : ''} onClick={() => setMode('damage')}>
            <AlertTriangle size={16} /> 破損
          </button>
          <button className={mode === 'cancel' ? 'active' : ''} onClick={() => setMode('cancel')}>
            <XCircle size={16} /> キャンセル
          </button>
        </div>
      </header>

      {loading && <div className="loading-overlay"><Loader2 className="animate-spin" size={48} /><p>AI解析中...</p></div>}

      <div className="main-layout">
        <div className="left-side">
          <div className="upload-area" onClick={() => document.getElementById('fileInput')?.click()}>
            <Upload size={40} color="#999" />
            <p><strong>画像を貼り付け (Ctrl+V)</strong></p>
            <input id="fileInput" type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {image && <img src={image} alt="preview" />}
          </div>
        </div>

        <div className="right-side">
          <div className="form-card">
            <h3>
              {mode === 'return' && '返品管理'}
              {mode === 'damage' && '破損管理'}
              {mode === 'cancel' && 'キャンセル管理'}
            </h3>
            <div className="grid">
              <div className="field">
                <label>{mode === 'cancel' ? 'キャンセル日' : '受付日'}</label>
                <input type="date" value={data.receptionDate} onChange={e => setData({...data, receptionDate: e.target.value})} />
              </div>
              <div className="field">
                <label>{mode === 'cancel' ? '購入者名' : 'お名前'}</label>
                <input type="text" value={data.name} onChange={e => setData({...data, name: e.target.value})} />
              </div>
              <div className="field">
                <label>{mode === 'cancel' ? '受注番号' : '注文番号'}</label>
                <input type="text" value={data.orderId} onChange={e => setData({...data, orderId: e.target.value})} />
              </div>
              <div className="field">
                <label>{mode === 'cancel' ? 'モール' : '購入先'}</label>
                <select value={data.mall} onChange={e => setData({...data, mall: e.target.value})}>
                  <option value="">未選択</option><option value="Amazon">Amazon</option><option value="楽天市場">楽天市場</option>
                </select>
              </div>

              {/* キャンセルモード以外で表示する項目 */}
              {mode !== 'cancel' && (
                <div className="field"><label>ASIN</label><input type="text" value={data.asin} onChange={e => setData({...data, asin: e.target.value})} /></div>
              )}

              <div className="field">
                <label>{mode === 'cancel' ? '単品個数' : '商品総数'}</label>
                <input type="number" value={data.quantity} onChange={e => setData({...data, quantity: e.target.value})} />
              </div>
              
              {/* 各モード特有のフィールド */}
              {mode === 'return' && (
                <div className="field highlight"><label>届いた日</label><input type="date" value={data.receivedDate} onChange={e => setData({...data, receivedDate: e.target.value})} /></div>
              )}
              {mode === 'damage' && (
                <>
                  <div className="field highlight">
                    <label>梱包サイズ</label>
                    <select value={data.packingSize} onChange={e => setData({...data, packingSize: e.target.value})}>
                      {PACKING_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field highlight"><label>代品発送日</label><input type="date" value={data.replacementShipDate} onChange={e => setData({...data, replacementShipDate: e.target.value})} /></div>
                </>
              )}

              {/* キャンセルモード以外で表示する項目 */}
              {mode !== 'cancel' && (
                <div className="field highlight"><label>個数増減</label><input type="number" value={data.quantityDiff} onChange={e => setData({...data, quantityDiff: e.target.value})} placeholder="±n" /></div>
              )}

              <div className={`field highlight ${mode === 'cancel' ? '' : 'full'}`}>
                <label>{mode === 'cancel' ? '担当者' : '処理した人の名前'}</label>
                <select value={data.staff} onChange={e => setData({...data, staff: e.target.value})}>
                  {STAFF_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="field full"><label>商品名</label><input type="text" value={data.productName} onChange={e => setData({...data, productName: e.target.value})} /></div>
              
              {mode !== 'cancel' && (
                <div className="field full"><label>備考</label><textarea rows={2} value={data.memo} onChange={e => setData({...data, memo: e.target.value})} /></div>
              )}
            </div>
            
            <button className={`copy-btn ${copied ? 'is-copied' : ''}`} onClick={copyToClipboard} disabled={!data.orderId || copied}>
              {copied ? <><Check size={20} /> コピー完了！</> : <><ClipboardCopy size={20} /> スプレッドシート用にコピー</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}