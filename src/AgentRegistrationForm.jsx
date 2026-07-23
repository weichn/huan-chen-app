import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// ============================================================
//   色彩常數設定
// ============================================================
const GOOD = "#4CAF50";       // 成功/完成的顏色
const LINE_C = "#E0E0E0";     // 邊框與線條顏色
const INK_SOFT = "#757575";   // 次要文字顏色
const INK = "#212121";        // 主要文字顏色
const SEAL = "#8D6E63";       // 主題色/按鈕色
const PAPER = "#FFFFFF";      // 白色背景
const PAPER_DEEP = "#F5F5F5"; // 淺灰底色

// ============================================================
//   共用樣式
// ============================================================
const inputStyle = { 
  width: "100%", 
  padding: "10px 12px", 
  borderRadius: 3, 
  border: `1px solid ${LINE_C}`, 
  fontSize: 14 
};

// ============================================================
//   主要元件：地政士登錄表單
// ============================================================
export default function AgentRegistrationForm({ onSubmit }) {
  // 1. 表單資料狀態
  const [form, setForm] = useState({
    licenseNo: '',
    certNo: '',
    firmName: '',
    firmAddress: '',
    guildName: '',
    certPhoto: null,      // 照片預覽 URL
    certPhotoName: '',    // 照片檔名
    certPhotoFile: null,  // 實際檔案 (預留給未來傳 API 用)
    bio: ''
  });

  // 2. 照片上傳錯誤訊息狀態
  const [photoError, setPhotoError] = useState("");

  // 3. 表單驗證邏輯 (必填欄位都有值才算 valid)
  const valid = Boolean(
    form.licenseNo && 
    form.certNo && 
    form.firmName && 
    form.firmAddress && 
    form.guildName
  );

  // 4. 處理照片上傳與預覽
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 簡單的檔案類型與大小驗證
    if (!file.type.startsWith('image/')) {
      setPhotoError("請上傳圖片檔案 (jpg, png 等)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 限制 5MB
      setPhotoError("照片大小不能超過 5MB");
      return;
    }

    setPhotoError("");
    const previewUrl = URL.createObjectURL(file);

    setForm((prev) => ({
      ...prev,
      certPhotoFile: file,
      certPhoto: previewUrl,
      certPhotoName: file.name
    }));
  };

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", background: "#fff", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
      <div style={{ padding: 20 }}>
        <Field label="地政士開業執照字號">
          <input 
            value={form.licenseNo} 
            onChange={(e) => setForm((f) => ({ ...f, licenseNo: e.target.value }))} 
            placeholder="例如：xx年第xxxxxxx號" 
            style={inputStyle} 
          />
        </Field>

        <Field label="地政士證書字號">
          <input 
            value={form.certNo} 
            onChange={(e) => setForm((f) => ({ ...f, certNo: e.target.value }))} 
            placeholder="例如：xx年第xxxxxxx號" 
            style={inputStyle} 
          />
        </Field>

        <Field label="事務所名稱">
          <input 
            value={form.firmName} 
            onChange={(e) => setForm((f) => ({ ...f, firmName: e.target.value }))} 
            placeholder="例如：xx地政士事務所" 
            style={inputStyle} 
          />
        </Field>

        <Field label="事務所地址">
          <input 
            value={form.firmAddress} 
            onChange={(e) => setForm((f) => ({ ...f, firmAddress: e.target.value }))} 
            placeholder="例如：台北市xx區xx路xx號xx樓" 
            style={inputStyle} 
          />
        </Field>

        <Field label="加入公會名稱">
          <input 
            value={form.guildName} 
            onChange={(e) => setForm((f) => ({ ...f, guildName: e.target.value }))} 
            placeholder="例如：社團法人xx市地政士公會" 
            style={inputStyle} 
          />
        </Field>

        <Field label="上傳地政士證書照片（選填，可候補上傳）">
          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "20px 16px", borderRadius: 4, border: `1.5px dashed ${form.certPhoto ? GOOD : LINE_C}`,
            background: form.certPhoto ? "#EFF3ED" : "#fff", cursor: "pointer", fontSize: 13.5,
            color: form.certPhoto ? GOOD : INK_SOFT,
          }}>
            <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />
            {form.certPhoto ? (
              <><Check size={16} /> 已上傳：{form.certPhotoName}（點此重新選擇）</>
            ) : (
              <>點此選擇照片上傳</>
            )}
          </label>
          
          {form.certPhoto && (
            <img 
              src={form.certPhoto} 
              alt="地政士證書預覽" 
              style={{ marginTop: 10, maxWidth: "100%", maxHeight: 200, borderRadius: 4, border: `1px solid ${LINE_C}` }} 
            />
          )}
          
          {photoError && <div style={{ fontSize: 12, color: "red", marginTop: 6 }}>{photoError}</div>}
          
          <div style={{ fontSize: 11.5, color: "#B8AF96", marginTop: 6 }}>
            此欄位為選填，您可以先完成登錄，之後再回來補上傳。建議上傳地政士證書或執業執照照片，僅供平台管理者核對身分使用，不會公開顯示。以上資料將由平台管理者比對內政部地政士查詢系統後標記為「已查核」
          </div>
        </Field>

        <Field label="自我介紹（選填）">
          <textarea 
            value={form.bio} 
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} 
            placeholder="簡述執業經驗、專長領域" 
            rows={4} 
            style={{ ...inputStyle, resize: "vertical" }} 
          />
        </Field>

        <button 
          disabled={!valid} 
          onClick={() => onSubmit && onSubmit(form)} 
          style={{ 
            width: "100%", 
            padding: "12px 0", 
            borderRadius: 3, 
            border: "none", 
            fontSize: 14.5, 
            fontWeight: 700, 
            cursor: valid ? "pointer" : "not-allowed", 
            background: valid ? SEAL : LINE_C, 
            color: valid ? PAPER : "#9C9588", 
            marginTop: 8 
          }}
        >
          完成免費登錄，立即獲得點數
        </button>
      </div>
    </main>
  );
}

