// @ts-nocheck
// 這個檔案原本是互動原型的示範程式碼，故未逐一補上 TypeScript 型別。
// 如需嚴謹型別檢查，建議之後為 agents/cases/transactions 補上 interface。
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Star, MessageCircle, Shield, Coins, ChevronLeft, Check, Clock,
  Lock, X, ChevronDown, AlertTriangle, Users, CheckCircle2, XCircle, Send,
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ============================================================
   桓宸地政媒合通 LandMatch — 地政士查找與案件媒合平台（互動原型 v2）
   核心機制：
   1. 民眾登錄基本資料 + 發出案件需求（公開案件池）
   2. 所有地政士可見案件摘要，各自可回覆（扣點），互看不到彼此內容
   3. 民眾可與單一地政士多輪對話，每輪地政士回覆都扣點
   4. 民眾選定後「發案」，地政士確認是/否，雙方同意才解鎖聯繫方式
   5. 留言/回覆偵測聯繫方式格式 → 警示 → 違規禁言 → 申請解除
   6. 地政士免費登錄送點數（實際後台贈送1點）
============================================================ */

const SEAL = "#A8342A";
const SEAL_SOFT = "#C75C4F";
const INK = "#1F2420";
const INK_SOFT = "#52584F";
const PAPER = "#F7F4EC";
const PAPER_DEEP = "#EFEAE0";
const SURVEY = "#4A5C5A";
const GOLD = "#C9A876";
const LINE_C = "#D8D2C2";
const GOOD = "#5B7355";
const WARN = "#B8862E";

const SERVICE_TAGS = [
  "所有權移轉過戶", "繼承登記", "銀行抵押權設定",
  "民間抵押權設定", "土地分割／合併", "實價登錄申報",
];

const TAIWAN_REGIONS = [
  "台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市",
  "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣",
  "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
  "台東縣", "澎湖縣", "金門縣", "連江縣",
];

const SEED_AGENTS = [
  { id: "agent-001", name: "林○○", contact: "0912-345-678（示範）", regions: ["桃園市", "新北市"], tags: ["繼承登記", "所有權移轉過戶"], verified: true, points: 6, bio: "執業15年，專長繼承登記與不動產過戶，案件量大但回覆迅速。", banned: false, licenseNo: "xx年第xxxxxxx號（示範）", certNo: "xx年第xxxxxxx號（示範）", firmName: "示範地政士事務所", firmAddress: "桃園市xx區xx路xx號xx樓（示範）", guildName: "社團法人xx市地政士公會（示範）" },
  { id: "agent-002", name: "陳○○", contact: "0923-456-789（示範）", regions: ["新北市"], tags: ["銀行抵押權設定", "民間抵押權設定"], verified: true, points: 1, bio: "專辦各類抵押權設定與塗銷，與多家銀行配合流程熟悉。", banned: false, licenseNo: "xx年第xxxxxxx號（示範）", certNo: "xx年第xxxxxxx號（示範）", firmName: "示範代書事務所", firmAddress: "新北市xx區xx路xx號xx樓（示範）", guildName: "社團法人xx市地政士公會（示範）" },
  { id: "agent-003", name: "黃○○", contact: "0934-567-890（示範）", regions: ["台中市"], tags: ["土地分割／合併", "實價登錄申報"], verified: true, points: 9, bio: "土地測量與分割合併案件經驗豐富，亦提供實價登錄申報諮詢。", banned: false, licenseNo: "xx年第xxxxxxx號（示範）", certNo: "xx年第xxxxxxx號（示範）", firmName: "示範土地登記事務所", firmAddress: "台中市xx區xx路xx號xx樓（示範）", guildName: "社團法人xx市地政士公會（示範）" },
];

function uid(p = "id") { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function maskName(name) {
  if (!name) return "匿名民眾";
  const n = name.trim();
  if (n.length <= 1) return n + "○";
  return n[0] + "○".repeat(Math.max(1, n.length - 1));
}

/* ---------- 聯繫方式偵測 ---------- */
const CN_DIGIT_MAP = { 零: "0", 〇: "0", 一: "1", 壹: "1", 溜: "1", 二: "2", 貳: "2", 三: "3", 參: "3", 叫: "3", 四: "4", 肆: "4", 五: "5", 伍: "5", 拐: "7", 六: "6", 陸: "6", 七: "7", 柒: "7", 八: "8", 捌: "8", 九: "9", 玖: "9" };
function normalizeChineseDigits(text) {
  return text.replace(/[零〇一壹溜二貳三參叫四肆五伍六陸七柒拐八捌九玖]/g, (ch) => CN_DIGIT_MAP[ch] || ch);
}

const CONTACT_PATTERNS = [
  /\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d/, // 任何形式間隔的8位以上連續數字（電話／含破折號或空白分隔）
  /09\d{2}/, // 台灣手機開頭 09xx
  /0[2-8][-\s]?\d{3,4}/, // 市話格式
  /line/i, // 只要出現line字樣就警示（含Line ID、Line:、加Line等各種寫法）
  /賴|賓|萊/, // 「賴」泛指Line的台式說法及常見同音規避字
  /加.{0,2}(賴|賓|萊|line|line)/i, // 「加賴」「加賓」「加我賴」等變體
  /微信|wechat|whatsapp|telegram|微信號/i,
  /\big\b|\binstagram\b/i,
  /臉書|facebook|fb\b/i,
  /電話|手機|聯絡方式|連絡方式|連絡我|聯絡我|加我|私訊|私我|找我/, // 即使沒寫出號碼，提到聯絡意圖也先警示，較保守但更安全
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/, // email
  /[a-zA-Z]{2,}[\d]{1,}|[\d]{1,}[a-zA-Z]{2,}/, // 任何英文字母與數字混合的字串（如 sin276dj、Q123、abc88），常見於帳號ID
  /[a-zA-Z]{5,}/, // 5個以上連續英文字母（純亂碼ID，如sssifje），無法判斷語意但統計上多為帳號代稱，先保守警示
];

function detectContact(text) {
  if (!text) return false;
  const normalized = normalizeChineseDigits(text);
  if (CONTACT_PATTERNS.some((re) => re.test(text))) return true;
  if (/\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d/.test(normalized)) return true; // 中文數字轉換後再檢查一次
  return false;
}

/* ---------- Supabase helpers ----------
   資料表結構（請在 Supabase 建立以下四張表，詳見對話說明中的 SQL）：
   - agents        (id text primary key, ...其餘欄位對應 SEED_AGENTS 的 key)
   - cases         (id text primary key, ...其餘欄位對應案件物件的 key，threads 為 jsonb)
   - transactions  (id text primary key, ...對應購買紀錄物件的 key)
   - visits        (date text primary key, customer int, agent int)
------------------------------------------------------------- */
function visitsArrayToObject(rows) {
  const obj = {};
  (rows || []).forEach((r) => {
    obj[r.date] = { customer: r.customer || 0, agent: r.agent || 0 };
  });
  return obj;
}

async function fetchAllData() {
  const [agentsRes, casesRes, txRes, visitsRes] = await Promise.all([
    supabase.from("agents").select("*"),
    supabase.from("cases").select("*"),
    supabase.from("transactions").select("*"),
    supabase.from("visits").select("*"),
  ]);

  if (agentsRes.error) console.error("讀取地政士資料失敗", agentsRes.error);
  if (casesRes.error) console.error("讀取案件資料失敗", casesRes.error);
  if (txRes.error) console.error("讀取購買紀錄失敗", txRes.error);
  if (visitsRes.error) console.error("讀取瀏覽量失敗", visitsRes.error);

  let agents = agentsRes.data || [];
  if (agents.length === 0 && !agentsRes.error) {
    // 資料庫還是空的：寫入示範地政士資料作為初始種子，讓平台一開始就有內容
    const { error: seedErr } = await supabase.from("agents").insert(SEED_AGENTS);
    if (seedErr) console.error("寫入示範地政士資料失敗", seedErr);
    agents = SEED_AGENTS;
  }

  return {
    agents,
    cases: casesRes.data || [],
    transactions: txRes.data || [],
    visits: visitsArrayToObject(visitsRes.data),
  };
}

/* ============================================================
   App Root
============================================================ */
export default function App() {
  const [view, setView] = useState({ name: "home" });
  const [agents, setAgents] = useState(null);
  const [cases, setCases] = useState(null); // 案件池
  const [transactions, setTransactions] = useState(null); // 點數購買記錄
  const [visits, setVisits] = useState(null); // 每日瀏覽量 { [dateStr]: { customer: n, agent: n } }
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [authUser, setAuthUser] = useState(null); // 目前登入的地政士（Supabase Auth 使用者）

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data.session?.user || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { agents: a, cases: c, transactions: tx, visits: v } = await fetchAllData();
        setAgents(a);
        setCases(c);
        setTransactions(tx);
        setVisits(v);
      } catch (e) {
        console.error("初始化資料失敗", e);
        setAgents(SEED_AGENTS);
        setCases([]);
        setTransactions([]);
        setVisits({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showToast = useCallback((msg, tone = "default") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const persistAgents = async (next) => {
    setAgents(next);
    const { error } = await supabase.from("agents").upsert(next, { onConflict: "id" });
    if (error) {
      console.error("persistAgents failed", error);
      showToast("資料儲存失敗，可能是證書照片累積過大或網路問題", "warn");
    }
  };
  const persistCases = async (next) => {
    setCases(next);
    const { error } = await supabase.from("cases").upsert(next, { onConflict: "id" });
    if (error) {
      console.error("persistCases failed", error);
      showToast("案件資料儲存失敗，請檢查網路連線", "warn");
    }
  };
  const persistTransactions = async (next) => {
    setTransactions(next);
    const newest = next[next.length - 1];
    if (newest) {
      const { error } = await supabase.from("transactions").insert([newest]);
      if (error) console.error("persistTransactions failed", error);
    }
  };
  const persistVisits = async (next) => {
    setVisits(next);
    const key = todayStr();
    const day = next[key] || { customer: 0, agent: 0 };
    const { error } = await supabase
      .from("visits")
      .upsert([{ date: key, customer: day.customer, agent: day.agent }], { onConflict: "date" });
    if (error) console.error("persistVisits failed", error);
  };

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const trackVisit = async (role) => {
    const key = todayStr();
    const day = visits[key] || { customer: 0, agent: 0 };
    const next = { ...visits, [key]: { ...day, [role]: (day[role] || 0) + 1 } };
    await persistVisits(next);
  };

  /* ---------- actions ---------- */
  const createCase = async (data) => {
    if (detectContact(data.problemText)) {
      showToast("偵測到案件說明中可能包含聯繫方式，請勿留下電話或Line，以免遭不法業者或詐騙集團利用", "warn");
      return null;
    }
    const newCase = {
      id: uid("case"),
      customerName: data.customerName.trim(),
      customerContact: data.customerContact.trim(),
      region: data.region,
      caseType: data.caseType,
      problemText: data.problemText.trim(),
      status: "open", // open | matched | closed
      matchedAgentId: null,
      threads: {}, // { [agentId]: { messages: [...], hasFirstReply: bool, banned: bool } }
      ts: Date.now(),
    };
    await persistCases([...cases, newCase]);
    showToast("案件已送出，地政士將開始回覆");
    return newCase.id;
  };

  const agentReply = async (caseId, agentId, text) => {
    if (detectContact(text)) {
      showToast("偵測到可能包含聯繫方式，請勿在留言中交換電話或Line，以免遭不法業者或詐騙集團利用", "warn");
      return false;
    }
    const agent = agents.find((a) => a.id === agentId);
    const hasUnlimited = agent?.unlimitedUntil && agent.unlimitedUntil > Date.now();
    if (!agent || (!hasUnlimited && agent.points <= 0)) {
      showToast("點數不足，請先購買點數");
      return false;
    }
    const target = cases.find((c) => c.id === caseId);
    if (!target) return false;
    const thread = target.threads[agentId] || { messages: [], hasFirstReply: false, banned: false };
    if (thread.banned) {
      showToast("此對話已被限制，請先提出申請解除");
      return false;
    }
    const newThread = {
      ...thread,
      hasFirstReply: true,
      messages: [...thread.messages, { from: "agent", text, ts: Date.now() }],
    };
    const nextCases = cases.map((c) =>
      c.id === caseId ? { ...c, threads: { ...c.threads, [agentId]: newThread } } : c
    );
    const nextAgents = agents.map((a) => (a.id === agentId ? { ...a, points: hasUnlimited ? a.points : a.points - 1 } : a));
    await persistCases(nextCases);
    await persistAgents(nextAgents);
    showToast("已回覆，扣除 1 點");
    return true;
  };

  const customerMessage = async (caseId, agentId, text) => {
    if (detectContact(text)) {
      showToast("偵測到可能包含聯繫方式，請勿在留言中交換電話或Line，以免遭不法業者或詐騙集團利用", "warn");
      return false;
    }
    const target = cases.find((c) => c.id === caseId);
    if (!target) return false;
    const thread = target.threads[agentId] || { messages: [], hasFirstReply: false, banned: false };
    if (thread.banned) {
      showToast("此對話已被限制，請先提出申請解除");
      return false;
    }
    const newThread = { ...thread, messages: [...thread.messages, { from: "customer", text, ts: Date.now() }] };
    const nextCases = cases.map((c) =>
      c.id === caseId ? { ...c, threads: { ...c.threads, [agentId]: newThread } } : c
    );
    await persistCases(nextCases);
    return true;
  };

  const banThread = async (caseId, agentId) => {
    const nextCases = cases.map((c) => {
      if (c.id !== caseId) return c;
      const thread = c.threads[agentId];
      if (!thread) return c;
      return { ...c, threads: { ...c.threads, [agentId]: { ...thread, banned: true } } };
    });
    await persistCases(nextCases);
    showToast("已偵測到聯繫方式，該對話已被限制，需提出申請才能恢復", "warn");
  };

  const adminDeleteMessage = async (caseId, agentId, msgIndex) => {
    const nextCases = cases.map((c) => {
      if (c.id !== caseId) return c;
      const thread = c.threads[agentId];
      if (!thread) return c;
      const messages = thread.messages.filter((_, i) => i !== msgIndex);
      return { ...c, threads: { ...c.threads, [agentId]: { ...thread, messages } } };
    });
    await persistCases(nextCases);
    showToast("已刪除該則留言");
  };

  const adminForceBanThread = async (caseId, agentId) => {
    const nextCases = cases.map((c) => {
      if (c.id !== caseId) return c;
      const thread = c.threads[agentId] || { messages: [], hasFirstReply: false, banned: false };
      return { ...c, threads: { ...c.threads, [agentId]: { ...thread, banned: true } } };
    });
    await persistCases(nextCases);
    showToast("已將此對話設為禁言狀態");
  };

  const adminUnbanThread = async (caseId, agentId) => {
    const nextCases = cases.map((c) => {
      if (c.id !== caseId) return c;
      const thread = c.threads[agentId];
      if (!thread) return c;
      return { ...c, threads: { ...c.threads, [agentId]: { ...thread, banned: false } } };
    });
    await persistCases(nextCases);
    showToast("已解除此對話的禁言");
  };

  const requestUnban = async (caseId, agentId) => {
    const nextCases = cases.map((c) => {
      if (c.id !== caseId) return c;
      const thread = c.threads[agentId];
      if (!thread) return c;
      return { ...c, threads: { ...c.threads, [agentId]: { ...thread, banned: false, unbanRequested: true } } };
    });
    await persistCases(nextCases);
    showToast("已提交申請並承諾不再留聯繫方式，對話已恢復（示範流程：自動核准）");
  };

  const proposeMatch = async (caseId, agentId) => {
    const nextCases = cases.map((c) =>
      c.id === caseId ? { ...c, status: "pending_match", matchedAgentId: agentId } : c
    );
    await persistCases(nextCases);
    showToast("已送出發案邀請，等待地政士確認");
  };

  const respondMatch = async (caseId, accept) => {
    const target = cases.find((c) => c.id === caseId);
    if (!target) return;
    if (accept) {
      const nextCases = cases.map((c) => (c.id === caseId ? { ...c, status: "matched" } : c));
      await persistCases(nextCases);
      showToast("已確認接案，雙方聯繫方式已解鎖");
    } else {
      const nextCases = cases.map((c) => (c.id === caseId ? { ...c, status: "open", matchedAgentId: null, declinedAgentIds: [...(c.declinedAgentIds || []), c.matchedAgentId] } : c));
      await persistCases(nextCases);
      showToast("已回覆無法承接，民眾將收到通知並可改選其他地政士", "warn");
    }
  };

  const buyPoints = async (agentId, plan) => {
    const isUnlimited = plan.points === "unlimited";
    const expiresAt = isUnlimited ? Date.now() + 30 * 24 * 60 * 60 * 1000 : null;
    const nextAgents = agents.map((a) => {
      if (a.id !== agentId) return a;
      if (isUnlimited) return { ...a, unlimitedUntil: expiresAt };
      return { ...a, points: a.points + plan.points };
    });
    await persistAgents(nextAgents);
    const tx = {
      id: uid("tx"), agentId, label: plan.label, points: plan.points, price: plan.price, ts: Date.now(),
    };
    await persistTransactions([...(transactions || []), tx]);
    showToast(isUnlimited ? "已核對入帳，啟用本月不限量回覆（示範流程）" : `已核對入帳，加值 ${plan.points} 點（示範流程）`);
  };

  const registerAgent = async (data) => {
    const { email, password, ...profile } = data;
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (authErr) {
      showToast(`註冊失敗：${authErr.message}`, "warn");
      return null;
    }
    const userId = authData.user?.id || null;
    const agent = { id: uid("agent"), points: 1, verified: false, banned: false, joinedAt: Date.now(), userId, email: email.trim(), ...profile };
    await persistAgents([...agents, agent]);
    if (authData.session) {
      // 專案若關閉了「需驗證信箱」，這裡會直接拿到 session，可以馬上登入
      setAuthUser(authData.user);
      showToast("登錄成功！已贈送回覆點數");
    } else {
      showToast("登錄成功！請先至您的信箱完成驗證後再登入地政士後台");
    }
    return agent.id;
  };

  const loginAgent = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      return error.message;
    }
    setAuthUser(data.user);
    return null;
  };

  const logoutAgent = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
  };

  const toggleVerified = async (agentId) => {
    const nextAgents = agents.map((a) => (a.id === agentId ? { ...a, verified: !a.verified } : a));
    await persistAgents(nextAgents);
    const a = nextAgents.find((x) => x.id === agentId);
    showToast(a.verified ? `已將 ${a.name} 標記為已查核` : `已取消 ${a.name} 的查核標記`);
  };

  const deleteAgent = async (agentId) => {
    const target = agents.find((a) => a.id === agentId);
    const { error } = await supabase.from("agents").delete().eq("id", agentId);
    if (error) {
      console.error("deleteAgent failed", error);
      showToast("刪除失敗，請檢查網路連線", "warn");
      return;
    }
    setAgents(agents.filter((a) => a.id !== agentId));
    showToast(`已刪除 ${target?.name || "該地政士"} 的資料`, "warn");
  };

  const updateAgentProfile = async (agentId, updates) => {
    const before = agents.find((a) => a.id === agentId);
    const significantFieldsChanged = before && (
      before.licenseNo !== updates.licenseNo || before.certNo !== updates.certNo ||
      before.firmName !== updates.firmName || before.firmAddress !== updates.firmAddress ||
      before.guildName !== updates.guildName || before.certPhoto !== updates.certPhoto
    );
    const nextAgents = agents.map((a) =>
      a.id === agentId ? { ...a, ...updates, verified: significantFieldsChanged ? false : a.verified } : a
    );
    await persistAgents(nextAgents);
    showToast(significantFieldsChanged ? "資料已更新，查核狀態已重置，請等待平台重新核對" : "資料已更新");
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans TC', sans-serif", color: INK_SOFT }}>載入中…</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "'Noto Sans TC', sans-serif", color: INK }}>
      <GlobalStyle />
      <TopBar setView={setView} />
      {toast && <Toast info={toast} />}

      {view.name === "admin" && (
        adminAuthed ? (
          <AdminDashboardView
            agents={agents}
            cases={cases}
            transactions={transactions || []}
            visits={visits || {}}
            onBack={() => setView({ name: "home" })}
            onDeleteMessage={adminDeleteMessage}
            onForceBan={adminForceBanThread}
            onUnban={adminUnbanThread}
            onLogout={() => { setAdminAuthed(false); setView({ name: "home" }); }}
            onToggleVerified={toggleVerified}
            onDeleteAgent={deleteAgent}
          />
        ) : (
          <AdminLoginView
            onBack={() => setView({ name: "home" })}
            onLogin={(u, p) => {
              if (u === "deardanny" && p === "dear010105130922") {
                setAdminAuthed(true);
                return true;
              }
              return false;
            }}
          />
        )
      )}
      {view.name === "home" && (
        <HomeView agents={agents} cases={cases} setView={setView} onMount={() => trackVisit("customer")} />
      )}
      {view.name === "post-case" && (
        <PostCaseView
          onBack={() => setView({ name: "home" })}
          onSubmit={async (data) => {
            const id = await createCase(data);
            if (id) setView({ name: "case", id, role: "customer" });
          }}
        />
      )}
      {view.name === "my-cases" && (
        <MyCasesView
          cases={cases}
          onBack={() => setView({ name: "home" })}
          onOpenCase={(id) => setView({ name: "case", id, role: "customer" })}
        />
      )}
      {view.name === "case" && (
        <CaseDetailView
          theCase={cases.find((c) => c.id === view.id)}
          agents={agents}
          onBack={() => setView({ name: "home" })}
          onCustomerMessage={customerMessage}
          onProposeMatch={proposeMatch}
          onRespondMatch={respondMatch}
          onRequestUnban={requestUnban}
          viewerRole={view.role || "visitor"}
        />
      )}
      {view.name === "agent-console" && (
        authUser ? (
          <AgentConsoleView
            agents={agents}
            cases={cases}
            authUser={authUser}
            onBack={() => setView({ name: "home" })}
            onLogout={async () => { await logoutAgent(); setView({ name: "home" }); }}
            onAgentReply={agentReply}
            onBanThread={banThread}
            onRequestUnban={requestUnban}
            onRespondMatch={respondMatch}
            onBuyPoints={buyPoints}
            onMount={() => trackVisit("agent")}
            onUpdateProfile={updateAgentProfile}
          />
        ) : (
          <AgentAuthView
            onBack={() => setView({ name: "home" })}
            onLogin={loginAgent}
            onGoRegister={() => setView({ name: "join" })}
          />
        )
      )}
      {view.name === "join" && (
        <JoinView
          onBack={() => setView({ name: "home" })}
          onSubmit={async (data) => {
            const id = await registerAgent(data);
            if (id) setView({ name: "agent-console", focusAgentId: id });
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Global style
============================================================ */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; }
      .serif { font-family: 'Noto Serif TC', serif; }
      .mono { font-family: 'JetBrains Mono', monospace; }
      button { font-family: inherit; }
      input, select, textarea { font-family: inherit; }
      ::placeholder { color: #9C9588; }
      @media (max-width: 520px) { .brand-subtitle { display: none; } }
    `}</style>
  );
}

function Toast({ info }) {
  const { msg, tone } = info;
  const bg = tone === "warn" ? WARN : INK;
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: bg, color: PAPER, padding: "12px 22px", borderRadius: 4, fontSize: 13.5, zIndex: 200, boxShadow: "0 12px 30px -10px rgba(0,0,0,0.4)", maxWidth: "90vw", textAlign: "center", display: "flex", alignItems: "center", gap: 8 }}>
      {tone === "warn" && <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
      {msg}
    </div>
  );
}

/* ============================================================
   Brand Mark（房屋圖示融合印章紅，呼應「桓宸地政媒合通」）
============================================================ */
function BrandMark({ size = 42 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="42" height="42" rx="10" fill={PAPER_DEEP} stroke={LINE_C} strokeWidth="1" />
      <path d="M22 8 L35 19 H31.5 V33 H12.5 V19 H9 Z" fill={SEAL} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="16.5" y="20.5" width="11" height="12.5" rx="1.5" fill={GOLD} stroke={INK} strokeWidth="1.2" />
      <rect x="19.7" y="25.5" width="4.6" height="7.5" rx="1" fill={PAPER} stroke={INK} strokeWidth="1" />
      <circle cx="18.7" cy="16.3" r="1.7" fill={SURVEY} />
    </svg>
  );
}

/* ============================================================
   Top Bar
============================================================ */
function TopBar({ setView }) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(247,244,236,0.92)", backdropFilter: "blur(6px)", borderBottom: `1px solid ${LINE_C}` }}>
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button onClick={() => setView({ name: "home" })} style={{ display: "flex", alignItems: "center", gap: 16, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <BrandMark size={68} />
          <div style={{ textAlign: "left", lineHeight: 1.15 }}>
            <div className="serif" style={{ fontWeight: 900, fontSize: 32, color: INK, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>桓宸地政媒合通</div>
            <div className="brand-subtitle mono" style={{ fontSize: 14, color: SURVEY, letterSpacing: "0.1em", marginTop: 4, whiteSpace: "nowrap" }}>
              LandMatch <span style={{ color: LINE_C }}>|</span> <span style={{ color: SEAL }}>全台地政士媒合平台</span>
            </div>
          </div>
        </button>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <button onClick={() => setView({ name: "post-case" })} style={{ padding: "9px 14px", borderRadius: 3, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${SEAL}`, background: SEAL, color: PAPER, whiteSpace: "nowrap" }}>民眾免費發出案件需求找地政士</button>
          <button onClick={() => setView({ name: "my-cases" })} style={{ padding: "9px 14px", borderRadius: 3, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${GOOD}`, background: "transparent", color: GOOD, whiteSpace: "nowrap" }}>民眾查詢我的案件</button>
          <button onClick={() => setView({ name: "agent-console" })} style={{ padding: "9px 14px", borderRadius: 3, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${SURVEY}`, background: "transparent", color: SURVEY, whiteSpace: "nowrap" }}>地政士登錄後台</button>
          <button onClick={() => setView({ name: "join" })} style={{ padding: "9px 14px", borderRadius: 3, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${SEAL}`, background: SEAL, color: PAPER, whiteSpace: "nowrap" }}>地政士免費註冊送點數</button>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   Home View
============================================================ */
function HomeView({ agents, cases, setView, onMount }) {
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; onMount && onMount(); }
  }, []);
  const openCases = cases.filter((c) => c.status !== "matched").slice().reverse();

  return (
    <main>
      <section style={{ maxWidth: 1140, margin: "0 auto", padding: "48px 20px 40px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, letterSpacing: "0.1em", color: SURVEY, border: `1px solid ${SURVEY}`, borderRadius: 99, padding: "5px 14px", marginBottom: 20 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOOD, display: "inline-block" }} />
          全台地政士（代書）公開查找 · 免費使用
        </div>
        <h1 className="serif" style={{ fontWeight: 900, fontSize: "clamp(26px, 5vw, 40px)", lineHeight: 1.35, margin: "0 0 16px" }}>
          辦過戶、報稅、繼承登記，銀行／民間抵押設定，<br />
          先看看<span style={{ color: SEAL }}>真實的人</span>怎麼說。
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.85, color: INK_SOFT, maxWidth: 540, margin: "0 0 14px" }}>
          發出您的案件需求，多位地政士會主動回覆，您可以比較評價與回覆內容後再決定要委託給誰。
        </p>
        <div style={{ fontSize: 13, color: GOOD, background: "#EFF3ED", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, marginBottom: 28 }}>
          <Coins size={14} /> 地政士免費登錄，立即贈送點數作為回覆額度
        </div>
      </section>

      <section style={{ maxWidth: 1140, margin: "0 auto", padding: "10px 20px 50px" }}>
        <div style={{ fontSize: 13, letterSpacing: "0.1em", color: SEAL, fontWeight: 900, marginBottom: 10 }}>全台服務範圍</div>
        <h2 className="serif" style={{ fontWeight: 900, fontSize: 24, margin: "0 0 6px" }}>全台縣市媒合狀態</h2>
        <p style={{ fontSize: 13, color: INK_SOFT, margin: "0 0 22px" }}>
          民眾可於全台免費發布需求；已有在地地政士的縣市可優先媒合，其餘縣市持續招募專業地政士加入。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {TAIWAN_REGIONS.map((region) => {
            const count = agents.filter((a) => (a.regions || []).includes(region)).length;
            const hasAgent = count > 0;
            return (
              <div key={region} style={{ background: hasAgent ? "#EFF3ED" : PAPER, border: `1px solid ${hasAgent ? GOOD : LINE_C}`, borderRadius: 6, padding: "16px 18px" }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 8 }}>📍 {region}</div>
                {hasAgent ? (
                  <div style={{ fontSize: 12.5, color: GOOD, display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle2 size={14} /> 已有 {count} 位地政士
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: WARN, display: "flex", alignItems: "center", gap: 5 }}>
                    📣 招募在地地政士中
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {(() => {
        const recommended = agents.filter((a) => a.verified).sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 3);
        if (recommended.length === 0) return null;
        return (
          <section style={{ maxWidth: 1140, margin: "0 auto", padding: "10px 20px 50px" }}>
            <div style={{ fontSize: 13, letterSpacing: "0.1em", color: SEAL, fontWeight: 900, marginBottom: 10 }}>精選推薦</div>
            <h2 className="serif" style={{ fontWeight: 900, fontSize: 24, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 8 }}>
              <Star size={22} color={GOLD} fill={GOLD} /> 推薦地政士
            </h2>
            <p style={{ fontSize: 13, color: INK_SOFT, margin: "0 0 22px" }}>
              為保障雙方隱私，聯絡方式將於媒合成功後提供。以下星等與完成案件數為示範資料，正式上線後將改為真實媒合評價。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {recommended.map((a) => (
                <div key={a.id} style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 20 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: GOOD, border: `1px solid ${GOOD}`, borderRadius: 99, padding: "3px 10px", marginBottom: 12 }}>
                    <Shield size={11} /> 認證地政士
                  </span>
                  <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 4 }}>{a.name} 地政士</div>
                  <div style={{ fontSize: 12.5, color: INK_SOFT, marginBottom: 10 }}>📍 {(a.regions || []).join("、")}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
                    {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={15} color={GOLD} fill={GOLD} />)}
                    <span style={{ fontSize: 12.5, color: INK_SOFT, marginLeft: 4 }}>5.0 分（示範）</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: INK_SOFT, marginBottom: 4 }}>專長：{(a.tags || []).join("、") || "—"}</div>
                  <div style={{ fontSize: 12.5, color: INK_SOFT, marginBottom: 16 }}>完成案件：128 件（示範）</div>
                  <button
                    onClick={() => setView({ name: "post-case" })}
                    style={{ width: "100%", padding: "10px 0", borderRadius: 3, border: "none", background: SEAL, color: PAPER, fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    🤝 透過平台媒合
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      <section style={{ maxWidth: 1140, margin: "0 auto", padding: "10px 20px 50px" }}>
        <div style={{ fontSize: 13, letterSpacing: "0.1em", color: SEAL, fontWeight: 900, marginBottom: 10 }}>運作方式</div>
        <h2 className="serif" style={{ fontWeight: 900, fontSize: 24, margin: "0 0 24px" }}>公開發案，多位地政士主動回覆</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1, background: LINE_C, border: `1px solid ${LINE_C}` }}>
          {[
            ["STEP 01", "發出案件需求", "填寫基本資料與案件問題，您的聯繫方式只有平台與您自己看得到，不會公開。"],
            ["STEP 02", "多位地政士主動回覆", "案件公開後，地政士可各自回覆（使用點數），地政士之間互不可見彼此回覆內容，僅顯示有幾位在回覆中。"],
            ["STEP 03", "比較後發案，雙方確認", "選定一位地政士後點擊「發案」，雙方都確認後才解鎖真實聯繫方式，正式接洽。"],
          ].map(([tag, title, desc]) => (
            <div key={tag} style={{ background: PAPER, padding: "24px 20px" }}>
              <div className="mono" style={{ fontSize: 12, color: SURVEY, marginBottom: 10 }}>{tag}</div>
              <h3 style={{ fontSize: 15.5, margin: "0 0 8px", fontWeight: 700 }}>{title}</h3>
              <p style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.7, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1140, margin: "0 auto", padding: "10px 20px 50px" }}>
        <div style={{ fontSize: 13, letterSpacing: "0.1em", color: SEAL, fontWeight: 900, marginBottom: 10 }}>公開案件池</div>
        <h2 className="serif" style={{ fontWeight: 900, fontSize: 24, margin: "0 0 6px" }}>目前的案件需求</h2>
        <p style={{ fontSize: 13, color: INK_SOFT, margin: "0 0 22px" }}>地政士可點選任一案件查看詳情並回覆。民眾真實聯繫方式不會顯示。</p>

        {openCases.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: INK_SOFT, fontSize: 14, border: `1px dashed ${LINE_C}`, borderRadius: 6 }}>
            目前還沒有案件需求，發出第一筆需求看看吧。
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {openCases.map((c) => (
            <CaseCard key={c.id} theCase={c} onClick={() => setView({ name: "case", id: c.id })} />
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1140, margin: "0 auto", padding: "10px 20px 60px" }}>
        <div style={{ background: PAPER_DEEP, borderRadius: 6, padding: "28px 26px", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ fontFamily: "'Noto Serif TC',serif", fontWeight: 900, fontSize: 13, color: SEAL, border: `2px solid ${SEAL}`, borderRadius: 4, padding: "8px 7px", lineHeight: 1.4, writingMode: "vertical-rl", letterSpacing: "0.15em", flexShrink: 0 }}>公開透明</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.85, color: INK_SOFT }}>
            <strong style={{ color: INK }}>桓宸地政媒合通不經手交易、不抽取服務佣金。</strong>
            為保護雙方安全，留言中禁止交換電話或Line等聯繫方式，以免遭不法業者或詐騙集團利用。真實聯繫方式僅在雙方確認發案後才會解鎖。
          </p>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${LINE_C}`, padding: "26px 20px", textAlign: "center", color: INK_SOFT, fontSize: 12 }}>
        © 2026 桓宸地政媒合通 LandMatch · 本平台僅提供地政士／代書資訊查找與案件媒合功能，不參與居間仲介或代理收付款項。
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setView({ name: "admin" })} style={{ background: "none", border: "none", color: "#D8D2C2", fontSize: 10, cursor: "pointer", padding: 0 }}>
            營運管理
          </button>
        </div>
      </footer>
    </main>
  );
}

function statusBadge(theCase) {
  if (theCase.status === "matched") return { text: "已成功媒合", color: GOOD };
  if (theCase.status === "pending_match") return { text: "等待地政士確認", color: WARN };
  return { text: "公開徵求回覆中", color: SURVEY };
}

function CaseCard({ theCase, onClick }) {
  const replyCount = Object.values(theCase.threads || {}).filter((t) => t.hasFirstReply).length;
  const badge = statusBadge(theCase);
  return (
    <div onClick={onClick} style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 5, padding: 18, cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{maskName(theCase.customerName)}</div>
          <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>{theCase.region} · {theCase.caseType}</div>
        </div>
        <span style={{ fontSize: 10.5, color: badge.color, border: `1px solid ${badge.color}`, borderRadius: 99, padding: "3px 8px", whiteSpace: "nowrap" }}>{badge.text}</span>
      </div>
      <p style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.6, margin: "0 0 12px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {theCase.problemText}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: `1px solid ${PAPER_DEEP}`, fontSize: 12, color: INK_SOFT }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Users size={13} /> {replyCount} 位地政士回覆中</span>
        <span style={{ color: SEAL, fontWeight: 700 }}>查看詳情 →</span>
      </div>
    </div>
  );
}

function AgentAuthView({ onBack, onLogin, onGoRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setError("");
    setLoading(true);
    const errMsg = await onLogin(email, password);
    setLoading(false);
    if (errMsg) setError("登入失敗：帳號、密碼錯誤，或尚未完成信箱驗證");
  };

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "60px 20px 80px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 14, marginBottom: 24, padding: 0 }}>
        <ChevronLeft size={16} /> 返回首頁
      </button>

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <Lock size={28} color={SEAL} style={{ marginBottom: 10 }} />
        <h1 className="serif" style={{ fontWeight: 900, fontSize: 20, margin: 0 }}>地政士登入</h1>
        <p style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 8 }}>登入後只會看到您自己的案件回覆與點數資料</p>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 24 }}>
        <Field label="註冊時使用的 Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} autoFocus />
        </Field>
        <Field label="密碼">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
        </Field>
        {error && <div style={{ fontSize: 12.5, color: SEAL, marginBottom: 12 }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{ width: "100%", padding: "11px 0", borderRadius: 3, border: "none", background: SEAL, color: PAPER, fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "登入中…" : "登入"}
        </button>
        <div style={{ textAlign: "center", marginTop: 14, fontSize: 12.5, color: INK_SOFT }}>
          還沒有帳號？
          <button onClick={onGoRegister} style={{ background: "none", border: "none", color: SEAL, fontWeight: 700, cursor: "pointer", padding: 0, marginLeft: 4 }}>
            免費登錄成為地政士
          </button>
        </div>
      </div>
    </main>
  );
}