// ============================================================
//   子元件：Field (輸入框的外層包裝)
// ============================================================
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8, color: INK }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ============================================================
//   子元件：MultiSelectDropdown (多選下拉選單)
// ============================================================
export function MultiSelectDropdown({ options, selected, onChange, placeholder, style }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { 
      if (ref.current && !ref.current.contains(e.target)) setOpen(false); 
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  const label = selected.length === 0 ? placeholder : selected.length <= 2 ? selected.join("、") : `已選 ${selected.length} 項`;

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button 
        type="button" 
        onClick={() => setOpen((v) => !v)} 
        style={{ 
          width: "100%", padding: "11px 14px", borderRadius: 3, border: `1.5px solid ${INK}`, 
          background: "#fff", fontSize: 14, cursor: "pointer", display: "flex", 
          alignItems: "center", justifyContent: "space-between", gap: 8, 
          color: selected.length === 0 ? "#9C9588" : INK, textAlign: "left" 
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <ChevronDown size={16} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      
      {open && (
        <div style={{ 
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, 
          background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 4, 
          boxShadow: "0 14px 30px -10px rgba(31,36,32,0.25)", maxHeight: 260, overflowY: "auto" 
        }}>
          {selected.length > 0 && (
            <button 
              type="button" 
              onClick={() => onChange([])} 
              style={{ 
                width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 12.5, 
                color: SEAL, background: "none", border: "none", borderBottom: `1px solid ${PAPER_DEEP}`, cursor: "pointer" 
              }}
            >
              清空選擇
            </button>
          )}
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} style={{ 
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", 
                fontSize: 13.5, cursor: "pointer", background: checked ? "#FBF0EE" : "transparent" 
              }}>
                <span style={{ 
                  width: 16, height: 16, borderRadius: 3, flexShrink: 0, 
                  border: `1.5px solid ${checked ? SEAL : LINE_C}`, 
                  background: checked ? SEAL : "#fff", display: "flex", 
                  alignItems: "center", justifyContent: "center" 
                }}>
                  {checked && <Check size={11} color={PAPER} strokeWidth={3} />}
                </span>
                <input type="checkbox" checked={checked} onChange={() => toggle(opt)} style={{ display: "none" }} />
                {opt}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}