function AdminLoginView({ onBack, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const ok = onLogin(username.trim(), password);
    if (!ok) setError("帳號或密碼錯誤，請重新輸入");
  };

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "60px 20px 80px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 14, marginBottom: 24, padding: 0 }}>
        <ChevronLeft size={16} /> 返回首頁
      </button>

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <Lock size={28} color={SEAL} style={{ marginBottom: 10 }} />
        <h1 className="serif" style={{ fontWeight: 900, fontSize: 20, margin: 0 }}>營運管理者登入</h1>
        <p style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 8 }}>此頁面僅供平台管理者使用</p>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 24 }}>
        <Field label="帳號">
          <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} autoFocus />
        </Field>
        <Field label="密碼">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
        </Field>
        {error && <div style={{ fontSize: 12.5, color: SEAL, marginBottom: 12 }}>{error}</div>}
        <button onClick={submit} style={{ width: "100%", padding: "11px 0", borderRadius: 3, border: "none", background: SEAL, color: PAPER, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          登入
        </button>
      </div>
    </main>
  );
}

function AgentVerifyCard({ agent: a, onToggleVerified, onDeleteAgent }) {
  const [showPhoto, setShowPhoto] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div style={{ background: "#fff", border: `1.5px solid ${a.verified ? GOOD : LINE_C}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <div>
          <strong style={{ fontSize: 14 }}>{a.name} 地政士</strong>
          <span style={{ fontSize: 12.5, color: INK_SOFT, marginLeft: 8 }}>{a.contact || "（未填寫）"}</span>
          {a.email && <span style={{ fontSize: 11.5, color: "#B8AF96", marginLeft: 8 }}>· {a.email}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => onToggleVerified(a.id)}
            style={{ fontSize: 10.5, color: a.verified ? GOOD : WARN, border: `1px solid ${a.verified ? GOOD : WARN}`, borderRadius: 99, padding: "5px 12px", background: "none", cursor: "pointer", fontWeight: 700 }}
          >
            {a.verified ? "✓ 已查核（點此取消）" : "標記為已查核"}
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            style={{ fontSize: 10.5, color: SEAL, border: `1px solid ${SEAL}`, borderRadius: 99, padding: "5px 12px", background: "none", cursor: "pointer", fontWeight: 700 }}
          >
            刪除此地政士
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div style={{ background: "#FCEDEB", border: `1px solid ${SEAL}`, borderRadius: 4, padding: "10px 12px", marginBottom: 10, fontSize: 12.5, color: SEAL, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 160 }}>確定要刪除 {a.name} 地政士嗎？此動作無法復原，會移除其個人資料與回覆紀錄，但不會刪除他的登入帳號本身。</span>
          <button onClick={() => { onDeleteAgent(a.id); setConfirmingDelete(false); }} style={{ padding: "5px 12px", borderRadius: 3, border: "none", background: SEAL, color: PAPER, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            確定刪除
          </button>
          <button onClick={() => setConfirmingDelete(false)} style={{ padding: "5px 12px", borderRadius: 3, border: `1px solid ${LINE_C}`, background: "#fff", color: INK_SOFT, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            取消
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 4, fontSize: 12.5, marginBottom: 10 }}>
        <InfoRow label="執照字號" value={a.licenseNo} />
        <InfoRow label="證書字號" value={a.certNo} />
        <InfoRow label="事務所名稱" value={a.firmName} />
        <InfoRow label="事務所地址" value={a.firmAddress} />
        <InfoRow label="加入公會" value={a.guildName} />
        <InfoRow label="服務地區" value={(a.regions || []).join("、")} />
      </div>

      {a.certPhoto ? (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setShowPhoto((v) => !v)}
            style={{ fontSize: 12, color: SEAL, background: "none", border: `1px solid ${SEAL}`, borderRadius: 3, padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Shield size={13} /> {showPhoto ? "收合證書照片" : "查看上傳的證書照片"}
          </button>
          {showPhoto && (
            <img src={a.certPhoto} alt="地政士證書" style={{ marginTop: 10, maxWidth: "100%", maxHeight: 320, borderRadius: 4, border: `1px solid ${LINE_C}`, display: "block" }} />
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: WARN, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
          <AlertTriangle size={12} /> 此地政士尚未上傳證書照片（示範種子資料）
        </div>
      )}

      <div style={{ fontSize: 11, color: "#B8AF96" }} className="mono">
        {a.joinedAt ? new Date(a.joinedAt).toLocaleString("zh-TW") : "（示範種子資料）"} · {a.unlimitedUntil && a.unlimitedUntil > Date.now() ? "月費中" : `${a.points} 點`}
      </div>
    </div>
  );
}

function AdminDashboardView({ agents, cases, transactions, visits, onBack, onDeleteMessage, onForceBan, onUnban, onLogout, onToggleVerified, onDeleteAgent }) {
  const [tab, setTab] = useState("overview"); // overview | messages
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayKeys = Object.keys(visits).sort().reverse();

  const todayNewAgents = agents.filter((a) => a.joinedAt && new Date(a.joinedAt).toISOString().slice(0, 10) === todayStr);
  const todayNewCases = cases.filter((c) => new Date(c.ts).toISOString().slice(0, 10) === todayStr);
  const todayTx = transactions.filter((t) => new Date(t.ts).toISOString().slice(0, 10) === todayStr);
  const totalRevenue = transactions.reduce((s, t) => s + (t.price || 0), 0);

  // 攤平所有留言，供留言管理頁使用
  const allMessages = [];
  cases.forEach((c) => {
    Object.entries(c.threads || {}).forEach(([agentId, thread]) => {
      (thread.messages || []).forEach((m, idx) => {
        allMessages.push({
          caseId: c.id, agentId, msgIndex: idx, ...m,
          threadBanned: thread.banned,
          customerName: c.customerName, region: c.region, caseType: c.caseType,
          agentName: agents.find((a) => a.id === agentId)?.name || "（未知）",
          flagged: detectContact(m.text),
        });
      });
    });
  });
  const flaggedMessages = allMessages.filter((m) => m.flagged).sort((a, b) => b.ts - a.ts);
  const allMessagesSorted = [...allMessages].sort((a, b) => b.ts - a.ts);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 14, padding: 0 }}>
          <ChevronLeft size={16} /> 返回首頁
        </button>
        <button onClick={onLogout} style={{ fontSize: 12.5, color: INK_SOFT, background: "none", border: `1px solid ${LINE_C}`, borderRadius: 99, padding: "5px 12px", cursor: "pointer" }}>
          登出
        </button>
      </div>

      <h1 className="serif" style={{ fontWeight: 900, fontSize: 22, margin: "0 0 6px" }}>營運儀表板</h1>
      <p style={{ fontSize: 13, color: INK_SOFT, margin: "0 0 20px" }}>僅平台管理者可見，此頁面之路徑不會出現在一般導覽列。</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <TabButtonAdmin active={tab === "overview"} onClick={() => setTab("overview")}>數據總覽</TabButtonAdmin>
        <TabButtonAdmin active={tab === "messages"} onClick={() => setTab("messages")}>
          留言管理{flaggedMessages.length > 0 && (
            <span style={{ marginLeft: 6, background: SEAL, color: PAPER, borderRadius: 99, padding: "1px 7px", fontSize: 11 }}>{flaggedMessages.length}</span>
          )}
        </TabButtonAdmin>
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
            <StatBox label="今日民眾瀏覽" value={visits[todayStr]?.customer || 0} />
            <StatBox label="今日地政士瀏覽" value={visits[todayStr]?.agent || 0} />
            <StatBox label="今日新增地政士" value={todayNewAgents.length} />
            <StatBox label="今日新案件數" value={todayNewCases.length} />
            <StatBox label="今日點數購買筆數" value={todayTx.length} />
            <StatBox label="累積總營收" value={`NT$${totalRevenue}`} />
          </div>

          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>每日瀏覽量</h3>
          <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, overflow: "hidden", marginBottom: 28 }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: PAPER_DEEP, textAlign: "left" }}>
                  <th style={thStyle}>日期</th><th style={thStyle}>民眾瀏覽</th><th style={thStyle}>地政士瀏覽</th>
                </tr>
              </thead>
              <tbody>
                {dayKeys.length === 0 && <tr><td colSpan={3} style={{ padding: 16, textAlign: "center", color: INK_SOFT }}>尚無資料</td></tr>}
                {dayKeys.map((d) => (
                  <tr key={d} style={{ borderTop: `1px solid ${PAPER_DEEP}` }}>
                    <td style={tdStyle} className="mono">{d}</td>
                    <td style={tdStyle}>{visits[d].customer || 0}</td>
                    <td style={tdStyle}>{visits[d].agent || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>地政士加入紀錄</h3>
          <p style={{ fontSize: 12, color: INK_SOFT, margin: "0 0 14px" }}>請至內政部地政士查詢系統人工核對下列資料是否屬實：<a href="https://resim.moi.gov.tw/Home/AgentIndex" target="_blank" rel="noopener noreferrer" style={{ color: SEAL }}>resim.moi.gov.tw</a></p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
            {agents.length === 0 && <div style={{ padding: 16, textAlign: "center", color: INK_SOFT, background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6 }}>尚無資料</div>}
            {[...agents].sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0)).map((a) => (
              <AgentVerifyCard key={a.id} agent={a} onToggleVerified={onToggleVerified} onDeleteAgent={onDeleteAgent} />
            ))}
          </div>

          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>民眾發案紀錄</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
            {cases.length === 0 && <div style={{ padding: 16, textAlign: "center", color: INK_SOFT, background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6 }}>尚無資料</div>}
            {[...cases].sort((a, b) => b.ts - a.ts).map((c) => (
              <div key={c.id} style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                  <div style={{ fontSize: 13.5 }}>
                    <strong>{c.customerName}</strong>
                    <span style={{ color: INK_SOFT }}> · {c.customerContact} · {c.region} · {c.caseType}</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: statusBadge(c).color, border: `1px solid ${statusBadge(c).color}`, borderRadius: 99, padding: "3px 8px", whiteSpace: "nowrap" }}>{statusBadge(c).text}</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: INK, margin: "0 0 6px", background: PAPER_DEEP, padding: "10px 12px", borderRadius: 4 }}>{c.problemText}</p>
                <div className="mono" style={{ fontSize: 11, color: "#B8AF96" }}>{new Date(c.ts).toLocaleString("zh-TW")}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>點數／月費購買記錄</h3>
          <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: PAPER_DEEP, textAlign: "left" }}>
                  <th style={thStyle}>購買時間</th><th style={thStyle}>地政士</th><th style={thStyle}>方案</th><th style={thStyle}>金額</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: INK_SOFT }}>尚無購買記錄</td></tr>}
                {[...transactions].sort((a, b) => b.ts - a.ts).map((t) => {
                  const a = agents.find((ag) => ag.id === t.agentId);
                  return (
                    <tr key={t.id} style={{ borderTop: `1px solid ${PAPER_DEEP}` }}>
                      <td style={tdStyle} className="mono">{new Date(t.ts).toLocaleString("zh-TW")}</td>
                      <td style={tdStyle}>{a ? `${a.name} 地政士` : "（已刪除）"}</td>
                      <td style={tdStyle}>{t.label}</td>
                      <td style={tdStyle} className="mono">NT${t.price}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "messages" && (
        <MessageModerationPanel
          flaggedMessages={flaggedMessages}
          allMessages={allMessagesSorted}
          onDeleteMessage={onDeleteMessage}
          onForceBan={onForceBan}
          onUnban={onUnban}
        />
      )}
    </main>
  );
}

function TabButtonAdmin({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: "9px 16px", borderRadius: 3, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${active ? INK : LINE_C}`, background: active ? INK : "transparent", color: active ? PAPER : INK_SOFT, display: "flex", alignItems: "center" }}>
      {children}
    </button>
  );
}

function MessageModerationPanel({ flaggedMessages, allMessages, onDeleteMessage, onForceBan, onUnban }) {
  const [view, setView] = useState("flagged"); // flagged | all

  const list = view === "flagged" ? flaggedMessages : allMessages;

  return (
    <div>
      {flaggedMessages.length > 0 && (
        <div style={{ background: "#FCEDEB", border: `1px solid ${SEAL}`, borderRadius: 6, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={18} color={SEAL} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13.5, color: SEAL }}>
            <strong>{flaggedMessages.length} 則留言疑似包含聯繫方式</strong>，建議優先檢視下方標記內容。
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <TabButtonAdmin active={view === "flagged"} onClick={() => setView("flagged")}>
          疑似違規（{flaggedMessages.length}）
        </TabButtonAdmin>
        <TabButtonAdmin active={view === "all"} onClick={() => setView("all")}>
          全部留言（{allMessages.length}）
        </TabButtonAdmin>
      </div>

      {list.length === 0 && (
        <div style={{ padding: "30px 0", textAlign: "center", color: INK_SOFT, fontSize: 13.5 }}>
          {view === "flagged" ? "目前沒有疑似違規的留言。" : "目前沒有任何留言。"}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((m) => (
          <div key={`${m.caseId}-${m.agentId}-${m.msgIndex}`} style={{ background: "#fff", border: `1.5px solid ${m.flagged ? SEAL : LINE_C}`, borderRadius: 5, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontSize: 12.5, color: INK_SOFT }}>
                <strong style={{ color: INK }}>{m.from === "customer" ? maskName(m.customerName) : `${m.agentName} 地政士`}</strong>
                {" · "}{m.region} · {m.caseType}
                {m.threadBanned && <span style={{ marginLeft: 8, color: SEAL }}>（對話已禁言）</span>}
              </div>
              <span className="mono" style={{ fontSize: 11, color: "#B8AF96" }}>{new Date(m.ts).toLocaleString("zh-TW")}</span>
            </div>

            {m.flagged && (
              <div style={{ fontSize: 11.5, color: SEAL, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <AlertTriangle size={12} /> 疑似包含聯繫方式
              </div>
            )}

            <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 12px", color: INK, background: PAPER_DEEP, padding: "10px 12px", borderRadius: 4 }}>{m.text}</p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => onDeleteMessage(m.caseId, m.agentId, m.msgIndex)} style={{ padding: "7px 14px", borderRadius: 3, border: `1.5px solid ${SEAL}`, background: "transparent", color: SEAL, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                刪除此則留言
              </button>
              {m.threadBanned ? (
                <button onClick={() => onUnban(m.caseId, m.agentId)} style={{ padding: "7px 14px", borderRadius: 3, border: `1.5px solid ${GOOD}`, background: "transparent", color: GOOD, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  解除此對話禁言
                </button>
              ) : (
                <button onClick={() => onForceBan(m.caseId, m.agentId)} style={{ padding: "7px 14px", borderRadius: 3, border: `1.5px solid ${WARN}`, background: "transparent", color: WARN, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  將此對話設為禁言
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 5, padding: "16px 18px" }}>
      <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: SEAL }}>{value}</div>
    </div>
  );
}

const thStyle = { padding: "10px 14px", fontSize: 12, color: INK_SOFT, fontWeight: 700 };
const tdStyle = { padding: "10px 14px" };

function MyCasesView({ cases, onBack, onOpenCase }) {
  const [contact, setContact] = useState("");
  const [searched, setSearched] = useState(false);
  const results = searched ? cases.filter((c) => c.customerContact && c.customerContact.trim() === contact.trim()) : [];

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 80px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 14, marginBottom: 18, padding: 0 }}>
        <ChevronLeft size={16} /> 返回首頁
      </button>

      <h1 className="serif" style={{ fontWeight: 900, fontSize: 22, margin: "0 0 8px" }}>查詢我的案件</h1>
      <p style={{ fontSize: 13.5, color: INK_SOFT, lineHeight: 1.8, margin: "0 0 20px" }}>
        輸入您發案時填寫的聯繫方式，即可找回您的案件並查看地政士回覆、進行發案確認。
      </p>

      <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={contact}
            onChange={(e) => { setContact(e.target.value); setSearched(false); }}
            placeholder="輸入您發案時填寫的手機號碼或Line ID"
            onKeyDown={(e) => { if (e.key === "Enter") setSearched(true); }}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 3, border: `1px solid ${LINE_C}`, fontSize: 14 }}
          />
          <button onClick={() => setSearched(true)} style={{ padding: "10px 18px", borderRadius: 3, border: "none", background: SEAL, color: PAPER, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            查詢
          </button>
        </div>
      </div>

      {searched && (
        results.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: INK_SOFT, fontSize: 13.5 }}>
            找不到符合的案件，請確認輸入的聯繫方式與發案時填寫的完全一致。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {results.map((c) => {
              const replyCount = Object.values(c.threads || {}).filter((t) => t.hasFirstReply).length;
              const badge = statusBadge(c);
              return (
                <div key={c.id} onClick={() => onOpenCase(c.id)} style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 5, padding: 16, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.region} · {c.caseType}</div>
                    <span style={{ fontSize: 10.5, color: badge.color, border: `1px solid ${badge.color}`, borderRadius: 99, padding: "3px 8px", whiteSpace: "nowrap" }}>{badge.text}</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 8px", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.problemText}</p>
                  <div style={{ fontSize: 12, color: SEAL, fontWeight: 700 }}>{replyCount} 位地政士回覆中 → 點此查看</div>
                </div>
              );
            })}
          </div>
        )
      )}
    </main>
  );
}


function PostCaseView({ onBack, onSubmit }) {
  const [form, setForm] = useState({ customerName: "", customerContact: "", region: "", caseType: "", problemText: "" });
  const valid = form.customerName.trim() && form.customerContact.trim() && form.region && form.caseType && form.problemText.trim();

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "24px 20px 80px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 14, marginBottom: 18, padding: 0 }}>
        <ChevronLeft size={16} /> 返回首頁
      </button>

      <h1 className="serif" style={{ fontWeight: 900, fontSize: 23, margin: "0 0 6px" }}>免費發出案件需求</h1>
      <p style={{ fontSize: 13.5, color: INK_SOFT, lineHeight: 1.8, margin: "0 0 22px" }}>
        您的姓名將以「{form.customerName ? maskName(form.customerName) : "陳○○"}」格式公開顯示，<strong style={{ color: INK }}>您的聯繫方式不會公開</strong>，只有在您與地政士雙方都確認發案後才會解鎖。
      </p>

      <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 24 }}>
        <Field label="您的姓名"><input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="例如：王小明" style={inputStyle} /></Field>
        <Field label="您的聯繫方式（不會公開顯示）">
          <input value={form.customerContact} onChange={(e) => setForm((f) => ({ ...f, customerContact: e.target.value }))} placeholder="手機號碼或Line ID" style={inputStyle} />
          <div style={{ fontSize: 11.5, color: "#B8AF96", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><Lock size={11} /> 僅平台與您本人可見，雙方確認發案後才會提供給接案地政士</div>
        </Field>
        <Field label="案件區域">
          <select value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="">請選擇縣市</option>
            {TAIWAN_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="想辦理的案件類型">
          <select value={form.caseType} onChange={(e) => setForm((f) => ({ ...f, caseType: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="">請選擇案件類型</option>
            {SERVICE_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="案件問題說明">
          <textarea value={form.problemText} onChange={(e) => setForm((f) => ({ ...f, problemText: e.target.value }))} placeholder="請描述您遇到的問題或需求。為防止個資洩漏被詐騙及不肖人士利用，請勿留下電話、Line等聯絡方式" rows={4} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>

        <button disabled={!valid} onClick={() => onSubmit(form)} style={{ width: "100%", padding: "12px 0", borderRadius: 3, border: "none", fontSize: 14.5, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed", background: valid ? SEAL : LINE_C, color: valid ? PAPER : "#9C9588", marginTop: 8 }}>
          公開發出需求
        </button>
      </div>
    </main>
  );
}

function CaseDetailView({ theCase, agents, onBack, onCustomerMessage, onProposeMatch, onRespondMatch, onRequestUnban, viewerRole = "customer" }) {
  const [activeAgentId, setActiveAgentId] = useState(null);
  const [draft, setDraft] = useState("");

  if (!theCase) return null;

  const threadEntries = Object.entries(theCase.threads || {}).filter(([, t]) => t.hasFirstReply);
  const activeThread = activeAgentId ? theCase.threads[activeAgentId] : null;
  const activeAgent = activeAgentId ? agents.find((a) => a.id === activeAgentId) : null;
  const badge = statusBadge(theCase);

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "24px 20px 80px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 14, marginBottom: 18, padding: 0 }}>
        <ChevronLeft size={16} /> 返回首頁
      </button>

      <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 22, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 className="serif" style={{ fontSize: 19, fontWeight: 900, margin: "0 0 4px" }}>{maskName(theCase.customerName)} 的案件需求</h1>
            <div style={{ fontSize: 12.5, color: INK_SOFT }}>{theCase.region} · {theCase.caseType}</div>
          </div>
          <span style={{ fontSize: 11, color: badge.color, border: `1px solid ${badge.color}`, borderRadius: 99, padding: "4px 10px", whiteSpace: "nowrap" }}>{badge.text}</span>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: INK, margin: 0, paddingTop: 12, borderTop: `1px solid ${PAPER_DEEP}` }}>{theCase.problemText}</p>

        {theCase.status === "matched" && activeAgent && (
          <div style={{ marginTop: 14, padding: "12px 14px", background: "#EFF3ED", borderRadius: 4, fontSize: 13, color: GOOD }}>
            已成功媒合！雙方聯繫方式已解鎖，請直接私下接洽後續事宜。
          </div>
        )}
      </div>

      {!activeAgentId ? (
        <>
          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 14px" }}>
            {viewerRole === "customer" ? `已回覆的地政士（${threadEntries.length}）` : `回覆狀況（${threadEntries.length} 位地政士回覆中）`}
          </h3>
          {viewerRole !== "customer" && threadEntries.length > 0 && (
            <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Lock size={12} /> 為保護隱私，您無法看到其他地政士的回覆內容，僅本人（民眾）可見全部回覆
            </div>
          )}
          {threadEntries.length === 0 && <div style={{ fontSize: 13.5, color: INK_SOFT, padding: "20px 0" }}>目前還沒有地政士回覆，請耐心等候。</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {threadEntries.map(([agentId, thread]) => {
              const agent = agents.find((a) => a.id === agentId);
              if (!agent) return null;
              const firstMsg = thread.messages.find((m) => m.from === "agent");
              return (
                <div
                  key={agentId}
                  onClick={() => viewerRole === "customer" && setActiveAgentId(agentId)}
                  style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 5, padding: 16, cursor: viewerRole === "customer" ? "pointer" : "default" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{agent.name} 地政士{viewerRole !== "customer" ? " 回覆中" : ""}</div>
                    {theCase.matchedAgentId === agentId && theCase.status === "pending_match" && (
                      <span style={{ fontSize: 11, color: WARN }}>等待對方確認</span>
                    )}
                  </div>
                  {viewerRole === "customer" ? (
                    <>
                      <p style={{ fontSize: 13, color: INK_SOFT, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{firstMsg?.text}</p>
                      <div style={{ marginTop: 10, fontSize: 12, color: SEAL, fontWeight: 700 }}>查看完整對話 →</div>
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: "#B8AF96", margin: 0 }}>內容僅本人（民眾）可見</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : viewerRole === "customer" ? (
        <ThreadPanel
          theCase={theCase}
          agent={activeAgent}
          thread={activeThread}
          draft={draft}
          setDraft={setDraft}
          onBack={() => { setActiveAgentId(null); setDraft(""); }}
          onSend={async () => {
            if (!draft.trim()) return;
            const ok = await onCustomerMessage(theCase.id, activeAgentId, draft.trim());
            if (ok) setDraft("");
          }}
          onPropose={() => onProposeMatch(theCase.id, activeAgentId)}
          onRespondMatch={onRespondMatch}
          onRequestUnban={() => onRequestUnban(theCase.id, activeAgentId)}
          isCustomerSide
        />
      ) : null}
    </main>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: INK_SOFT, flexShrink: 0, minWidth: 92 }}>{label}：</span>
      <span style={{ color: INK }}>{value || "（未填寫）"}</span>
    </div>
  );
}

function ThreadPanel({ theCase, agent, thread, draft, setDraft, onBack, onSend, onPropose, onRespondMatch, onRequestUnban, isCustomerSide, isAgentSide }) {
  const canPropose = isCustomerSide && theCase.status === "open";
  const isPendingThis = theCase.status === "pending_match" && theCase.matchedAgentId === agent.id;
  const isMatchedThis = theCase.status === "matched" && theCase.matchedAgentId === agent.id;

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 13.5, marginBottom: 14, padding: 0 }}>
        <ChevronLeft size={15} /> 返回列表
      </button>

      <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{agent.name} 地政士</div>
            <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>{(agent.regions || []).join("、")} · {(agent.tags || []).join("、")}</div>
          </div>
          {!isMatchedThis && canPropose && (
            <button onClick={onPropose} style={{ padding: "9px 16px", borderRadius: 3, border: "none", background: SEAL, color: PAPER, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              發案給此地政士
            </button>
          )}
        </div>

        {isMatchedThis && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${PAPER_DEEP}` }}>
            <div style={{ fontSize: 12, color: GOOD, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
              <Lock size={12} /> 已成功媒合，以下為地政士執業資格與聯繫資料
            </div>
            {isCustomerSide ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <InfoRow label="聯繫方式" value={agent.contact} />
                <InfoRow label="執照字號" value={agent.licenseNo} />
                <InfoRow label="地政士證書字號" value={agent.certNo} />
                <InfoRow label="事務所名稱" value={agent.firmName} />
                <InfoRow label="事務所地址" value={agent.firmAddress} />
                <InfoRow label="加入公會名稱" value={agent.guildName} />
              </div>
            ) : (
              <div style={{ fontSize: 13 }}>
                <InfoRow label="聯繫方式" value={theCase.customerContact} />
              </div>
            )}
          </div>
        )}
      </div>

      {isPendingThis && isAgentSide && (
        <div style={{ background: "#FBF3E3", border: `1px solid ${WARN}`, borderRadius: 5, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>{maskName(theCase.customerName)} 已發案給您，是否確認接案？</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onRespondMatch(theCase.id, true)} style={{ flex: 1, padding: "9px 0", borderRadius: 3, border: "none", background: GOOD, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <CheckCircle2 size={15} /> 是，確認接案
            </button>
            <button onClick={() => onRespondMatch(theCase.id, false)} style={{ flex: 1, padding: "9px 0", borderRadius: 3, border: `1.5px solid ${LINE_C}`, background: "#fff", color: INK_SOFT, fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <XCircle size={15} /> 否，目前無法承接
            </button>
          </div>
        </div>
      )}

      {isPendingThis && isCustomerSide && (
        <div style={{ background: "#FBF3E3", border: `1px solid ${WARN}`, borderRadius: 5, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: WARN }}>
          已送出發案邀請，等待地政士確認中…
        </div>
      )}

      {theCase.status === "open" && theCase.declinedAgentIds?.includes(agent.id) && (
        <div style={{ background: PAPER_DEEP, borderRadius: 5, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: INK_SOFT }}>
          該地政士目前案件量較多，暫無法承接，建議您另尋其他適合的地政士。
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {thread.messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.from === "customer" ? "flex-end" : "flex-start", maxWidth: "78%" }}>
            <div style={{ fontSize: 11, color: "#B8AF96", marginBottom: 3, textAlign: m.from === "customer" ? "right" : "left" }}>
              {m.from === "customer" ? maskName(theCase.customerName) : `${agent.name} 地政士`}
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: 8, fontSize: 13.5, lineHeight: 1.6,
              background: m.from === "customer" ? SEAL : "#fff",
              color: m.from === "customer" ? PAPER : INK,
              border: m.from === "customer" ? "none" : `1px solid ${LINE_C}`,
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {thread.banned ? (
        <div style={{ background: "#FCEDEB", border: `1px solid ${SEAL}`, borderRadius: 5, padding: 16, textAlign: "center" }}>
          <AlertTriangle size={20} color={SEAL} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13.5, color: SEAL, fontWeight: 700, marginBottom: 6 }}>此對話因疑似交換聯繫方式已被限制</div>
          <div style={{ fontSize: 12.5, color: INK_SOFT, marginBottom: 12 }}>請提出申請並承諾不再於留言中留下電話或Line，即可恢復對話。</div>
          <button onClick={onRequestUnban} style={{ padding: "8px 18px", borderRadius: 3, border: "none", background: INK, color: PAPER, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            提出申請，承諾遵守規範
          </button>
        </div>
      ) : !isMatchedThis && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="輸入訊息。為防止個資洩漏被詐騙及不肖人士利用，請勿留下電話或Line"
            onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 3, border: `1px solid ${LINE_C}`, fontSize: 13.5 }}
          />
          <button onClick={onSend} style={{ padding: "10px 16px", borderRadius: 3, border: "none", background: INK, color: PAPER, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Send size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function AgentProfileEditor({ agent, onUpdateProfile }) {
  const [form, setForm] = useState({
    contact: agent.contact || "", regions: agent.regions || [], tags: agent.tags || [], bio: agent.bio || "",
    licenseNo: agent.licenseNo || "", certNo: agent.certNo || "", firmName: agent.firmName || "",
    firmAddress: agent.firmAddress || "", guildName: agent.guildName || "",
    certPhoto: agent.certPhoto || null, certPhotoName: agent.certPhotoName || "",
  });
  const [photoError, setPhotoError] = useState("");
  const [saved, setSaved] = useState(false);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("檔案請小於 2MB，建議使用手機拍照後的一般大小照片");
      return;
    }
    setPhotoError("");
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, certPhoto: reader.result, certPhotoName: file.name }));
    reader.readAsDataURL(file);
  };

  const valid = form.contact.trim() && form.regions.length > 0 && form.tags.length > 0
    && form.licenseNo.trim() && form.certNo.trim() && form.firmName.trim() && form.firmAddress.trim() && form.guildName.trim();

  const handleSave = () => {
    onUpdateProfile(agent.id, form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>編輯個人資料</h3>
      <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 18px" }}>
        修改執照字號、證書字號、事務所名稱／地址、加入公會、證書照片等查核相關資料後，查核狀態將重置為「待查核」，需平台管理者重新確認。
      </p>

      <Field label="聯繫方式（手機或Line ID）">
        <input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} style={inputStyle} />
      </Field>
      <Field label="執業地區（可多選）">
        <MultiSelectDropdown options={TAIWAN_REGIONS} selected={form.regions} onChange={(regions) => setForm((f) => ({ ...f, regions }))} placeholder="選擇可服務的縣市" />
      </Field>
      <Field label="服務項目（可多選）">
        <MultiSelectDropdown options={SERVICE_TAGS} selected={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} placeholder="選擇服務項目" />
      </Field>

      <div style={{ borderTop: `1px solid ${PAPER_DEEP}`, paddingTop: 16, marginBottom: 4 }}>
        <div style={{ fontSize: 12.5, color: SURVEY, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <Shield size={13} /> 以下資料為身分查核用，異動後需重新審核
        </div>
      </div>
      <Field label="執照字號">
        <input value={form.licenseNo} onChange={(e) => setForm((f) => ({ ...f, licenseNo: e.target.value }))} placeholder="例如：xx年第xxxxxxx號" style={inputStyle} />
      </Field>
      <Field label="地政士證書字號">
        <input value={form.certNo} onChange={(e) => setForm((f) => ({ ...f, certNo: e.target.value }))} placeholder="例如：xx年第xxxxxxx號" style={inputStyle} />
      </Field>
      <Field label="事務所名稱">
        <input value={form.firmName} onChange={(e) => setForm((f) => ({ ...f, firmName: e.target.value }))} placeholder="例如：xx地政士事務所" style={inputStyle} />
      </Field>
      <Field label="事務所地址">
        <input value={form.firmAddress} onChange={(e) => setForm((f) => ({ ...f, firmAddress: e.target.value }))} placeholder="例如：台北市xx區xx路xx號xx樓" style={inputStyle} />
      </Field>
      <Field label="加入公會名稱">
        <input value={form.guildName} onChange={(e) => setForm((f) => ({ ...f, guildName: e.target.value }))} placeholder="例如：社團法人xx市地政士公會" style={inputStyle} />
      </Field>
      <Field label="地政士證書照片（選填）">
        <label style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "20px 16px", borderRadius: 4, border: `1.5px dashed ${form.certPhoto ? GOOD : LINE_C}`,
          background: form.certPhoto ? "#EFF3ED" : "#fff", cursor: "pointer", fontSize: 13.5,
          color: form.certPhoto ? GOOD : INK_SOFT,
        }}>
          <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />
          {form.certPhoto ? <><Check size={16} /> 已上傳：{form.certPhotoName || "照片"}（點此重新選擇）</> : <>點此選擇照片上傳</>}
        </label>
        {form.certPhoto && (
          <img src={form.certPhoto} alt="地政士證書預覽" style={{ marginTop: 10, maxWidth: "100%", maxHeight: 200, borderRadius: 4, border: `1px solid ${LINE_C}` }} />
        )}
        {photoError && <div style={{ fontSize: 12, color: SEAL, marginTop: 6 }}>{photoError}</div>}
      </Field>

      <Field label="自我介紹（選填）">
        <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
      </Field>

      <button disabled={!valid} onClick={handleSave} style={{ width: "100%", padding: "12px 0", borderRadius: 3, border: "none", fontSize: 14.5, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed", background: valid ? SEAL : LINE_C, color: valid ? PAPER : "#9C9588", marginTop: 8 }}>
        儲存變更
      </button>
      {saved && <div style={{ fontSize: 12.5, color: GOOD, marginTop: 10, textAlign: "center" }}>已儲存變更</div>}
    </div>
  );
}

function AgentConsoleView({ agents, cases, authUser, onBack, onLogout, onAgentReply, onBanThread, onRequestUnban, onRespondMatch, onBuyPoints, onMount, onUpdateProfile }) {
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; onMount && onMount(); }
  }, []);
  const [activeCaseId, setActiveCaseId] = useState(null);
  const [draft, setDraft] = useState("");
  const [showBuy, setShowBuy] = useState(false);
  const [tab, setTab] = useState("cases"); // cases | profile

  const agent = agents.find((a) => a.userId === authUser?.id);
  const selectedAgentId = agent?.id || null;
  const openCases = cases.filter((c) => c.status === "open" || (c.status === "pending_match" && c.matchedAgentId === selectedAgentId) || (c.status === "matched" && c.matchedAgentId === selectedAgentId));

  const activeCase = activeCaseId ? cases.find((c) => c.id === activeCaseId) : null;
  const activeThread = activeCase && selectedAgentId ? (activeCase.threads[selectedAgentId] || { messages: [], hasFirstReply: false, banned: false }) : null;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 14, padding: 0 }}>
          <ChevronLeft size={16} /> 返回首頁
        </button>
        <button onClick={onLogout} style={{ fontSize: 12.5, color: INK_SOFT, background: "none", border: `1px solid ${LINE_C}`, borderRadius: 99, padding: "5px 12px", cursor: "pointer" }}>
          登出
        </button>
      </div>

      {!agent && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: INK_SOFT, fontSize: 13.5, background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6 }}>
          找不到與此帳號對應的地政士資料，請確認您是用登錄時的帳號登入，或聯繫平台管理者協助排查。
        </div>
      )}

      {agent && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 18, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Coins size={20} color={SEAL} />
              <div>
                <div style={{ fontSize: 12, color: INK_SOFT }}>{agent.name} 地政士 · 點數餘額</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{agent.points} 點</div>
              </div>
            </div>
            <button onClick={() => setShowBuy((v) => !v)} style={{ padding: "9px 16px", borderRadius: 3, border: "none", background: SEAL, color: PAPER, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>購買點數</button>
          </div>

          {showBuy && <BuyPointsForm agentId={agent.id} onBuyPoints={onBuyPoints} onClose={() => setShowBuy(false)} />}

          {!activeCaseId && (
            <div style={{ display: "flex", gap: 8, marginTop: 20, marginBottom: 16 }}>
              <TabButtonAdmin active={tab === "cases"} onClick={() => setTab("cases")}>公開案件池</TabButtonAdmin>
              <TabButtonAdmin active={tab === "profile"} onClick={() => setTab("profile")}>
                編輯個人資料{!agent.verified && <span style={{ marginLeft: 6, background: WARN, color: PAPER, borderRadius: 99, padding: "1px 7px", fontSize: 11 }}>待查核</span>}
              </TabButtonAdmin>
            </div>
          )}

          {!activeCaseId ? (
            tab === "cases" ? (
              <>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>公開案件池（{openCases.length}）</h3>
                {openCases.length === 0 && <div style={{ fontSize: 13.5, color: INK_SOFT, padding: "16px 0" }}>目前沒有符合的案件。</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {openCases.map((c) => {
                    const myThread = c.threads[selectedAgentId];
                    const otherRepliers = Object.entries(c.threads || {}).filter(([id, t]) => id !== selectedAgentId && t.hasFirstReply).length;
                    const isPendingMe = c.status === "pending_match" && c.matchedAgentId === selectedAgentId;
                    return (
                      <CasePoolCard
                        key={c.id}
                        theCase={c}
                        myThread={myThread}
                        otherRepliers={otherRepliers}
                        isPendingMe={isPendingMe}
                        agentId={agent.id}
                        onOpenCase={() => setActiveCaseId(c.id)}
                        onAgentReply={onAgentReply}
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <AgentProfileEditor agent={agent} onUpdateProfile={onUpdateProfile} />
            )
          ) : (
            <ThreadPanel
              theCase={activeCase}
              agent={agent}
              thread={activeThread}
              draft={draft}
              setDraft={setDraft}
              onBack={() => { setActiveCaseId(null); setDraft(""); }}
              onSend={async () => {
                if (!draft.trim()) return;
                const ok = await onAgentReply(activeCase.id, agent.id, draft.trim());
                if (ok) setDraft("");
              }}
              onRespondMatch={onRespondMatch}
              onRequestUnban={() => onRequestUnban(activeCase.id, agent.id)}
              isAgentSide
            />
          )}
        </>
      )}
    </main>
  );
}

function CasePoolCard({ theCase: c, myThread, otherRepliers, isPendingMe, agentId, onOpenCase, onAgentReply }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const alreadyReplied = !!myThread?.hasFirstReply;
  const isBanned = !!myThread?.banned;

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const ok = await onAgentReply(c.id, agentId, draft.trim());
    setSending(false);
    if (ok) setDraft("");
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${isPendingMe ? WARN : LINE_C}`, borderRadius: 5, padding: 16 }}>
      <div onClick={onOpenCase} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{maskName(c.customerName)}</div>
            <div style={{ fontSize: 12, color: INK_SOFT }}>{c.region} · {c.caseType}</div>
          </div>
          {isPendingMe && <span style={{ fontSize: 11, color: WARN, border: `1px solid ${WARN}`, borderRadius: 99, padding: "3px 8px" }}>待您確認接案</span>}
        </div>
        <p style={{ fontSize: 13, color: INK_SOFT, margin: "0 0 10px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.problemText}</p>
        <div style={{ fontSize: 11.5, color: "#B8AF96", display: "flex", gap: 12, marginBottom: alreadyReplied || isBanned ? 0 : 10 }}>
          {alreadyReplied ? <span style={{ color: SEAL }}>您已回覆（點此查看完整對話）</span> : <span>尚未回覆</span>}
          {otherRepliers > 0 && <span>另有 {otherRepliers} 位地政士回覆中</span>}
        </div>
      </div>

      {!alreadyReplied && !isBanned && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="直接在這裡輸入回覆內容（送出將扣除1點）。請勿留下電話或Line"
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            style={{ flex: 1, padding: "9px 12px", borderRadius: 3, border: `1px solid ${LINE_C}`, fontSize: 13 }}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            style={{ padding: "9px 14px", borderRadius: 3, border: "none", background: draft.trim() ? SEAL : LINE_C, color: draft.trim() ? PAPER : "#9C9588", fontSize: 12.5, fontWeight: 700, cursor: draft.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
          >
            <Send size={13} /> {sending ? "送出中…" : "回覆並扣點"}
          </button>
        </div>
      )}
    </div>
  );
}

function BuyPointsForm({ agentId, onBuyPoints, onClose }) {
  const [pack, setPack] = useState(null);
  const [last5, setLast5] = useState("");
  const packs = [
    { points: 10, price: 239, label: "10點" },
    { points: 30, price: 689, label: "30點" },
    { points: "unlimited", price: 1099, label: "月費不限量" },
  ];
  const selected = packs.find((p) => p.points === pack);

  return (
    <div style={{ background: "#fff", border: `1.5px solid ${SEAL}`, borderRadius: 6, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>購買回覆點數（匯款核帳）</h4>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: INK_SOFT }}><X size={16} /></button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {packs.map((p) => (
          <button key={p.label} onClick={() => setPack(p.points)} style={{ flex: "1 1 100px", padding: "12px 10px", borderRadius: 4, cursor: "pointer", textAlign: "center", border: `1.5px solid ${pack === p.points ? SEAL : LINE_C}`, background: pack === p.points ? "#FBF0EE" : "#fff" }}>
            <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{p.label}</div>
            <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 4 }}>NT$ {p.price}{p.points === "unlimited" ? "/月" : ""}</div>
          </button>
        ))}
      </div>
      {pack === "unlimited" && (
        <div style={{ fontSize: 12, color: SURVEY, marginBottom: 14, background: PAPER_DEEP, padding: "8px 12px", borderRadius: 4 }}>
          月費方案為當月不限次數回覆，次月需重新繳費續用。
        </div>
      )}
      <div style={{ background: PAPER_DEEP, borderRadius: 4, padding: "14px 16px", marginBottom: 14, fontSize: 13, lineHeight: 1.8, color: INK_SOFT }}>
        請匯款至：<strong className="mono" style={{ color: INK }}>(示範) 國泰世華 013 1234567890123</strong>
        <br />戶名：桓宸資訊有限公司（籌備中）
        <br />匯款完成後，請填寫匯款帳號末5碼，我們將於核對入帳後為您加值點數。
      </div>
      <input value={last5} onChange={(e) => setLast5(e.target.value)} placeholder="匯款帳號末5碼" maxLength={5} style={{ width: "100%", padding: "9px 12px", borderRadius: 3, border: `1px solid ${LINE_C}`, fontSize: 13.5, marginBottom: 12 }} />
      <button
        disabled={!pack}
        onClick={() => {
          if (!pack || last5.trim().length < 4) return;
          onBuyPoints(agentId, selected);
          onClose();
        }}
        style={{ width: "100%", padding: "11px 0", borderRadius: 3, border: "none", background: pack ? SEAL : LINE_C, color: pack ? PAPER : "#9C9588", fontSize: 14, fontWeight: 700, cursor: pack ? "pointer" : "not-allowed" }}
      >
        送出購買申請
      </button>
      <div style={{ fontSize: 11, color: "#B8AF96", marginTop: 8, textAlign: "center" }}>示範流程：送出後將直接模擬核帳完成並加值點數</div>
    </div>
  );
}

function JoinView({ onBack, onSubmit }) {
  const [form, setForm] = useState({
    name: "", contact: "", regions: [], tags: [], bio: "",
    licenseNo: "", certNo: "", firmName: "", firmAddress: "", guildName: "", certPhoto: null,
    email: "", password: "",
  });
  const [photoError, setPhotoError] = useState("");
  const validEmail = /\S+@\S+\.\S+/.test(form.email.trim());
  const valid = form.name.trim() && form.contact.trim() && form.regions.length > 0 && form.tags.length > 0
    && form.licenseNo.trim() && form.certNo.trim() && form.firmName.trim() && form.firmAddress.trim() && form.guildName.trim()
    && validEmail && form.password.length >= 6;

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("檔案請小於 2MB，建議使用手機拍照後的一般大小照片");
      return;
    }
    setPhotoError("");
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, certPhoto: reader.result, certPhotoName: file.name }));
    reader.readAsDataURL(file);
  };

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "24px 20px 80px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: INK_SOFT, fontSize: 14, marginBottom: 18, padding: 0 }}>
        <ChevronLeft size={16} /> 返回首頁
      </button>

      <h1 className="serif" style={{ fontWeight: 900, fontSize: 23, margin: "0 0 6px" }}>地政士（代書）免費登錄</h1>
      <div style={{ fontSize: 13, color: GOOD, background: "#EFF3ED", display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 99, margin: "8px 0 18px" }}>
        <Coins size={14} /> 完成登錄立即贈送點數作為回覆額度
      </div>
      <p style={{ fontSize: 13.5, color: INK_SOFT, lineHeight: 1.8, margin: "0 0 22px" }}>
        登錄完全免費，您的個人資料頁面上架後即可在公開案件池中看到民眾需求並回覆。不會顯示您的電話或Line，所有聯絡都透過平台留言進行。
      </p>

      <div style={{ background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 6, padding: 24 }}>
        <Field label="姓名 / 稱呼"><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="例如：王○○" style={inputStyle} /></Field>
        <Field label="登入用 Email">
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="用於登入地政士後台，請填寫常用信箱" style={inputStyle} />
        </Field>
        <Field label="登入密碼（至少6碼）">
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="設定一組密碼，之後登入後台使用" style={inputStyle} />
        </Field>
        <Field label="聯繫方式（手機或Line ID）">
          <input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} placeholder="手機號碼或Line ID" style={inputStyle} />
          <div style={{ fontSize: 11.5, color: "#B8AF96", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><Lock size={11} /> 不會公開顯示，僅在案件媒合成功、雙方確認後提供給該位委託民眾</div>
        </Field>
        <Field label="執業地區（可多選）">
          <MultiSelectDropdown options={TAIWAN_REGIONS} selected={form.regions} onChange={(regions) => setForm((f) => ({ ...f, regions }))} placeholder="選擇可服務的縣市" />
        </Field>
        <Field label="服務項目（可多選）">
          <MultiSelectDropdown options={SERVICE_TAGS} selected={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} placeholder="選擇服務項目" />
        </Field>

        <div style={{ borderTop: `1px solid ${PAPER_DEEP}`, paddingTop: 16, marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, color: SURVEY, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <Shield size={13} /> 以下資料用於身分查核，僅在案件媒合成功後提供給該位委託民眾
          </div>
        </div>
        <Field label="執照字號">
          <input value={form.licenseNo} onChange={(e) => setForm((f) => ({ ...f, licenseNo: e.target.value }))} placeholder="例如：xx年第xxxxxxx號" style={inputStyle} />
        </Field>
        <Field label="地政士證書字號">
          <input value={form.certNo} onChange={(e) => setForm((f) => ({ ...f, certNo: e.target.value }))} placeholder="例如：xx年第xxxxxxx號" style={inputStyle} />
        </Field>
        <Field label="事務所名稱">
          <input value={form.firmName} onChange={(e) => setForm((f) => ({ ...f, firmName: e.target.value }))} placeholder="例如：xx地政士事務所" style={inputStyle} />
        </Field>
        <Field label="事務所地址">
          <input value={form.firmAddress} onChange={(e) => setForm((f) => ({ ...f, firmAddress: e.target.value }))} placeholder="例如：台北市xx區xx路xx號xx樓" style={inputStyle} />
        </Field>
        <Field label="加入公會名稱">
          <input value={form.guildName} onChange={(e) => setForm((f) => ({ ...f, guildName: e.target.value }))} placeholder="例如：社團法人xx市地政士公會" style={inputStyle} />
        </Field>
        <Field label="上傳地政士證書照片（選填，可候補上傳）">
          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "20px 16px", borderRadius: 4, border: `1.5px dashed ${form.certPhoto ? GOOD : LINE_C}`,
            background: form.certPhoto ? "#EFF3ED" : "#fff", cursor: "pointer", fontSize: 13.5,
            color: form.certPhoto ? GOOD : INK_SOFT,
          }}>
            <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />
            {form.certPhoto ? <><Check size={16} /> 已上傳：{form.certPhotoName}（點此重新選擇）</> : <>點此選擇照片上傳</>}
          </label>
          {form.certPhoto && (
            <img src={form.certPhoto} alt="地政士證書預覽" style={{ marginTop: 10, maxWidth: "100%", maxHeight: 200, borderRadius: 4, border: `1px solid ${LINE_C}` }} />
          )}
          {photoError && <div style={{ fontSize: 12, color: SEAL, marginTop: 6 }}>{photoError}</div>}
          <div style={{ fontSize: 11.5, color: "#B8AF96", marginTop: 6 }}>此欄位為選填，您可以先完成登錄，之後再回來補上傳。建議上傳地政士證書或執業執照照片，僅供平台管理者核對身分使用，不會公開顯示。以上資料將由平台管理者比對內政部地政士查詢系統後標記為「已查核」</div>
        </Field>

        <Field label="自我介紹（選填）">
          <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} placeholder="簡述執業經驗、專長領域" rows={4} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>
        <button disabled={!valid} onClick={() => onSubmit(form)} style={{ width: "100%", padding: "12px 0", borderRadius: 3, border: "none", fontSize: 14.5, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed", background: valid ? SEAL : LINE_C, color: valid ? PAPER : "#9C9588", marginTop: 8 }}>
          完成免費登錄，立即獲得點數
        </button>
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8, color: INK }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${LINE_C}`, fontSize: 14 };

function MultiSelectDropdown({ options, selected, onChange, placeholder, style }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  const label = selected.length === 0 ? placeholder : selected.length <= 2 ? selected.join("、") : `已選 ${selected.length} 項`;

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1.5px solid ${INK}`, background: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: selected.length === 0 ? "#9C9588" : INK, textAlign: "left" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <ChevronDown size={16} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, background: "#fff", border: `1px solid ${LINE_C}`, borderRadius: 4, boxShadow: "0 14px 30px -10px rgba(31,36,32,0.25)", maxHeight: 260, overflowY: "auto" }}>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} style={{ width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 12.5, color: SEAL, background: "none", border: "none", borderBottom: `1px solid ${PAPER_DEEP}`, cursor: "pointer" }}>清空選擇</button>
          )}
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 13.5, cursor: "pointer", background: checked ? "#FBF0EE" : "transparent" }}>
                <span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${checked ? SEAL : LINE_C}`, background: checked ? SEAL : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
